/**
 * Seed every homepage **Featured** card with a real reactive-flow story.
 *
 * Drives the real reactive mint (`POST /api/mint/story` with a live x402 payment)
 * once per Featured fixture, self-funding disposable seed buyers from the agent
 * treasury. Every row is tagged `provenance='demo'` (gated `x-demo-key`) so the
 * no-self-dealing invariant holds, yet each mint still pays a real 0.30 USDC,
 * settles a SAP memo, and renders a real Midjourney image. Each fixture's curated
 * `brief` + `tone` steer the render.
 *
 * The loop runs a bounded worker pool of seed buyers (`keys/seed-buyer-N.json`).
 * Each buyer recycles a single 0.30 USDC: the payment round-trips to the treasury
 * and the next iteration's idempotent fund re-sends it. So concurrency `N` needs
 * only `N × 0.30` USDC of float (default N=2 → 0.6 USDC).
 *
 * Idempotent: a fixture with a prior demo/seed row is skipped unless `--force`;
 * a real `buyer`/`curator` row is never overwritten (re-seeding would downgrade
 * it to `provenance='demo'`). On the success path the 0.30 USDC is not consumed —
 * it round-trips to the treasury — so a `--force` re-run costs only ACE image
 * credits + dust SOL. A mint that fails AFTER its fund but before settle leaves
 * that 0.30 stranded on the seed buyer; it is reused on the next run (idempotent
 * fund) or swept back by `--recover`.
 *
 * Env:
 *   AGENT_SECRET_KEY_BASE58  treasury keypair — funder (REQUIRED for --send)
 *   DEMO_SECRET              forwarded as x-demo-key → provenance='demo' (REQUIRED for --send)
 *   DATABASE_URL             Postgres URL — skip-if-exists check
 *   SYNAPSE_RPC_URL / SOLANA_RPC_URL   mainnet RPC for balance reads + fund/sweep tx
 *   USDC_MINT                default mainnet USDC EPjFW…Dt1v
 *   NEXT_PUBLIC_APP_URL / DEMO_LOCAL_URL   target dev-server base URL (default http://localhost:3000)
 *
 * Flags:
 *   --send                   run the real loop; moves real mainnet SOL + USDC
 *   --force                  re-mint fixtures that already have a story row
 *   --concurrency <N>        seed-buyer worker count / USDC float (default 2)
 *   --recover                sweep leftover SOL off the seed buyers at the end
 *   -h, --help               usage
 *
 * Usage:
 *   bun run seed-featured                  # dry-run: plan + live 402 probe, nothing sent
 *   bun run seed-featured --send           # real loop against the local dev server
 *   bun run seed-featured --send --force   # re-render even fixtures already seeded
 *   bun run seed-featured --send --concurrency 1   # one buyer, 0.30 USDC float
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { FEATURED } from '@/config/featured';
import { FIXTURES, type Fixture, type FixtureTone } from '@/config/fixtures';
import {
  buildFundingPlan,
  buildMintHeaders,
  buildPaymentEnvelope,
  type Challenge,
  parseChallenge,
  resolveBaseUrl,
  resolveFundingNeeds,
} from '@/modules/demo-cli';
import type { Tone } from '@/story-renderer';
import { computeInputHash } from '@/story-repo';
import { env, requireEnv, resolveSendRpcUrl, rpcHost } from '../src/env/cli';

const USDC_MINT = env.USDC_MINT;
const RPC_URL = resolveSendRpcUrl(env.SOLANA_RPC_URL);
const MINT_PATH = '/api/mint/story';
/** Lamports kept on a seed buyer to pay the recover sweep tx fee. */
const SWEEP_FEE_RESERVE = 5_000;

const TONE_MAP: Record<FixtureTone, Tone> = {
  tragedy: 'Tragedy',
  comedy: 'Comedy',
  epic: 'Epic',
  elegy: 'Elegy',
  forensic: 'Forensic',
};

// ── Args ────────────────────────────────────────────────────────────────────

interface Args {
  send: boolean;
  force: boolean;
  recover: boolean;
  concurrency: number;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { send: false, force: false, recover: false, concurrency: 2, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--send') args.send = true;
    else if (a === '--force') args.force = true;
    else if (a === '--recover') args.recover = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else if (a === '--concurrency' || a === '-c') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error(`invalid --concurrency "${argv[i]}"`);
      args.concurrency = n;
    } else if (a.startsWith('--concurrency=')) {
      const n = Number(a.split('=')[1]);
      if (!Number.isInteger(n) || n < 1) throw new Error(`invalid --concurrency "${a}"`);
      args.concurrency = n;
    } else {
      throw new Error(`unknown flag "${a}" (try --help)`);
    }
  }
  return args;
}

const USAGE = `chainbard featured seeder — bun run seed-featured

Drives the real reactive mint once per Featured fixture, self-funding disposable
seed buyers. Rows are tagged provenance='demo'; each mint pays a real 0.30 USDC,
settles a SAP memo, and renders a real Midjourney image.

  --send                run the real loop (moves real mainnet SOL + USDC)
  --force               re-mint fixtures that already have a story row
  --concurrency <N>     seed-buyer worker count / USDC float (default 2)
  --recover             sweep leftover SOL off the seed buyers at the end
  -h, --help            this help

Without --send it dry-runs: prints the plan + a live 402 probe, sends nothing.`;

// ── Featured fixture slate (canonical homepage membership/order) ──────────────

/** The Featured cards, resolved back to full catalog entries for brief + tone. */
const FEATURED_FIXTURES: readonly Fixture[] = FEATURED.map((entry) => {
  const fx = Object.values(FIXTURES).find((f) => f.identifier === entry.input);
  if (!fx) throw new Error(`Featured entry ${entry.input} has no catalog fixture`);
  return fx;
});

// ── Solana helpers (mirrors scripts/demo.ts; demo.ts is left untouched) ───────

async function pollSig(connection: Connection, sig: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatus(sig, { searchTransactionHistory: false });
    if (value?.err) throw new Error(`tx failed: ${JSON.stringify(value.err)}`);
    if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') {
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`tx ${sig} not confirmed within ${timeoutMs}ms`);
}

async function buildAndSend(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  signers: Keypair[],
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(),
  );
  tx.sign(signers);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await pollSig(connection, sig);
  return sig;
}

/** Idempotently top up one seed buyer (SOL gas + 0.30 USDC) from the treasury. */
async function fundBuyer(
  connection: Connection,
  treasury: Keypair,
  buyer: PublicKey,
  challenge: Challenge,
): Promise<void> {
  const plan = buildFundingPlan(challenge.priceUsdc);
  const usdcMint = new PublicKey(USDC_MINT);
  const treasuryAta = await getAssociatedTokenAddress(usdcMint, treasury.publicKey);
  const buyerAta = await getAssociatedTokenAddress(usdcMint, buyer);

  const [buyerLamports, buyerUsdcInfo] = await Promise.all([
    connection.getBalance(buyer, 'confirmed'),
    connection.getTokenAccountBalance(buyerAta).catch(() => null),
  ]);
  const buyerUsdcAtomic = BigInt(buyerUsdcInfo?.value.amount ?? '0');

  const { needSol, needUsdc } = resolveFundingNeeds({ buyerLamports, buyerUsdcAtomic, plan });
  if (!needSol && !needUsdc) return;

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
  ];
  if (needSol) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: buyer,
        lamports: Math.round(plan.gasSol * LAMPORTS_PER_SOL),
      }),
    );
  }
  if (needUsdc) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        treasury.publicKey,
        buyerAta,
        buyer,
        usdcMint,
      ),
      createTransferCheckedInstruction(
        treasuryAta,
        usdcMint,
        buyerAta,
        treasury.publicKey,
        plan.usdcAtomic,
        6,
      ),
    );
  }
  await buildAndSend(connection, treasury, instructions, [treasury]);
}

interface PaymentResult {
  txB64: string;
}

/**
 * Seed buyer SIGNS (does not broadcast) a USDC TransferChecked to the agent's
 * ATA, fee-payer = facilitator. The route settles it through AceData's
 * facilitator (/verify + /settle), so the buyer pays $0 SOL gas.
 */
async function buildPaymentTx(
  connection: Connection,
  buyer: Keypair,
  challenge: Challenge,
): Promise<PaymentResult> {
  const usdcMint = new PublicKey(challenge.asset || USDC_MINT);
  const payTo = new PublicKey(challenge.payTo);
  const feePayer = new PublicKey(challenge.facilitator);
  const buyerAta = await getAssociatedTokenAddress(usdcMint, buyer.publicKey);
  const payToAta = await getAssociatedTokenAddress(usdcMint, payTo);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
    createAssociatedTokenAccountIdempotentInstruction(buyer.publicKey, payToAta, payTo, usdcMint),
    createTransferCheckedInstruction(
      buyerAta,
      usdcMint,
      payToAta,
      buyer.publicKey,
      challenge.priceAtomic,
      6,
    ),
  ];

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(),
  );
  tx.sign([buyer]); // partial sign — facilitator co-signs as fee-payer on /settle
  return { txB64: Buffer.from(tx.serialize()).toString('base64') };
}

interface MintResult {
  shareUrl: string;
  memoSig: string;
  paymentSig: string;
}

/** One line of the route's NDJSON mint stream (mirrors MintEvent in route.ts). */
type MintEvent =
  | { t: 'step'; id: string; status: string; sig?: string }
  | { t: 'done'; shareUrl: string; paymentSig: string; memoSig: string }
  | { t: 'error'; id: string; kind: string; reason: string; paymentSig?: string };

async function postMint(
  baseUrl: string,
  fx: Fixture,
  buyer: string,
  paymentTxB64: string,
  demoSecret: string,
): Promise<MintResult> {
  const headers = buildMintHeaders({
    paymentHeader: buildPaymentEnvelope(paymentTxB64),
    demoKey: demoSecret,
  });
  const res = await fetch(`${baseUrl}${MINT_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: fx.identifier,
      buyer,
      skipImage: false, // real Midjourney — provenance='demo' with a real image
      tone: TONE_MAP[fx.tone],
      ...(fx.brief ? { brief: fx.brief } : {}),
    }),
  });
  const text = await res.text();
  // Pre-stream failures (400/402/500) are plain JSON; a 200 is the NDJSON mint
  // stream — one JSON event per line, terminating in `done` or `error`.
  if (res.status !== 200) throw new Error(`mint POST ${res.status}: ${text.slice(0, 400)}`);
  const events = text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as MintEvent);
  const err = events.find((e): e is Extract<MintEvent, { t: 'error' }> => e.t === 'error');
  if (err) {
    const charged = err.paymentSig ? ` (charged paymentSig=${err.paymentSig})` : '';
    throw new Error(`mint failed @${err.id} [${err.kind}]: ${err.reason}${charged}`);
  }
  const done = events.find((e): e is Extract<MintEvent, { t: 'done' }> => e.t === 'done');
  if (!done?.shareUrl) throw new Error(`mint stream ended without done: ${text.slice(0, 400)}`);
  return { shareUrl: done.shareUrl, memoSig: done.memoSig, paymentSig: done.paymentSig };
}

/**
 * Sweep leftover funds from a seed buyer back to the treasury — both any USDC
 * stranded by a mid-loop failure (a 0.30 funded but never settled) and the
 * leftover SOL. Buyer-signed; the buyer keeps SWEEP_FEE_RESERVE lamports for fee.
 */
async function recoverFunds(
  connection: Connection,
  buyer: Keypair,
  treasury: PublicKey,
): Promise<string | null> {
  const usdcMint = new PublicKey(USDC_MINT);
  const buyerAta = await getAssociatedTokenAddress(usdcMint, buyer.publicKey);
  const treasuryAta = await getAssociatedTokenAddress(usdcMint, treasury);
  const [buyerLamports, buyerUsdcInfo] = await Promise.all([
    connection.getBalance(buyer.publicKey, 'confirmed'),
    connection.getTokenAccountBalance(buyerAta).catch(() => null),
  ]);
  const usdcAtomic = BigInt(buyerUsdcInfo?.value.amount ?? '0');
  const sweepLamports = buyerLamports - SWEEP_FEE_RESERVE;

  const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 30_000 })];
  if (usdcAtomic > BigInt(0)) {
    instructions.push(
      createTransferCheckedInstruction(
        buyerAta,
        usdcMint,
        treasuryAta,
        buyer.publicKey,
        usdcAtomic,
        6,
      ),
    );
  }
  if (sweepLamports > 0) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: buyer.publicKey,
        toPubkey: treasury,
        lamports: sweepLamports,
      }),
    );
  }
  if (instructions.length === 1) return null; // nothing to sweep
  return buildAndSend(connection, buyer, instructions, [buyer]);
}

// ── Keypairs ──────────────────────────────────────────────────────────────────

function loadTreasury(): Keypair {
  return Keypair.fromSecretKey(bs58.decode(requireEnv('AGENT_SECRET_KEY_BASE58')));
}

function seedBuyerPath(i: number): string {
  return `keys/seed-buyer-${i}.json`;
}

function loadOrCreateSeedBuyer(i: number): Keypair {
  const path = seedBuyerPath(i);
  if (existsSync(path)) {
    const arr = JSON.parse(readFileSync(path, 'utf8')) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const kp = Keypair.generate();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`  Generated seed-buyer keypair → ${path}`);
  return kp;
}

// ── 402 probe ─────────────────────────────────────────────────────────────────

async function probeChallenge(baseUrl: string): Promise<Challenge> {
  const url = `${baseUrl}${MINT_PATH}`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (err) {
    throw new Error(
      `could not reach ${url}: ${(err as Error).message}\n` +
        '  (local? start the dev server with `bun run dev`)',
    );
  }
  if (res.status !== 402) {
    throw new Error(
      `expected 402 from ${url}, got ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  return parseChallenge(await res.json());
}

// ── DB skip-if-exists ──────────────────────────────────────────────────────────

interface UnsafeSql {
  unsafe(q: string, args?: unknown[]): Promise<unknown[]>;
}

async function openDb(databaseUrl: string): Promise<UnsafeSql> {
  const { SQL } = await import('bun');
  return new SQL(databaseUrl) as unknown as UnsafeSql;
}

/** Existing-row provenance for a fixture, or null if no row exists. */
async function existingProvenance(db: UnsafeSql, identifier: string): Promise<string | null> {
  const rows = (await db.unsafe(
    'SELECT provenance FROM wallet_stories WHERE input_hash = $1 LIMIT 1',
    [computeInputHash(identifier)],
  )) as Array<{ provenance?: string }>;
  return rows.length > 0 ? (rows[0].provenance ?? 'unknown') : null;
}

/**
 * Provenances we must never clobber: a real buyer mint or an autonomous curator
 * tick of a Featured asset. Re-seeding (provenance='demo') would downgrade a
 * genuine row and hide it from the gallery — so we skip these even under --force.
 */
const PROTECTED_PROVENANCE = new Set(['buyer', 'curator']);

// ── Treasury send mutex (fund txs from one signer must not race) ──────────────

function makeMutex() {
  let chain: Promise<unknown> = Promise.resolve();
  return function lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run as Promise<T>;
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

interface RunResult {
  fixture: Fixture;
  status: 'minted' | 'skipped-exists' | 'skipped-protected' | 'failed';
  shareUrl?: string;
  memoSig?: string;
  paymentSig?: string;
  worker?: string;
  error?: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const baseUrl = resolveBaseUrl('local');
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('═══════════════════════════════════════════════════════');
  console.log(
    `  chainbard featured seeder — ${args.send ? '🔴 SEND (real mainnet funds)' : 'DRY-RUN'}`,
  );
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Target:      ${baseUrl}${MINT_PATH}`);
  console.log(`  RPC host:    ${rpcHost(RPC_URL)}`);
  console.log(
    `  Concurrency: ${args.concurrency} buyer(s) → ${(args.concurrency * 0.3).toFixed(2)} USDC float`,
  );
  console.log(`  Fixtures:    ${FEATURED_FIXTURES.length} Featured`);
  console.log(`  Force:       ${args.force}`);
  console.log();

  // Skip-if-exists pass (DATABASE_URL required for --send; best-effort in dry-run).
  const databaseUrl = args.send ? requireEnv('DATABASE_URL') : env.DATABASE_URL;
  const db = databaseUrl ? await openDb(databaseUrl) : null;

  const results: RunResult[] = [];
  const pending: Fixture[] = [];
  console.log('─── Fixture slate ──────────────────────────────────────');
  for (const fx of FEATURED_FIXTURES) {
    const prov = db ? await existingProvenance(db, fx.identifier) : null;
    // Never overwrite a genuine buyer/curator mint with a demo re-seed — even
    // under --force — since the upsert would downgrade its provenance to 'demo'
    // and hide a real row from the gallery.
    if (prov && PROTECTED_PROVENANCE.has(prov)) {
      console.log(`  skip   ${fx.kind.padEnd(6)} ${fx.label} — real ${prov} row, won't clobber`);
      results.push({ fixture: fx, status: 'skipped-protected' });
      continue;
    }
    // A prior demo/seed row is re-seedable; skip it unless --force.
    if (prov && !args.force) {
      console.log(
        `  skip   ${fx.kind.padEnd(6)} ${fx.label} — already ${prov} (--force to re-render)`,
      );
      results.push({ fixture: fx, status: 'skipped-exists' });
      continue;
    }
    const re = prov ? ` [re-seed over ${prov}]` : '';
    console.log(`  queue  ${fx.kind.padEnd(6)} ${fx.label} (tone=${TONE_MAP[fx.tone]})${re}`);
    pending.push(fx);
  }
  console.log();

  const challenge = await probeChallenge(baseUrl);
  console.log('─── Live 402 challenge ─────────────────────────────────');
  console.log(
    `  Price:       ${challenge.priceUsdc.toFixed(6)} USDC (${challenge.priceAtomic} atomic)`,
  );
  console.log(`  payTo:       ${challenge.payTo}`);
  console.log(`  Facilitator: ${challenge.facilitator}`);
  console.log();

  if (!args.send) {
    console.log(`  Would mint ${pending.length} fixture(s) across ${args.concurrency} buyer(s).`);
    console.log('  ✅ Dry-run complete. Nothing broadcast, no payment POSTed, no ACE spent.');
    console.log('  Re-run with --send to execute the real loop.');
    return;
  }

  if (pending.length === 0) {
    console.log(
      '  Nothing to mint (all Featured fixtures already seeded). Use --force to re-render.',
    );
    return;
  }

  const treasury = loadTreasury();
  const demoSecret = requireEnv('DEMO_SECRET');
  const workerCount = Math.min(args.concurrency, pending.length);
  const buyers = Array.from({ length: workerCount }, (_, i) => loadOrCreateSeedBuyer(i));
  const treasuryLock = makeMutex();

  // Cold-start solvency: all workerCount buyers are funded before any payment
  // settles back, so the treasury must hold workerCount × (0.30 USDC + gas) up
  // front. Fail fast with an actionable message instead of an opaque tx error.
  const plan = buildFundingPlan(challenge.priceUsdc);
  const treasuryUsdcAta = await getAssociatedTokenAddress(
    new PublicKey(USDC_MINT),
    treasury.publicKey,
  );
  const [treasurySol, treasuryUsdcInfo] = await Promise.all([
    connection.getBalance(treasury.publicKey, 'confirmed'),
    connection.getTokenAccountBalance(treasuryUsdcAta).catch(() => null),
  ]);
  const treasuryUsdc = BigInt(treasuryUsdcInfo?.value.amount ?? '0');
  const needUsdc = BigInt(workerCount) * plan.usdcAtomic;
  const needLamports = workerCount * Math.round(plan.gasSol * LAMPORTS_PER_SOL) + 10_000_000;
  if (treasuryUsdc < needUsdc) {
    throw new Error(
      `treasury has ${(Number(treasuryUsdc) / 1e6).toFixed(2)} USDC, need ≥ ` +
        `${(Number(needUsdc) / 1e6).toFixed(2)} for --concurrency ${workerCount} cold start`,
    );
  }
  if (treasurySol < needLamports) {
    throw new Error(
      `treasury has ${(treasurySol / LAMPORTS_PER_SOL).toFixed(4)} SOL, need ≥ ` +
        `${(needLamports / LAMPORTS_PER_SOL).toFixed(4)} to fund ${workerCount} buyer(s)`,
    );
  }
  console.log(
    `  Treasury float OK: ${(Number(treasuryUsdc) / 1e6).toFixed(2)} USDC / ${(treasurySol / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
  );

  console.log('─── Minting ────────────────────────────────────────────');
  let cursor = 0;
  async function worker(buyer: Keypair, label: string): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= pending.length) return;
      const fx = pending[idx];
      try {
        // Fund (serialized — all funds come from the one treasury signer).
        // Idempotent: this is also the "re-send 0.30 USDC" step on later rounds,
        // since the buyer drained to 0 after its previous payment settled.
        await treasuryLock(() => fundBuyer(connection, treasury, buyer.publicKey, challenge));
        const payment = await buildPaymentTx(connection, buyer, challenge);
        const res = await postMint(
          baseUrl,
          fx,
          buyer.publicKey.toBase58(),
          payment.txB64,
          demoSecret,
        );
        // Confirm the facilitator settle landed before this buyer's next fund
        // read, so a not-yet-propagated drain can't look like "already funded".
        if (res.paymentSig) await pollSig(connection, res.paymentSig).catch(() => {});
        console.log(
          `  ✓ [${label}] ${fx.label} → ${res.shareUrl}` +
            (res.memoSig ? ` memo=${res.memoSig.slice(0, 12)}…` : ''),
        );
        results.push({
          fixture: fx,
          status: 'minted',
          shareUrl: res.shareUrl,
          memoSig: res.memoSig,
          paymentSig: res.paymentSig,
          worker: label,
        });
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`  ✗ [${label}] ${fx.label} failed: ${msg}`);
        results.push({ fixture: fx, status: 'failed', worker: label, error: msg });
      }
    }
  }
  await Promise.all(buyers.map((b, i) => worker(b, `buyer-${i}`)));
  console.log();

  if (args.recover) {
    console.log('─── Recover (sweep USDC + SOL → treasury) ──────────────');
    // Sequential + buyer-signed: no treasury-signer contention to serialize.
    for (let i = 0; i < buyers.length; i++) {
      const sig = await recoverFunds(connection, buyers[i], treasury.publicKey);
      console.log(
        sig
          ? `  ✓ swept buyer-${i}: https://solscan.io/tx/${sig}`
          : `  buyer-${i}: nothing to sweep`,
      );
    }
    console.log();
  }

  console.log('─── Summary ────────────────────────────────────────────');
  for (const r of results) {
    const tag = r.status.padEnd(18);
    const extra = r.error ? ` (${r.error})` : r.shareUrl ? ` ${r.shareUrl}` : '';
    console.log(`  ${tag} ${r.fixture.kind.padEnd(6)} ${r.fixture.label}${extra}`);
  }
  const minted = results.filter((r) => r.status === 'minted').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log();
  console.log(`  ${minted} minted, ${results.length - minted - failed} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('✗ seed-featured fatal:', (err as Error).message);
  process.exit(1);
});
