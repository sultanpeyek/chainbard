/**
 * Spike S1 — probe AceData facilitator with arbitrary payTo.
 *
 * Goal: confirm whether facilitator.acedata.cloud co-signs USDC TransferChecked
 * txns where payTo is NOT an AceData treasury address.
 *
 * Method:
 *   1. Build USDC TransferChecked tx (mainnet USDC):
 *      - fee-payer = facilitator pubkey (3SPm...)
 *      - buyer signs USDC transfer to arbitrary payTo
 *   2. POST /verify with paymentPayload + paymentRequirements where payTo = arbitrary
 *   3. Log isValid / invalidReason.
 *   4. Repeat with payTo = AceData agent wallet (8Uh3...) as control.
 *
 * /verify is NON-destructive (no broadcast). Safe to run repeatedly.
 *
 * Required env:
 *   SOLANA_RPC_URL or SYNAPSE_RPC_URL  — RPC for blockhash
 *
 * Optional env:
 *   ACE_FACILITATOR_URL                — default https://facilitator.acedata.cloud
 *   ACE_FACILITATOR_PUBKEY             — default 3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq
 *   USDC_MINT                          — default mainnet USDC
 *   BUYER_KEY_PATH                     — default keys/buyer.json
 *
 * Usage:
 *   bun run scripts/spikes/S1-payto-probe.ts
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
import { env, resolveRpcUrl } from '../../src/env/cli';

const FACILITATOR_URL = env.ACE_FACILITATOR_URL;
const FACILITATOR_PUBKEY = env.ACE_FACILITATOR_PUBKEY;
const USDC_MINT = env.USDC_MINT;
const BUYER_KEY_PATH = env.BUYER_KEY_PATH ?? 'keys/buyer.json';
const SOLANA_RPC = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);

const ACE_AGENT_WALLET = '9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48';
const AMOUNT_ATOMIC = BigInt(10_000); // 0.01 USDC

interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string | null;
  payer?: string | null;
}

interface SettleResponse {
  success: boolean;
  errorReason?: string | null;
  transaction?: string | null;
  network?: string | null;
  payer?: string | null;
}

const SETTLE = process.argv.includes('--settle');

interface SupportedResponse {
  kinds: Array<{ x402Version: number; scheme: string; network: string }>;
}

function loadBuyer(): Keypair {
  const arr = JSON.parse(readFileSync(BUYER_KEY_PATH, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function buildSignedTransaction(
  connection: Connection,
  buyer: Keypair,
  payTo: PublicKey,
): Promise<string> {
  const facilitatorPubkey = new PublicKey(FACILITATOR_PUBKEY);
  const mint = new PublicKey(USDC_MINT);

  const buyerAta = await getAssociatedTokenAddress(mint, buyer.publicKey);
  const payToAta = await getAssociatedTokenAddress(mint, payTo);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      buyer.publicKey, // funder = buyer (fee-payer cannot appear in instruction accounts)
      payToAta,
      payTo,
      mint,
    ),
    createTransferCheckedInstruction(buyerAta, mint, payToAta, buyer.publicKey, AMOUNT_ATOMIC, 6),
  ];

  const msg = new TransactionMessage({
    payerKey: facilitatorPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([buyer]); // partial sign — facilitator co-signs as fee-payer

  return Buffer.from(tx.serialize()).toString('base64');
}

async function callVerify(
  txB64: string,
  payTo: string,
  resource: string,
): Promise<{ status: number; body: VerifyResponse | string }> {
  const body = {
    x402Version: 2,
    paymentPayload: {
      x402Version: 2,
      scheme: 'exact',
      network: 'solana',
      payload: { transaction: txB64 },
    },
    paymentRequirements: {
      scheme: 'exact',
      network: 'solana',
      maxAmountRequired: AMOUNT_ATOMIC.toString(),
      resource,
      description: 'spike-s1 arbitrary payTo probe',
      payTo,
      asset: USDC_MINT,
      maxTimeoutSeconds: 60,
      extra: {
        decimals: 6,
        feePayer: FACILITATOR_PUBKEY,
        computeUnitLimit: 100_000,
        computeUnitPriceMicroLamports: 5_000,
        rpcUrl: SOLANA_RPC,
      },
    },
  };

  const res = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) as VerifyResponse };
  } catch {
    return { status: res.status, body: text };
  }
}

async function callSettle(
  txB64: string,
  payTo: string,
  resource: string,
): Promise<{ status: number; body: SettleResponse | string }> {
  const body = {
    x402Version: 2,
    paymentPayload: {
      x402Version: 2,
      scheme: 'exact',
      network: 'solana',
      payload: { transaction: txB64 },
    },
    paymentRequirements: {
      scheme: 'exact',
      network: 'solana',
      maxAmountRequired: AMOUNT_ATOMIC.toString(),
      resource,
      description: 'spike-s1 arbitrary payTo settle',
      payTo,
      asset: USDC_MINT,
      maxTimeoutSeconds: 60,
      extra: {
        decimals: 6,
        feePayer: FACILITATOR_PUBKEY,
        computeUnitLimit: 100_000,
        computeUnitPriceMicroLamports: 5_000,
        rpcUrl: SOLANA_RPC,
      },
    },
  };
  const res = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) as SettleResponse };
  } catch {
    return { status: res.status, body: text };
  }
}

async function probe(label: string, payTo: PublicKey, buyer: Keypair, connection: Connection) {
  console.log(`\n─── ${label} ───`);
  console.log(`  payTo:   ${payTo.toBase58()}`);
  const txB64 = await buildSignedTransaction(connection, buyer, payTo);
  console.log(`  tx (b64 len): ${txB64.length}`);
  const resource = `https://chainbard.vercel.app/api/x402/hello?probe=${label}`;
  const verifyResult = await callVerify(txB64, payTo.toBase58(), resource);
  console.log(`  /verify HTTP:   ${verifyResult.status}`);
  console.log(`  /verify body:   ${JSON.stringify(verifyResult.body)}`);
  if (SETTLE && typeof verifyResult.body === 'object' && verifyResult.body.isValid) {
    const settleResult = await callSettle(txB64, payTo.toBase58(), resource);
    console.log(`  /settle HTTP:   ${settleResult.status}`);
    console.log(`  /settle body:   ${JSON.stringify(settleResult.body)}`);
    return { verify: verifyResult, settle: settleResult };
  }
  return { verify: verifyResult, settle: null };
}

async function main() {
  const buyer = loadBuyer();
  const connection = new Connection(SOLANA_RPC, 'confirmed');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Spike S1 — facilitator arbitrary payTo probe');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Facilitator:    ${FACILITATOR_URL}`);
  console.log(`  Fee-payer:      ${FACILITATOR_PUBKEY}`);
  console.log(`  Buyer:          ${buyer.publicKey.toBase58()}`);
  console.log(`  Mint:           ${USDC_MINT}`);
  console.log(`  Amount:         ${AMOUNT_ATOMIC} (= ${Number(AMOUNT_ATOMIC) / 1e6} USDC)`);

  // /supported sanity probe
  const supRes = await fetch(`${FACILITATOR_URL}/supported`);
  const sup = (await supRes.json()) as SupportedResponse;
  console.log(`\n  Supported kinds: ${sup.kinds.map((k) => k.network).join(', ')}`);

  const ephemeralPayTo = Keypair.generate().publicKey;
  const aceAgentPayTo = new PublicKey(ACE_AGENT_WALLET);

  // Probe A: arbitrary ephemeral payTo (chainbard-equivalent)
  const a = await probe('A_arbitrary_payTo', ephemeralPayTo, buyer, connection);

  // Probe B: control — known AceData agent wallet (not necessarily a service treasury,
  // but a real existing wallet — eliminates "fresh ATA / no balance" as confound)
  const b = await probe('B_known_agent_wallet', aceAgentPayTo, buyer, connection);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════');
  const summarize = (r: { status: number; body: VerifyResponse | string }): string => {
    if (typeof r.body === 'string') return `HTTP ${r.status}: ${r.body.slice(0, 200)}`;
    return `isValid=${r.body.isValid}, reason=${r.body.invalidReason ?? 'none'}`;
  };
  console.log(`  A (ephemeral payTo): ${summarize(a.verify)}`);
  console.log(`  B (known wallet):    ${summarize(b.verify)}`);
  if (a.settle) console.log(`  A /settle: ${JSON.stringify(a.settle.body)}`);
  if (b.settle) console.log(`  B /settle: ${JSON.stringify(b.settle.body)}`);
  console.log();

  const aBody = typeof a.verify.body === 'object' ? a.verify.body : null;
  const bBody = typeof b.verify.body === 'object' ? b.verify.body : null;
  if (aBody?.isValid && bBody?.isValid) {
    console.log('  ✅ CONCLUSION: facilitator accepts arbitrary payTo.');
  } else if (!aBody?.isValid && bBody?.isValid) {
    console.log('  ⚠ CONCLUSION: facilitator REFUSES arbitrary payTo (but accepts known wallet).');
  } else if (!aBody?.isValid && !bBody?.isValid && aBody?.invalidReason === bBody?.invalidReason) {
    console.log('  ⚠ CONCLUSION: BOTH rejected with same reason — likely not a payTo gate.');
    console.log(`     Shared reason: ${aBody?.invalidReason}`);
  } else {
    console.log('  ⚠ CONCLUSION: indeterminate — inspect reasons above.');
  }
}

main().catch((err) => {
  console.error('✗ Fatal:', err);
  process.exit(1);
});
