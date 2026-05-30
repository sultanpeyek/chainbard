/**
 * x402 payment envelope builder — BROWSER side of the reactive mint.
 *
 * Given a 402 `accepts[]` requirement, compiles the buyer's partial-signed USDC
 * transfer exactly as scripts/test-x402-payment.ts does (the recipe proven
 * against the live AceData facilitator), hands it to the wallet-standard signer,
 * and packs the signed tx into the base64 X-Payment header the mint route reads.
 *
 * Recipe (must match the reference):
 *   ComputeBudget setComputeUnitLimit(100_000) + setComputeUnitPrice(5000),
 *   createAssociatedTokenAccountIdempotentInstruction (rent payer = buyer),
 *   createTransferCheckedInstruction(buyerAta, mint, payToAta, buyer, amount, 6).
 *   TransactionMessage.payerKey = facilitator (requirements.extra.feePayer);
 *   the buyer is the token authority and the only signer the wallet provides.
 *
 * ONE deliberate deviation from the reference: the envelope uses
 * `payload.transaction` (NOT `payload.serializedTransaction`) — that is the field
 * the live route's decodeEnvelope reads.
 */

import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  type Commitment,
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

export interface X402Requirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  /** USDC mint. */
  asset: string;
  extra: { decimals: number; feePayer: string };
}

export interface X402BuilderConnection {
  getLatestBlockhash(commitment?: Commitment): Promise<{ blockhash: string }>;
  simulateTransaction(
    tx: VersionedTransaction,
    config?: { sigVerify?: boolean; replaceRecentBlockhash?: boolean },
  ): Promise<{ value: { err: unknown; logs?: string[] | null } }>;
}

export interface BuildX402EnvelopeArgs {
  requirements: X402Requirements;
  /** Wallet-standard signer (useWallet().signTransaction). Signs, never broadcasts. */
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  /** Token authority — the buyer paying USDC. */
  buyerPubkey: PublicKey;
  connection: X402BuilderConnection;
}

export async function buildX402Envelope(args: BuildX402EnvelopeArgs): Promise<string> {
  const { requirements, signTransaction, buyerPubkey, connection } = args;

  const amount = BigInt(requirements.maxAmountRequired);
  const facilitatorPubkey = new PublicKey(requirements.extra.feePayer);
  const payToPubkey = new PublicKey(requirements.payTo);
  const usdcMint = new PublicKey(requirements.asset);

  const buyerAta = getAssociatedTokenAddressSync(usdcMint, buyerPubkey);
  const payToAta = getAssociatedTokenAddressSync(usdcMint, payToPubkey);
  // 'confirmed' yields a fresher blockhash than the Connection's default
  // 'finalized' commitment → more validity headroom so the facilitator can
  // broadcast before the ~150-slot window lapses (avoids "blockhash expired").
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
    // Rent payer = buyer, mirroring the reference (facilitator only covers the fee).
    createAssociatedTokenAccountIdempotentInstruction(buyerPubkey, payToAta, payToPubkey, usdcMint),
    createTransferCheckedInstruction(
      buyerAta,
      usdcMint,
      payToAta,
      buyerPubkey,
      amount,
      requirements.extra.decimals,
    ),
  ];

  const messageV0 = new TransactionMessage({
    payerKey: facilitatorPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const unsigned = new VersionedTransaction(messageV0);

  // DRY-RUN before the wallet prompt: a PRE-payment failure here throws before
  // signTransaction, so no wallet prompt and no charge. Thrown messages are
  // shaped for classifyThrown (src/hooks/use-mint.ts).
  const sim = await connection.simulateTransaction(unsigned, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  if (sim.value.err !== null) {
    const logs = sim.value.logs ?? [];
    if (logs.some((l) => /insufficient/i.test(l))) {
      throw new Error('simulation failed: insufficient funds');
    }
    throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)}`);
  }

  const signed = await signTransaction(unsigned);

  const serialized = Buffer.from(signed.serialize()).toString('base64');
  const envelope = {
    x402Version: 2,
    scheme: requirements.scheme,
    network: requirements.network,
    payload: { transaction: serialized },
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
}
