/**
 * chainbard demo CLI — `bun run demo`.
 *
 * Showcases the reactive-mint loop in SIMULATE mode (the default per CONTEXT.md
 * "reactive flow"): reads the agent treasury + demo-buyer balances, surfaces the
 * REAL x402 `402` challenge from the target mint route, and narrates the full
 * fund→pay→mint→publish→recover sequence with per-step cost estimates.
 *
 * Without `--send` the reactive flow broadcasts nothing, POSTs no payment, and
 * spends no ACE — it just narrates fund→pay→mint→publish→recover.
 *
 * With `--send` (issue #63) the reactive flow runs the REAL loop end-to-end,
 * self-funding the demo buyer from the agent treasury (no manual Phantom step):
 *   fund → pay → mint → publish → recover.
 * USDC round-trips to the treasury via the mint payment; net cost ≈ gas (+ ACE
 * on prod when a real image is rendered).
 *
 * The cron flow (--flow cron, issue #64) triggers ONE autonomous curator tick on
 * demand: `--send` POSTs /api/cron/autonomous-tick with the CRON_SECRET bearer and
 * prints the story URL + tick outcome; without `--send` it probes auth/config and
 * narrates. ⚠️ `--send` moves real mainnet funds.
 *
 * Flags:
 *   --flow <reactive|cron>   default reactive
 *   --target <local|prod>    default local (dev server) | prod (chainbard.vercel.app)
 *   --send                   run the real loop (reactive) / fire one tick (cron); moves real SOL + USDC
 *   --placeholder            prod: skip the Midjourney render (placeholder, no ACE image spend)
 *   --no-recover             skip the final SOL sweep back to the treasury
 *   -h, --help               usage
 *
 * Env:
 *   NEXT_PUBLIC_AGENT_WALLET agent treasury pubkey (default matches the route)
 *   AGENT_SECRET_KEY_BASE58  treasury keypair — REQUIRED for --send (funder + sweep dest)
 *   DEMO_SECRET              forwarded as x-demo-key on --send → provenance='demo'
 *   SOLANA_RPC_URL / SYNAPSE_RPC_URL   mainnet RPC for balance reads + tx
 *   USDC_MINT                default mainnet USDC EPjFW…Dt1v
 *   DEMO_LOCAL_URL / DEMO_PROD_URL     base-URL overrides
 *   CRON_SECRET              bearer to authenticate the cron tick (--flow cron --send)
 *
 * Demo-buyer keypair: `keys/demo-buyer.json` (distinct from keys/buyer.json).
 * Simulate never creates it; reactive --send generates + funds it on first run.
 *
 * Usage:
 *   bun run demo                          # reactive simulate against local dev server
 *   bun run demo --target prod            # reactive simulate against prod
 *   bun run demo --send --target local    # real reactive loop, placeholder image (no ACE)
 *   bun run demo --send --target prod     # real reactive loop, real Midjourney render
 *   bun run demo --flow cron              # narrate a curator tick (no fire)
 *   bun run demo --flow cron --send       # fire one curator tick
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
import {
  buildCronReceipt,
  buildCronRequest,
  buildCronTriggerPlan,
  buildFundingPlan,
  buildLoopSteps,
  buildMintHeaders,
  buildMintReceipt,
  buildPaymentEnvelope,
  buildPayReceipt,
  type Challenge,
  type DemoArgs,
  parseChallenge,
  parseCronResult,
  parseDemoArgs,
  resolveBaseUrl,
  resolveFundingNeeds,
  resolveImagePolicy,
  resolveInputForKind,
  resolveRecoverDecision,
  usageText,
} from '@/modules/demo-cli';
import { env, requireEnv, resolveSendRpcUrl, rpcHost } from '../src/env/cli';

const DEMO_BUYER_KEY_PATH = 'keys/demo-buyer.json';
const USDC_MINT = env.USDC_MINT;
const AGENT_WALLET = env.NEXT_PUBLIC_AGENT_WALLET;
const RPC_URL = resolveSendRpcUrl(env.SOLANA_RPC_URL);
const MINT_PATH = '/api/mint/story';
/** Lamports kept on the demo-buyer to pay the recover sweep tx fee. */
const SWEEP_FEE_RESERVE = 5_000;

interface Balances {
  sol: number;
  usdc: number;
}

async function readBalances(connection: Connection, owner: PublicKey): Promise<Balances> {
  const ata = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), owner);
  const [lamports, usdcInfo] = await Promise.all([
    connection.getBalance(owner, 'confirmed'),
    connection.getTokenAccountBalance(ata).catch(() => null),
  ]);
  return {
    sol: lamports / LAMPORTS_PER_SOL,
    usdc: Number(usdcInfo?.value.amount ?? '0') / 1e6,
  };
}

function loadDemoBuyerPubkey(): { pubkey: PublicKey | null; present: boolean } {
  if (!existsSync(DEMO_BUYER_KEY_PATH)) return { pubkey: null, present: false };
  const arr = JSON.parse(readFileSync(DEMO_BUYER_KEY_PATH, 'utf8')) as number[];
  return { pubkey: Keypair.fromSecretKey(Uint8Array.from(arr)).publicKey, present: true };
}

/** Real GET against the target mint route to surface the live 402 challenge. */
async function probeChallenge(baseUrl: string): Promise<Challenge> {
  const url = `${baseUrl}${MINT_PATH}`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (err) {
    throw new Error(
      `could not reach ${url}: ${(err as Error).message}\n` +
        '  (local? start the dev server with `bun run dev`; or use --target prod)',
    );
  }
  if (res.status !== 402) {
    const txt = await res.text();
    throw new Error(`expected 402 from ${url}, got ${res.status}: ${txt.slice(0, 300)}`);
  }
  return parseChallenge(await res.json());
}

/**
 * Cron flow: trigger (or narrate) one autonomous curator tick.
 *
 * Without `--send` it probes auth/config and narrates the tick WITHOUT firing
 * it. With `--send` it POSTs `/api/cron/autonomous-tick` with the CRON_SECRET
 * bearer and prints the resulting tick id + story URL.
 *
 * The tick is always-on x402 (ADR 0016): every fired tick spends agent USDC on
 * the buy-side. The route returns a minimal { tickLogId, storyUrl }; use
 * `bun run ace:debug <input>` for verbose per-stage detail.
 */
async function runCronFlow(baseUrl: string, send: boolean): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  chainbard demo — CRON ${send ? 'TRIGGER' : 'SIMULATE (tick not fired)'}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Target:     ${baseUrl}`);
  console.log();

  const plan = buildCronTriggerPlan();
  console.log('─── Tick plan ──────────────────────────────────────────');
  for (const line of plan.narration) console.log(`  ${line}`);
  console.log();

  if (!send) {
    console.log('─── Readiness (simulate — tick NOT fired) ──────────────');
    if (plan.ready) {
      console.log('  ✅ Ready: CRON_SECRET present. Re-run with --send to fire one tick.');
    } else {
      for (const b of plan.blockers) console.log(`  ✗ ${b}`);
    }
    return;
  }

  if (!plan.ready || !plan.cronSecret) {
    throw new Error(`cannot fire tick:\n  ${plan.blockers.join('\n  ')}`);
  }

  const req = buildCronRequest(baseUrl, plan.cronSecret);
  console.log('─── Firing tick ────────────────────────────────────────');
  console.log(`  POST ${req.url}`);
  let res: Response;
  try {
    res = await fetch(req.url, { method: req.method, headers: req.headers });
  } catch (err) {
    throw new Error(
      `could not reach ${req.url}: ${(err as Error).message}\n` +
        '  (local? start the dev server with `bun run dev`; or use --target prod)',
    );
  }
  const body = await res.json().catch(() => null);
  const outcome = parseCronResult(body);
  console.log(`  HTTP ${res.status}`);
  console.log();

  console.log('─── Tick outcome ───────────────────────────────────────');
  if (outcome.ok) {
    console.log(`  ✅ tick_log: ${outcome.tickLogId}`);
    console.log(`  Story URL:  ${outcome.storyUrl}`);
    console.log();
    console.log('─── Tick receipt ───────────────────────────────────────');
    for (const line of buildCronReceipt(outcome)) console.log(`  ${line}`);
    console.log();
    console.log('  Watch it appear on /activity.');
  } else if (outcome.step === 'dormant') {
    console.log('  · curator is dormant (agent treasury exhausted) — fund the wallet and retry.');
  } else {
    console.log(`  ✗ tick failed at step "${outcome.step}"`);
    process.exitCode = 1;
  }
}

// ── --send orchestration (real loop; moves real mainnet funds) ────────────

function loadTreasury(): Keypair {
  return Keypair.fromSecretKey(bs58.decode(requireEnv('AGENT_SECRET_KEY_BASE58')));
}

/** Load the demo-buyer keypair, generating + persisting it on first --send run. */
function loadOrCreateDemoBuyer(): Keypair {
  if (existsSync(DEMO_BUYER_KEY_PATH)) {
    const arr = JSON.parse(readFileSync(DEMO_BUYER_KEY_PATH, 'utf8')) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const kp = Keypair.generate();
  mkdirSync(dirname(DEMO_BUYER_KEY_PATH), { recursive: true });
  writeFileSync(DEMO_BUYER_KEY_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`  Generated demo-buyer keypair → ${DEMO_BUYER_KEY_PATH}`);
  return kp;
}

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

/** Idempotently top up the demo-buyer (SOL gas + USDC) from the treasury. */
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
  if (!needSol && !needUsdc) {
    console.log('  Already funded → skip (idempotent).');
    return;
  }

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

  console.log(
    `  Funding: ${needSol ? `${plan.gasSol} SOL ` : ''}${needUsdc ? `${plan.usdc} USDC` : ''}`,
  );
  const sig = await buildAndSend(connection, treasury, instructions, [treasury]);
  console.log(`  ✓ Funded: https://solscan.io/tx/${sig}`);
}

interface PaymentResult {
  txB64: string;
  buyerAta: string;
  payToAta: string;
}

/**
 * Demo-buyer SIGNS (does not broadcast) a USDC TransferChecked to the agent's
 * ATA, with the facilitator as fee-payer. The agent's server settles it through
 * AceData's facilitator (/verify + /settle), which co-signs as fee-payer and
 * broadcasts — so the buyer pays $0 SOL gas (ADR 0001).
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
    // funder = buyer (the fee-payer cannot appear in instruction accounts); the
    // agent ATA already exists so this idempotent ix is a no-op (no rent paid).
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

  return {
    txB64: Buffer.from(tx.serialize()).toString('base64'),
    buyerAta: buyerAta.toBase58(),
    payToAta: payToAta.toBase58(),
  };
}

interface MintResult {
  shareUrl: string;
  memoSig?: string;
  /** Settlement signature the facilitator broadcast, echoed by the route. */
  paymentSig?: string;
  story?: { title?: string; heroImagePrompt?: string; heroImageUrl?: string };
}

async function postMint(
  baseUrl: string,
  input: string,
  buyer: string,
  paymentTxB64: string,
  skipImage: boolean,
  tone?: string,
): Promise<MintResult> {
  const headers = buildMintHeaders({
    paymentHeader: buildPaymentEnvelope(paymentTxB64),
    demoKey: env.DEMO_SECRET,
  });
  const res = await fetch(`${baseUrl}${MINT_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input, buyer, skipImage, ...(tone ? { tone } : {}) }),
  });
  const text = await res.text();
  if (res.status !== 200) {
    throw new Error(`mint POST ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text) as { ok?: boolean } & MintResult;
  if (!data.ok || !data.shareUrl) throw new Error(`mint did not succeed: ${text.slice(0, 400)}`);
  return data;
}

/** Sweep leftover SOL from the demo-buyer back to the treasury. */
async function recoverSol(
  connection: Connection,
  buyer: Keypair,
  treasury: PublicKey,
  noRecover: boolean,
): Promise<void> {
  const buyerLamports = await connection.getBalance(buyer.publicKey, 'confirmed');
  const { shouldRecover, sweepLamports } = resolveRecoverDecision({
    noRecover,
    buyerLamports,
    feeReserveLamports: SWEEP_FEE_RESERVE,
  });
  if (!shouldRecover) {
    console.log(
      noRecover
        ? '  --no-recover → leftover SOL parked on demo-buyer.'
        : `  Nothing to sweep (${buyerLamports} lamports ≤ fee reserve).`,
    );
    return;
  }
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 }),
    SystemProgram.transfer({
      fromPubkey: buyer.publicKey,
      toPubkey: treasury,
      lamports: sweepLamports,
    }),
  ];
  const sig = await buildAndSend(connection, buyer, instructions, [buyer]);
  console.log(
    `  ✓ Swept ${(sweepLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL → treasury: https://solscan.io/tx/${sig}`,
  );
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

/** Run the full reactive --send loop: fund → pay → mint → publish → recover. */
async function runSend(args: DemoArgs, baseUrl: string, challenge: Challenge): Promise<void> {
  const connection = new Connection(RPC_URL, 'confirmed');
  const treasury = loadTreasury();
  const buyer = loadOrCreateDemoBuyer();
  const input = resolveInputForKind(args, buyer.publicKey.toBase58());
  const policy = resolveImagePolicy({ target: args.target, placeholder: args.placeholder });

  console.log('═══════════════════════════════════════════════════════');
  console.log('  chainbard demo — 🔴 SEND (real mainnet funds)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Target:     ${args.target} → ${baseUrl}`);
  console.log(`  Treasury:   ${treasury.publicKey.toBase58()}`);
  console.log(`  Demo-buyer: ${input}`);
  console.log(
    `  Image:      ${policy.expectPlaceholder ? 'placeholder (no ACE image spend)' : 'real Midjourney'}`,
  );
  console.log();

  console.log('─── 1. Fund (treasury → demo-buyer, idempotent) ────────');
  await fundBuyer(connection, treasury, buyer.publicKey, challenge);
  console.log();

  console.log('─── 2. Pay (demo-buyer signs x402; facilitator settles) ');
  const payment = await buildPaymentTx(connection, buyer, challenge);
  console.log('  ✓ Signed USDC transfer (not broadcast) — facilitator will settle.');
  console.log();

  console.log('─── 3+4. Mint + publish (facilitator settles, agent renders) ');
  const result = await postMint(baseUrl, input, input, payment.txB64, policy.skipImage, args.tone);
  const settledSig = result.paymentSig ?? '(unknown)';
  for (const line of buildPayReceipt({
    challenge,
    buyerAta: payment.buyerAta,
    payToAta: payment.payToAta,
    sig: settledSig,
  })) {
    console.log(`  ${line}`);
  }
  console.log();
  const shareUrl = `${baseUrl}${result.shareUrl}`;
  for (const line of buildMintReceipt({
    story: result.story,
    memoSig: result.memoSig,
    shareUrl,
    policy,
  })) {
    console.log(`  ${line}`);
  }
  console.log();

  console.log('─── 5. Recover (sweep SOL → treasury) ──────────────────');
  await recoverSol(connection, buyer, treasury.publicKey, args.noRecover);
  console.log();

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ✅ Reactive mint complete. Share: ${shareUrl}`);
  console.log('═══════════════════════════════════════════════════════');
}

async function main() {
  const args = parseDemoArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usageText());
    return;
  }

  const baseUrl = resolveBaseUrl(args.target);

  if (args.flow === 'cron') {
    await runCronFlow(baseUrl, args.send);
    return;
  }

  if (args.send) {
    const challenge = await probeChallenge(baseUrl);
    await runSend(args, baseUrl, challenge);
    return;
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  chainbard demo — SIMULATE (no on-chain writes, no ACE spend)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Flow:       ${args.flow}`);
  console.log(`  Target:     ${args.target} → ${baseUrl}`);
  console.log(`  RPC host:   ${rpcHost(RPC_URL)}`);
  console.log('  Note:       run with --send to execute the real loop.');
  console.log();

  // ── Balances ──────────────────────────────────────────────────────────
  const connection = new Connection(RPC_URL, 'confirmed');
  const agentPub = new PublicKey(AGENT_WALLET);
  const { pubkey: buyerPub, present } = loadDemoBuyerPubkey();

  const agentBal = await readBalances(connection, agentPub);
  console.log('─── Balances ───────────────────────────────────────────');
  console.log(`  Treasury (agent): ${agentPub.toBase58()}`);
  console.log(`    SOL:  ${agentBal.sol.toFixed(6)}`);
  console.log(`    USDC: ${agentBal.usdc.toFixed(6)}`);
  console.log();

  const fundingPlan = buildFundingPlan(0.3);

  if (present && buyerPub) {
    const buyerBal = await readBalances(connection, buyerPub);
    console.log(`  Demo-buyer: ${buyerPub.toBase58()}  (${DEMO_BUYER_KEY_PATH})`);
    console.log(`    SOL:  ${buyerBal.sol.toFixed(6)}`);
    console.log(`    USDC: ${buyerBal.usdc.toFixed(6)}`);
  } else {
    console.log(`  Demo-buyer: not yet funded — ${DEMO_BUYER_KEY_PATH} absent.`);
    console.log(
      `    Would fund: ${fundingPlan.gasSol} SOL gas + ${fundingPlan.usdc.toFixed(2)} USDC`,
    );
  }
  console.log();

  // ── Funding plan ──────────────────────────────────────────────────────
  console.log('─── Funding plan (treasury → demo-buyer) ───────────────');
  console.log(`  SOL gas:  ${fundingPlan.gasSol}`);
  console.log(`  USDC:     ${fundingPlan.usdc.toFixed(2)} (${fundingPlan.usdcAtomic} atomic)`);
  console.log();

  // ── Live 402 challenge ──────────────────────────────────────────────────
  console.log('─── Live 402 challenge ─────────────────────────────────');
  const challenge = await probeChallenge(baseUrl);
  console.log(`  Source:      GET ${baseUrl}${MINT_PATH}`);
  console.log(
    `  Price:       ${challenge.priceUsdc.toFixed(6)} USDC (${challenge.priceAtomic} atomic)`,
  );
  console.log(`  payTo:       ${challenge.payTo}`);
  console.log(`  Asset:       ${challenge.asset}`);
  console.log(`  Facilitator: ${challenge.facilitator}`);
  console.log();

  // ── Loop narration ──────────────────────────────────────────────────────
  console.log('─── Loop (simulated — nothing broadcast) ───────────────');
  const steps = buildLoopSteps(challenge, fundingPlan);
  steps.forEach((step, idx) => {
    console.log(`  ${idx + 1}. ${step.label.toUpperCase()}`);
    console.log(`     ${step.detail}`);
    console.log(`     cost: ${step.cost}`);
  });
  console.log();
  console.log('  ✅ Simulate complete. No tx broadcast, no payment POSTed, no ACE spent.');
}

main().catch((err) => {
  console.error('✗ demo failed:', (err as Error).message);
  process.exit(1);
});
