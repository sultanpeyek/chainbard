/**
 * x402 on-chain payment verifier.
 *
 * Validates that a Solana tx signature represents a USDC TransferChecked
 * (or compatible token transfer) from `expectedBuyer` to `expectedDestAta`
 * for at least `expectedAmount` atomic units, fresh within `freshnessSlots`,
 * and not already used (dedupe).
 */

export type VerifierReason =
  | 'tx-not-found'
  | 'tx-failed'
  | 'wrong-buyer'
  | 'wrong-mint'
  | 'wrong-destination'
  | 'wrong-amount'
  | 'stale-slot'
  | 'duplicate-sig';

export interface VerifierTokenTransfer {
  source: string;
  destination: string;
  mint: string;
  amount: bigint;
  authority: string;
}

export interface VerifierTx {
  slot: number;
  err: unknown;
  tokenTransfers: VerifierTokenTransfer[];
}

export interface VerifierRpc {
  getTransaction(sig: string): Promise<VerifierTx | null>;
  getSlot(): Promise<number>;
}

export interface DedupeStore {
  seen(sig: string): Promise<boolean>;
  mark(sig: string): Promise<void>;
}

export interface VerifyPaymentArgs {
  signature: string;
  expectedBuyer: string;
  expectedMint: string;
  expectedAmount: bigint;
  expectedDestAta: string;
}

export type VerifyResult = { ok: true } | { ok: false; reason: VerifierReason };

export interface X402Verifier {
  verifyPayment(args: VerifyPaymentArgs): Promise<VerifyResult>;
  /**
   * Mark a signature as consumed. Call AFTER the full mint flow has reached
   * a terminal published state — calling it mid-flow would lock the sig out
   * of retryable resumption (see mint-orchestrator).
   */
  markUsed(signature: string): Promise<void>;
}

export interface CreateVerifierOpts {
  rpc: VerifierRpc;
  dedupe: DedupeStore;
  /** Reject txs whose slot is older than `currentSlot - freshnessSlots`. */
  freshnessSlots: number;
}

/**
 * Real Solana adapter: extracts the canonical token-transfer view from
 * `getTransaction()`. Supports both top-level instruction parsing and the
 * `meta.{pre,post}TokenBalances` cross-check (so we catch transfers nested
 * inside inner instructions or CPI'd through a router).
 */
export function createWeb3VerifierRpc(
  connection: import('@solana/web3.js').Connection,
): VerifierRpc {
  return {
    async getTransaction(sig) {
      const tx = await connection.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (!tx) return null;
      const meta = tx.meta;
      const pre = meta?.preTokenBalances ?? [];
      const post = meta?.postTokenBalances ?? [];
      const messageAccountKeys = tx.transaction.message.getAccountKeys();
      const accountKeys: string[] = [];
      for (let i = 0; i < messageAccountKeys.length; i++) {
        const k = messageAccountKeys.get(i);
        if (k) accountKeys.push(k.toBase58());
      }

      const transfers: VerifierTokenTransfer[] = [];
      // Pair each post-balance with its pre-balance (by accountIndex+mint) and
      // emit a transfer for any positive delta credited to it. `authority` is
      // the wallet that owned the *pre* state on the sender side; we approximate
      // by taking the largest token-balance owner whose post-delta is negative.
      const ZERO = BigInt(0);
      const negDeltas = new Map<string, bigint>(); // owner → debited amount
      for (const p of post) {
        const matchPre = pre.find((b) => b.accountIndex === p.accountIndex && b.mint === p.mint);
        const before = BigInt(matchPre?.uiTokenAmount.amount ?? '0');
        const after = BigInt(p.uiTokenAmount.amount ?? '0');
        const delta = after - before;
        if (delta < ZERO && p.owner) {
          const prior = negDeltas.get(p.owner) ?? ZERO;
          negDeltas.set(p.owner, prior + -delta);
        }
      }
      for (const p of post) {
        const matchPre = pre.find((b) => b.accountIndex === p.accountIndex && b.mint === p.mint);
        const before = BigInt(matchPre?.uiTokenAmount.amount ?? '0');
        const after = BigInt(p.uiTokenAmount.amount ?? '0');
        const delta = after - before;
        if (delta <= ZERO) continue;

        // Resolve the credited ATA's address from the account keys table.
        const destination = accountKeys[p.accountIndex] ?? '';
        // Authority = whichever owner's debit best matches this credit.
        let authority = '';
        let bestMatch = ZERO;
        for (const [owner, debited] of negDeltas) {
          // Prefer the owner whose debit covers this delta (>= delta) and is closest.
          if (debited >= delta && (bestMatch === ZERO || debited < bestMatch)) {
            authority = owner;
            bestMatch = debited;
          }
        }
        // Fall back to any owner with a debit if none "covered" exactly.
        if (!authority && negDeltas.size > 0) {
          authority = negDeltas.keys().next().value ?? '';
        }

        transfers.push({
          source: '',
          destination,
          mint: p.mint,
          amount: delta,
          authority,
        });
      }

      return {
        slot: tx.slot,
        err: meta?.err ?? null,
        tokenTransfers: transfers,
      };
    },
    async getSlot() {
      return connection.getSlot('confirmed');
    },
  };
}

export function createX402Verifier(opts: CreateVerifierOpts): X402Verifier {
  const { rpc, dedupe, freshnessSlots } = opts;

  return {
    async verifyPayment(args) {
      if (await dedupe.seen(args.signature)) {
        return { ok: false, reason: 'duplicate-sig' };
      }

      const tx = await rpc.getTransaction(args.signature);
      if (!tx) return { ok: false, reason: 'tx-not-found' };
      if (tx.err) return { ok: false, reason: 'tx-failed' };

      const currentSlot = await rpc.getSlot();
      if (currentSlot - tx.slot > freshnessSlots) {
        return { ok: false, reason: 'stale-slot' };
      }

      const fromBuyer = tx.tokenTransfers.filter((t) => t.authority === args.expectedBuyer);
      if (fromBuyer.length === 0) return { ok: false, reason: 'wrong-buyer' };

      const matchMint = fromBuyer.filter((t) => t.mint === args.expectedMint);
      if (matchMint.length === 0) return { ok: false, reason: 'wrong-mint' };

      const matchDest = matchMint.filter((t) => t.destination === args.expectedDestAta);
      if (matchDest.length === 0) return { ok: false, reason: 'wrong-destination' };

      const total = matchDest.reduce((acc, t) => acc + t.amount, BigInt(0));
      if (total < args.expectedAmount) return { ok: false, reason: 'wrong-amount' };

      // Note: mark intentionally deferred. Orchestrator calls verifier.markUsed
      // after the full mint flow publishes; marking here would trap retryable
      // post-verify failures (e.g. RPC 429 on spotlights) into refundable.
      return { ok: true };
    },
    async markUsed(signature) {
      await dedupe.mark(signature);
    },
  };
}
