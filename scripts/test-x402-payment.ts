/**
 * x402 hello-world — Days 3-4.
 *
 * Combined demo: SERP google search → chat summarizes results.
 * Two x402 payments per run, both settled on Solana USDC.
 *
 * Defaults to DRY-RUN (just shows the 402 from each endpoint, no payment sent).
 * Add --send to actually sign + pay (will burn ~0.2 USDC per run on mainnet).
 *
 * Adapted from AceDataCloud/X402Client typescript/scripts/test-solana-e2e.ts.
 *
 * Required env:
 *   AGENT_SECRET_KEY_BASE58  — base58 secret of the agent keypair
 *   SOLANA_RPC_URL or SYNAPSE_RPC_URL  — for tx building
 *
 * Optional env:
 *   ACE_API_BASE                       (default https://api.acedata.cloud)
 *   ACE_FACILITATOR_PUBKEY             (default 3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq)
 *   SERP_ENDPOINT                      (default /serp/google — verify in console)
 *   CHAT_ENDPOINT                      (default /openai/chat/completions)
 *   CHAT_MODEL                         (default gpt-4o-mini)
 *
 * Usage:
 *   bun run test-x402              # dry-run: probe both 402 endpoints
 *   bun run test-x402 --send       # full e2e: pay + receive both responses
 */

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
import bs58 from 'bs58';
import { env, requireEnv, resolveRpcUrl } from '../src/env/cli';

const SEND = process.argv.includes('--send');

const API_BASE = env.ACE_API_BASE;
const SOLANA_RPC = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);
const FACILITATOR_ADDRESS = env.ACE_FACILITATOR_PUBKEY;

const SERP_ENDPOINT = env.SERP_ENDPOINT?.trim() || '/serp/google';
const CHAT_ENDPOINT = env.CHAT_ENDPOINT?.trim() || '/openai/chat/completions';
const CHAT_MODEL = env.CHAT_MODEL?.trim() || 'gpt-4o-mini';

interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  maxTimeoutSeconds: number;
  resource: string;
  payTo: string;
  asset: string;
}

interface Body402 {
  accepts: PaymentRequirement[];
}

function loadPayer(): Keypair {
  const b58 = requireEnv('AGENT_SECRET_KEY_BASE58');
  return Keypair.fromSecretKey(bs58.decode(b58));
}

async function probe402(endpoint: string, body: unknown): Promise<Body402 | null> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 402) {
    console.log(`  ⚠ Expected 402, got ${res.status}`);
    console.log(`  Body: ${(await res.text()).slice(0, 300)}`);
    return null;
  }
  const json = (await res.json()) as Body402;
  return json;
}

async function buildSolanaPayment(
  connection: Connection,
  payer: Keypair,
  req: PaymentRequirement,
): Promise<string> {
  const amount = BigInt(req.maxAmountRequired);
  const facilitatorPubkey = new PublicKey(FACILITATOR_ADDRESS);
  const payToPubkey = new PublicKey(req.payTo);
  const usdcMint = new PublicKey(req.asset);

  const payerAta = await getAssociatedTokenAddress(usdcMint, payer.publicKey);
  const payToAta = await getAssociatedTokenAddress(usdcMint, payToPubkey);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      payToAta,
      payToPubkey,
      usdcMint,
    ),
    createTransferCheckedInstruction(payerAta, usdcMint, payToAta, payer.publicKey, amount, 6),
  ];

  const messageV0 = new TransactionMessage({
    payerKey: facilitatorPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([payer]);

  const serialized = Buffer.from(tx.serialize()).toString('base64');
  const envelope = {
    x402Version: 2,
    scheme: 'exact',
    network: 'solana',
    payload: { serializedTransaction: serialized },
  };
  return btoa(JSON.stringify(envelope));
}

async function payAndCall<T = unknown>(
  connection: Connection,
  payer: Keypair,
  endpoint: string,
  body: unknown,
): Promise<{ status: number; data: T | string; settlementTx?: string }> {
  console.log(`  → POST ${endpoint} (probe)`);
  const req402 = await probe402(endpoint, body);
  if (!req402) throw new Error(`No 402 from ${endpoint}`);

  const solReq = req402.accepts.find((a) => a.network === 'solana');
  if (!solReq) {
    console.log(
      `  ✗ No solana payment requirement; available: ${req402.accepts.map((a) => a.network).join(', ')}`,
    );
    throw new Error('solana network not offered');
  }
  console.log(
    `  402: ${Number(BigInt(solReq.maxAmountRequired)) / 1e6} USDC → ${solReq.payTo.slice(0, 8)}…`,
  );

  if (!SEND) {
    return { status: 402, data: 'dry-run (no payment sent)' };
  }

  const xPayment = await buildSolanaPayment(connection, payer, solReq);
  console.log(`  → POST ${endpoint} (with X-Payment)`);
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment': xPayment },
    body: JSON.stringify(body),
  });
  const allHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    allHeaders[k] = v;
  });
  const x402Headers = Object.entries(allHeaders).filter(
    ([k]) =>
      k.toLowerCase().includes('payment') ||
      k.toLowerCase().includes('x402') ||
      k.toLowerCase().includes('settle'),
  );
  if (x402Headers.length > 0) {
    console.log(`  x402 headers: ${JSON.stringify(Object.fromEntries(x402Headers))}`);
  } else {
    console.log(`  ⚠ No x402/payment/settle headers. All headers:`);
    console.log(`  ${JSON.stringify(allHeaders, null, 2).replace(/\n/g, '\n  ')}`);
  }
  const settlementTx =
    res.headers.get('x402-settlement-tx') ||
    res.headers.get('x402-tx') ||
    res.headers.get('x-payment-response') ||
    res.headers.get('x-settlement-tx') ||
    undefined;
  const text = await res.text();
  let parsed: T | string;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    parsed = text;
  }
  if (res.status !== 200) {
    console.log(`  Body: ${text.slice(0, 800)}`);
  }
  return { status: res.status, data: parsed, settlementTx };
}

async function main() {
  const payer = loadPayer();
  const connection = new Connection(SOLANA_RPC, 'confirmed');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Ace Data Cloud x402 hello-world');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:        ${SEND ? '🔴 SEND (real USDC)' : '🟢 DRY-RUN (probe only)'}`);
  console.log(`  Payer:       ${payer.publicKey.toBase58()}`);
  console.log(`  API base:    ${API_BASE}`);
  console.log(`  Facilitator: ${FACILITATOR_ADDRESS}`);
  console.log();

  // Step 1: SERP google
  console.log('─── Step 1: SERP google ──────────────────────────────');
  const serpBody = { query: 'oobe protocol synapse agent protocol', number: 5 };
  const serp = await payAndCall<{ organic?: Array<{ title?: string; snippet?: string }> }>(
    connection,
    payer,
    SERP_ENDPOINT,
    serpBody,
  );
  console.log(`  Status: ${serp.status}`);
  if (serp.settlementTx) {
    console.log(`  Settlement tx: https://solscan.io/tx/${serp.settlementTx}`);
  }
  console.log();

  // Step 2: chat summarizes results
  console.log('─── Step 2: chat summary ─────────────────────────────');
  const summaryInput =
    serp.status === 200 && typeof serp.data === 'object' && serp.data !== null
      ? JSON.stringify(serp.data).slice(0, 2000)
      : '(no SERP results — dry run or error)';
  const chatBody = {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: 'Summarize search results in one tight sentence.' },
      { role: 'user', content: summaryInput },
    ],
    max_tokens: 60,
  };
  const chat = await payAndCall<{ choices?: Array<{ message?: { content?: string } }> }>(
    connection,
    payer,
    CHAT_ENDPOINT,
    chatBody,
  );
  console.log(`  Status: ${chat.status}`);
  if (chat.settlementTx) {
    console.log(`  Settlement tx: https://solscan.io/tx/${chat.settlementTx}`);
  }
  if (chat.status === 200 && typeof chat.data === 'object' && chat.data !== null) {
    const content = chat.data.choices?.[0]?.message?.content;
    if (content) console.log(`  Summary: ${content}`);
  }
  console.log();

  console.log('═══════════════════════════════════════════════════════');
  if (SEND) {
    console.log('  ✅ E2E run complete. Check Solscan links above for settlement.');
    console.log('  Also verify usage shows in https://platform.acedata.cloud dashboard.');
  } else {
    console.log('  🟢 Dry-run complete. Re-run with --send to actually pay.');
  }
}

main().catch((err) => {
  console.error('✗ Fatal:', err);
  process.exit(1);
});
