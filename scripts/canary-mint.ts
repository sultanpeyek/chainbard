/**
 * Canary buyer-paid wallet mint against chainbard prod.
 *
 * Hits POST /api/mint/story on `https://chainbard.vercel.app`, settling a
 * USDC TransferChecked payment of `MINT_PRICE_USDC` (default 0.30) from the
 * local buyer keypair to the registered AGENT_WALLET. Unlike test-x402-payment
 * (which uses the AceData facilitator and ships a serializedTransaction in the
 * x-payment envelope), chainbard's mint route is buyer-broadcast: we send the
 * USDC transfer ourselves, then POST the resulting tx signature inside the
 * envelope payload.
 *
 * Defaults to DRY-RUN (probe 402 only, no payment).
 * Add --send to actually pay + mint (~0.30 USDC + a few thousand lamports SOL).
 *
 * Required env:
 *   NEXT_PUBLIC_AGENT_WALLET agent pubkey receiving USDC (base58)
 *   SOLANA_RPC_URL           mainnet send RPC (falls back to public mainnet)
 *
 * Optional env:
 *   MINT_ENDPOINT            default https://chainbard.vercel.app/api/mint/story
 *   USDC_MINT                default mainnet USDC EPjFW…Dt1v
 *   MINT_PRICE_USDC          default 0.30
 *
 * Buyer keypair: `keys/buyer.json` (generated/funded by scripts/fund-buyer.ts).
 *
 * Usage:
 *   bun run scripts/canary-mint.ts            # dry-run probe
 *   bun run scripts/canary-mint.ts --send     # full canary: pay + mint
 */

import { readFileSync } from 'node:fs';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { env, mintEndpoint, resolveSendRpcUrl, rpcHost } from '../src/env/cli';

const SEND = process.argv.includes('--send');

const ENDPOINT = mintEndpoint();
const RPC_URL = resolveSendRpcUrl(env.SOLANA_RPC_URL);
const USDC_MINT = env.USDC_MINT;
const PRICE_USDC = env.MINT_PRICE_USDC;
const PRICE_ATOMIC = BigInt(Math.round(PRICE_USDC * 1_000_000));
const BUYER_KEY_PATH = 'keys/buyer.json';

interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  extra?: { decimals?: number };
}

interface Body402 {
  accepts: PaymentRequirement[];
}

interface MintOk {
  ok: true;
  state: string;
  story: { title?: string; subtitle?: string };
  memoSig?: string;
  paymentSig: string;
  shareUrl: string;
}

function loadBuyer(): Keypair {
  let raw: string;
  try {
    raw = readFileSync(BUYER_KEY_PATH, 'utf8');
  } catch (err) {
    console.error(`✗ Cannot read ${BUYER_KEY_PATH}: ${(err as Error).message}`);
    console.error('  Run: bun run scripts/fund-buyer.ts --send  to provision.');
    process.exit(1);
  }
  const arr = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function preflightBalances(
  connection: Connection,
  buyer: Keypair,
  agentDestAta: PublicKey,
): Promise<void> {
  const buyerAta = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), buyer.publicKey);
  const [solLamports, usdcInfo, destInfo] = await Promise.all([
    connection.getBalance(buyer.publicKey, 'confirmed'),
    connection.getTokenAccountBalance(buyerAta).catch(() => null),
    connection.getAccountInfo(agentDestAta, 'confirmed'),
  ]);
  const usdcAtomic = BigInt(usdcInfo?.value.amount ?? '0');
  const destAtaExists = !!destInfo;

  const minSol = destAtaExists ? 10_000 : 2_050_000; // 0.00001 SOL fee || + 0.00203 rent
  console.log('─── Pre-flight ─────────────────────────────────────────');
  console.log(`  Buyer:        ${buyer.publicKey.toBase58()}`);
  console.log(`  USDC ATA:     ${buyerAta.toBase58()}`);
  console.log(
    `  USDC bal:     ${(Number(usdcAtomic) / 1e6).toFixed(6)} (need ${(
      Number(PRICE_ATOMIC) / 1e6
    ).toFixed(6)})`,
  );
  console.log(`  SOL bal:      ${(solLamports / 1e9).toFixed(9)} (need ~${minSol / 1e9})`);
  console.log(
    `  Dest ATA:     ${agentDestAta.toBase58()} (${destAtaExists ? 'exists' : 'WILL CREATE — +0.00203 SOL rent'})`,
  );
  console.log();

  if (!SEND) return; // dry-run skips hard fails
  if (usdcAtomic < PRICE_ATOMIC) {
    console.error(`✗ Insufficient USDC: need ${PRICE_ATOMIC}, have ${usdcAtomic}`);
    process.exit(1);
  }
  if (solLamports < minSol) {
    console.error(`✗ Insufficient SOL: need ~${minSol}, have ${solLamports}`);
    process.exit(1);
  }
}

async function probe402(input: string, buyer: string): Promise<Body402> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, buyer }),
  });
  if (res.status !== 402) {
    const txt = await res.text();
    throw new Error(`expected 402, got ${res.status}: ${txt.slice(0, 400)}`);
  }
  return (await res.json()) as Body402;
}

async function broadcastPayment(
  connection: Connection,
  buyer: Keypair,
  req: PaymentRequirement,
): Promise<string> {
  const amount = BigInt(req.maxAmountRequired);
  const payToPubkey = new PublicKey(req.payTo);
  const usdcMint = new PublicKey(req.asset);

  const payerAta = await getAssociatedTokenAddress(usdcMint, buyer.publicKey);
  const payToAta = await getAssociatedTokenAddress(usdcMint, payToPubkey);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      buyer.publicKey,
      payToAta,
      payToPubkey,
      usdcMint,
    ),
    createTransferCheckedInstruction(payerAta, usdcMint, payToAta, buyer.publicKey, amount, 6),
  ];

  const messageV0 = new TransactionMessage({
    payerKey: buyer.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([buyer]);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  console.log(`  Broadcast:    ${sig}`);
  console.log(`  Solscan:      https://solscan.io/tx/${sig}`);
  console.log('  Awaiting confirmation…');

  const confirm = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  if (confirm.value.err) {
    throw new Error(`tx failed on-chain: ${JSON.stringify(confirm.value.err)}`);
  }
  console.log('  ✓ Confirmed.');
  return sig;
}

async function postMint(
  input: string,
  buyer: string,
  paymentSig: string,
): Promise<{ status: number; data: MintOk | { error?: string; reason?: string } }> {
  const envelope = {
    x402Version: 2,
    scheme: 'exact',
    network: 'solana',
    payload: { signature: paymentSig },
  };
  const xPayment = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment': xPayment },
    body: JSON.stringify({ input, buyer }),
  });
  const text = await res.text();
  let data: MintOk | { error?: string; reason?: string };
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 600) };
  }
  return { status: res.status, data };
}

async function main() {
  const buyer = loadBuyer();
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  chainbard canary buyer-paid wallet mint');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:         ${SEND ? '🔴 SEND (real USDC)' : '🟢 DRY-RUN (probe only)'}`);
  console.log(`  Endpoint:     ${ENDPOINT}`);
  console.log(`  RPC host:     ${rpcHost(RPC_URL)}`);
  console.log();

  const buyerPub = buyer.publicKey.toBase58();
  // User chose: render the buyer wallet itself.
  const input = buyerPub;

  // Probe 402 to read the canonical accepts[] (price + payTo + asset).
  console.log('─── Probe 402 ──────────────────────────────────────────');
  const body402 = await probe402(input, buyerPub);
  const solReq = body402.accepts.find((a) => a.network === 'solana');
  if (!solReq) {
    console.error('✗ No solana payment requirement in 402 accepts[]');
    process.exit(1);
  }
  console.log(
    `  Price:        ${(Number(BigInt(solReq.maxAmountRequired)) / 1e6).toFixed(6)} USDC`,
  );
  console.log(`  payTo:        ${solReq.payTo}`);
  console.log(`  Asset:        ${solReq.asset}`);
  console.log();

  // Pre-flight balances (hard-fails in --send mode if insufficient).
  const agentDestAta = await getAssociatedTokenAddress(
    new PublicKey(solReq.asset),
    new PublicKey(solReq.payTo),
  );
  await preflightBalances(connection, buyer, agentDestAta);

  if (!SEND) {
    console.log('🟢 Dry-run complete. Re-run with --send to actually pay.');
    return;
  }

  // Broadcast USDC transfer → wait confirm → POST mint.
  console.log('─── Settle payment ─────────────────────────────────────');
  const sig = await broadcastPayment(connection, buyer, solReq);
  console.log();

  console.log('─── POST mint with X-Payment ───────────────────────────');
  const { status, data } = await postMint(input, buyerPub, sig);
  console.log(`  Status: ${status}`);
  console.log(`  Body:   ${JSON.stringify(data, null, 2)}`);
  console.log();

  if (status === 200 && 'ok' in data && data.ok) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ Canary mint complete.');
    console.log(`  Payment:  https://solscan.io/tx/${data.paymentSig}`);
    if (data.memoSig) {
      console.log(`  Memo:     https://solscan.io/tx/${data.memoSig}`);
    }
    console.log(`  Share:    https://chainbard.vercel.app${data.shareUrl}`);
    console.log('═══════════════════════════════════════════════════════');
  } else {
    console.error(`✗ Mint did not succeed (status ${status}).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗ Fatal:', err);
  process.exit(1);
});
