/**
 * SAP Memo v2 receipt writer.
 *
 * Writes one SPL Memo entry per reactive mint summarising the off-chain work
 * the buyer paid for. The SAP escrow `settle_calls_v2` flow is broken upstream
 * on deployed v0.18 (see project memory `sap-sdk-idl-mismatch`), so v1 uses
 * the SPL Memo program directly as the on-chain receipt.
 */

import {
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

export const SPL_MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export interface MemoArgs {
  inputHash: string;
  storyHash: string;
  briefHash: string;
  aceReceipts: string[];
  paymentSig: string;
  timestamp: number;
}

export interface MemoPayload extends MemoArgs {
  v: 2;
  kind: 'chainbard.mint';
}

export interface SapMemoWriter {
  writeMemo(args: MemoArgs): Promise<string>;
}

export interface SapMemoWriterOpts {
  sendMemo(payload: string): Promise<string>;
}

export function serializeMemoPayload(args: MemoArgs): string {
  const payload: MemoPayload = { v: 2, kind: 'chainbard.mint', ...args };
  return JSON.stringify(payload);
}

export function parseMemoPayload(raw: string): MemoPayload {
  const parsed = JSON.parse(raw) as Partial<MemoPayload>;
  const required = [
    'inputHash',
    'storyHash',
    'briefHash',
    'aceReceipts',
    'paymentSig',
    'timestamp',
  ] as const;
  for (const k of required) {
    if (parsed[k] === undefined) throw new Error(`memo payload missing field: ${k}`);
  }
  return { v: 2, kind: 'chainbard.mint', ...(parsed as MemoArgs) };
}

export function createSapMemoWriter(opts: SapMemoWriterOpts): SapMemoWriter {
  return {
    async writeMemo(args) {
      const payload = serializeMemoPayload(args);
      return opts.sendMemo(payload);
    },
  };
}

/**
 * Real Solana sender: signs an SPL Memo tx with `agent` and broadcasts.
 * Memo program accepts a single signer key when included in `keys`.
 */
/**
 * SPL-Memo CU scales ~linearly with payload bytes because the program
 * debug-logs the whole memo (`msg!("Memo (len {}): {:?}", ..)`). Measured on
 * mainnet: ~16k base + ~350 CU/byte (638B → 239k CU), which blows the 200k
 * default and aborts with `ProgramFailedToComplete`. Size the limit from the
 * payload (with ~40% headroom) instead of a blanket 1.4M so the tx requests
 * only what it needs and still fits as `aceReceipts` grows. Capped at the
 * 1.4M per-tx max.
 */
const MEMO_CU_BASE = 30_000;
const MEMO_CU_PER_BYTE = 500;
const MAX_TX_CU = 1_400_000;

// Priority-fee estimate bounds (µLamports per CU). FLOOR keeps the tx above the
// dead-letter zone even on an idle network; CAP bounds the worst case (at the
// memo's ~350k CU, 250k µLamports ≈ 0.0000875 SOL of priority).
const PRIORITY_FEE_FLOOR = 5_000;
const PRIORITY_FEE_CAP = 250_000;
const PRIORITY_FEE_PERCENTILE = 75;

/**
 * Network-wide priority-fee estimate via the standard `getRecentPrioritizationFees`
 * RPC (works on any provider — Helius, Triton, public — not a Helius-only method).
 * Takes a high percentile of the recent non-zero fees so the memo lands under
 * congestion, clamped to [FLOOR, CAP]. Falls back to FLOOR on any RPC error or
 * empty sample. Queried fresh per send since congestion moves slot-to-slot.
 */
export async function estimatePriorityFee(connection: Connection): Promise<number> {
  try {
    const recent = await connection.getRecentPrioritizationFees();
    const fees = recent
      .map((r) => r.prioritizationFee)
      .filter((f) => f > 0)
      .sort((a, b) => a - b);
    if (fees.length === 0) return PRIORITY_FEE_FLOOR;
    const idx = Math.min(
      fees.length - 1,
      Math.floor((PRIORITY_FEE_PERCENTILE / 100) * fees.length),
    );
    return Math.min(PRIORITY_FEE_CAP, Math.max(PRIORITY_FEE_FLOOR, fees[idx]));
  } catch {
    return PRIORITY_FEE_FLOOR;
  }
}

// Buyer-blocking confirm budget for the memo receipt. Kept short so the mint
// "finish" stays fast; on a transaction-capable RPC the memo lands within a few
// seconds. On timeout we THROW (never return an unconfirmed sig) so the
// orchestrator marks the run `retryable` → the buyer gets a Resume rather than a
// dead explorer link.
const MEMO_CONFIRM_TIMEOUT_MS = 20_000;

export function memoComputeUnitLimit(payload: string): number {
  const bytes = Buffer.byteLength(payload, 'utf8');
  return Math.min(MAX_TX_CU, MEMO_CU_BASE + bytes * MEMO_CU_PER_BYTE);
}

export function createMemoSender(
  connection: Connection,
  agent: Keypair,
  opts: { computeUnitPriceMicroLamports?: number } = {},
): SapMemoWriterOpts {
  return {
    async sendMemo(payload) {
      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: memoComputeUnitLimit(payload) }));
      // Explicit override wins; otherwise estimate live network congestion so the
      // memo lands without a hand-tuned constant.
      const microLamports =
        opts.computeUnitPriceMicroLamports ?? (await estimatePriorityFee(connection));
      if (microLamports > 0) {
        tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
      }
      tx.add(
        new TransactionInstruction({
          programId: SPL_MEMO_PROGRAM_ID,
          keys: [{ pubkey: agent.publicKey, isSigner: true, isWritable: false }],
          data: Buffer.from(payload, 'utf8'),
        }),
      );
      tx.feePayer = agent.publicKey;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.sign(agent);
      // The memo tx is a single trivial instruction; skip preflight (some RPCs
      // reject it, and there is nothing to simulate). `connection` must be a
      // transaction-capable RPC — a DAS/read endpoint (e.g. Synapse) accepts the
      // send but never propagates it to a leader, stranding the memo off-chain.
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });
      // Only a CONFIRMED signature is a valid receipt. Poll the sender RPC for up
      // to MEMO_CONFIRM_TIMEOUT_MS; return the sig once it lands, throw otherwise.
      // Never return an unconfirmed sig — it would be saved + surfaced as a dead
      // explorer link ("unable to locate this tx hash") for a tx that never
      // reached a leader. A throw pushes the mint to `retryable`, so the buyer
      // gets a Resume (their story is already persisted) instead of a broken seal.
      const deadline = Date.now() + MEMO_CONFIRM_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const { value } = await connection.getSignatureStatus(sig, {
          searchTransactionHistory: true,
        });
        if (value?.err) {
          throw new Error(`memo tx failed on-chain: ${JSON.stringify(value.err)} (sig ${sig})`);
        }
        if (
          value?.confirmationStatus === 'confirmed' ||
          value?.confirmationStatus === 'finalized'
        ) {
          return sig;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      throw new Error(`memo not confirmed within ${MEMO_CONFIRM_TIMEOUT_MS}ms (sig ${sig})`);
    },
  };
}
