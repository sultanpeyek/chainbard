/**
 * Demo CLI — pure, testable core for `scripts/demo.ts` (issue #60).
 *
 * Holds the no-I/O logic the CLI wires together: flag parsing, base-URL
 * resolution, x402 `402` challenge parsing, the simulate funding plan, and the
 * fund→pay→mint→publish→recover narration with per-step cost estimates.
 *
 * Nothing here touches the chain, the network, or the filesystem — that lives
 * in `scripts/demo.ts` so this stays unit-testable.
 */

export type Flow = 'reactive' | 'cron';
export type Target = 'local' | 'prod';
export type DemoKind = 'wallet' | 'tx' | 'nft';

/**
 * Verified mainnet tx-signature preset for `--kind tx` without `--input`.
 * Confirmed live on-chain (issue #80).
 */
export const TX_PRESET_SIG =
  'u4UR1pzady5Lo5krC9dm2UULNuT4SmD9TCu7xqEhR6GYVj3E1JKamnXn7e8CvvfsATzCfdBfYe6pDfx1cScSSqq';

/**
 * Verified mainnet compressed-NFT (cNFT) mint preset for `--kind nft` without `--input`.
 * Derived via DAS searchAssets + confirmed via getAsset (compression.compressed === true,
 * interface === 'V1_NFT', collection 5DJAyCm2jU1f87s2RUzBEcN21uY53PvmEeTC3AsKgiJt) — issue #81.
 */
export const NFT_PRESET_MINT = 'JEKNVjohV7ALhZbHgCwuCFCJKxnfPom2fR4eniHCmP39';

export interface DemoArgs {
  flow: Flow;
  target: Target;
  /** Recognized but NO-OP this slice — simulate ignores it. */
  send: boolean;
  /** Recognized, documented, no effect yet. */
  placeholder: boolean;
  /** Recognized, documented, no effect yet. */
  noRecover: boolean;
  help: boolean;
  /** Optional tone to forward as body.tone in the mint POST. Validated against TONES. */
  tone?: string;
  /** Input kind for the mint: wallet (default), tx, nft. Validated. */
  kind: DemoKind;
  /** Explicit input string (overrides any kind-based preset). */
  input?: string;
}

const USDC_DECIMALS = 6;
/** Gas headroom the loop would spend on SOL (fees + ATA rent), in SOL. */
const GAS_SOL = 0.005;

const VALID_TONES = ['Tragedy', 'Comedy', 'Epic', 'Elegy', 'Forensic'] as const;

/** Parse a `--flag value` / `--flag=value` argv slice into typed DemoArgs. */
export function parseDemoArgs(argv: string[]): DemoArgs {
  const args: DemoArgs = {
    flow: 'reactive',
    target: 'local',
    send: false,
    placeholder: false,
    noRecover: false,
    help: false,
    kind: 'wallet',
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    let flag = raw;
    let inlineValue: string | undefined;
    const eq = raw.indexOf('=');
    if (raw.startsWith('--') && eq !== -1) {
      flag = raw.slice(0, eq);
      inlineValue = raw.slice(eq + 1);
    }

    const takeValue = (name: string): string => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`missing value for ${name}`);
      i++;
      return next;
    };

    switch (flag) {
      case '--flow': {
        const v = takeValue('--flow');
        if (v !== 'reactive' && v !== 'cron') {
          throw new Error(`invalid --flow "${v}" (expected reactive|cron)`);
        }
        args.flow = v;
        break;
      }
      case '--target': {
        const v = takeValue('--target');
        if (v !== 'local' && v !== 'prod') {
          throw new Error(`invalid --target "${v}" (expected local|prod)`);
        }
        args.target = v;
        break;
      }
      case '--send':
        args.send = true;
        break;
      case '--placeholder':
        args.placeholder = true;
        break;
      case '--no-recover':
        args.noRecover = true;
        break;
      case '--tone': {
        const v = takeValue('--tone');
        if (!(VALID_TONES as readonly string[]).includes(v)) {
          throw new Error(`invalid --tone "${v}" (expected ${VALID_TONES.join('|')})`);
        }
        args.tone = v;
        break;
      }
      case '--kind': {
        const v = takeValue('--kind');
        if (v === 'token') {
          throw new Error(
            `invalid --kind "${v}" (token render is deferred — no data source; use wallet|tx|nft)`,
          );
        }
        if (v !== 'wallet' && v !== 'tx' && v !== 'nft') {
          throw new Error(`invalid --kind "${v}" (expected wallet|tx|nft)`);
        }
        args.kind = v;
        break;
      }
      case '--input': {
        args.input = takeValue('--input');
        break;
      }
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`unknown flag: ${raw}`);
    }
  }

  return args;
}

/**
 * Resolve the input string to use for the mint based on CLI args and the
 * demo-buyer's pubkey.
 *
 * Priority:
 *   1. `args.input` — explicit `--input <id>` always wins.
 *   2. `args.kind === 'tx'` → `TX_PRESET_SIG` (verified mainnet sig).
 *   3. `args.kind === 'nft'` → `NFT_PRESET_MINT` (verified mainnet cNFT, issue #81).
 *   4. wallet / default → buyer pubkey.
 */
export function resolveInputForKind(
  args: { input?: string; kind?: DemoKind },
  buyerPubkey: string,
): string {
  if (args.input !== undefined) return args.input;
  const kind = args.kind ?? 'wallet';
  if (kind === 'tx') return TX_PRESET_SIG;
  if (kind === 'nft') return NFT_PRESET_MINT;
  return buyerPubkey;
}

/** Resolve the base URL for the target, allowing env overrides. */
export function resolveBaseUrl(
  target: Target,
  env: Record<string, string | undefined> = process.env,
): string {
  if (target === 'prod') {
    return env.DEMO_PROD_URL?.trim() || 'https://chainbard.vercel.app';
  }
  return env.DEMO_LOCAL_URL?.trim() || 'http://localhost:3000';
}

export interface Challenge {
  priceAtomic: bigint;
  priceUsdc: number;
  payTo: string;
  asset: string;
  facilitator: string;
}

interface PaymentRequirement {
  scheme?: string;
  network?: string;
  maxAmountRequired?: string;
  payTo?: string;
  asset?: string;
  extra?: { decimals?: number; facilitator?: string };
}

interface Body402 {
  accepts?: PaymentRequirement[];
}

/** Pull the canonical solana payment requirement out of a live 402 body. */
export function parseChallenge(body: unknown): Challenge {
  const accepts = (body as Body402)?.accepts;
  if (!Array.isArray(accepts)) {
    throw new Error('402 body missing accepts[]');
  }
  const req = accepts.find((a) => a?.network === 'solana');
  if (!req) {
    throw new Error('no solana payment requirement in 402 accepts[]');
  }
  const decimals = req.extra?.decimals ?? USDC_DECIMALS;
  const priceAtomic = BigInt(req.maxAmountRequired ?? '0');
  return {
    priceAtomic,
    priceUsdc: Number(priceAtomic) / 10 ** decimals,
    payTo: req.payTo ?? '',
    asset: req.asset ?? '',
    facilitator: req.extra?.facilitator ?? '',
  };
}

export interface FundingPlan {
  /** SOL the treasury would move to the demo-buyer for gas. */
  gasSol: number;
  /** USDC the treasury would move to the demo-buyer to cover one mint. */
  usdc: number;
  usdcAtomic: bigint;
}

/** Treasury → demo-buyer funding the loop would perform before paying. */
export function buildFundingPlan(priceUsdc: number): FundingPlan {
  return {
    gasSol: GAS_SOL,
    usdc: priceUsdc,
    usdcAtomic: BigInt(Math.round(priceUsdc * 10 ** USDC_DECIMALS)),
  };
}

export interface LoopStep {
  label: 'fund' | 'pay' | 'mint' | 'publish' | 'recover';
  detail: string;
  cost: string;
}

/** Narrate the full reactive loop with per-step cost estimates. */
export function buildLoopSteps(challenge: Challenge, plan: FundingPlan): LoopStep[] {
  const usdc = challenge.priceUsdc.toFixed(2);
  return [
    {
      label: 'fund',
      detail: `treasury → demo-buyer: ${plan.gasSol} SOL gas + ${usdc} USDC`,
      cost: `${plan.gasSol} SOL + ${usdc} USDC (treasury outflow, recoverable)`,
    },
    {
      label: 'pay',
      detail: `demo-buyer signs x402 USDC transfer; facilitator ${challenge.facilitator} settles it server-side`,
      cost: `${usdc} USDC → ${challenge.payTo} (facilitator pays SOL gas)`,
    },
    {
      label: 'mint',
      detail: 'agent renders story (Ace chat + image) and writes SAP Memo v2',
      cost: '~0.000005 SOL memo fee + ACE credits (chat + image)',
    },
    {
      label: 'publish',
      detail: 'story upserted to gallery, share URL returned',
      cost: '0 (DB write, no chain/ACE spend)',
    },
    {
      label: 'recover',
      detail: 'sweep leftover SOL/USDC from demo-buyer back to treasury',
      cost: `recovers up to ${plan.gasSol} SOL + dust USDC`,
    },
  ];
}

const solscanTx = (sig: string): string => `https://solscan.io/tx/${sig}`;

export interface PayReceiptInput {
  challenge: Challenge;
  /** Demo-buyer's USDC ATA the transfer debits. */
  buyerAta: string;
  /** Agent's USDC ATA the transfer credits. */
  payToAta: string;
  /** The settlement signature returned by the facilitator (via the mint response). */
  sig: string;
  explorer?: (sig: string) => string;
}

/**
 * Verbose narration of the PAY step for `--send`: exactly what settled on-chain.
 * x402 here is the facilitator-settled `exact`/`solana` scheme — the demo-buyer
 * only SIGNS a USDC TransferChecked (fee-payer = facilitator); the agent's server
 * settles it through AceData's facilitator, which co-signs as fee-payer and
 * broadcasts. The settled sig comes back on the mint response.
 */
export function buildPayReceipt({
  challenge,
  buyerAta,
  payToAta,
  sig,
  explorer = solscanTx,
}: PayReceiptInput): string[] {
  const usdc = challenge.priceUsdc.toFixed(2);
  return [
    'x402 settle: scheme=exact network=solana (facilitator-settled, no escrow)',
    `amount:      ${usdc} USDC (${challenge.priceAtomic.toString()} atomic, 6dp)`,
    `asset:       ${challenge.asset} (USDC mint)`,
    `from buyer:  ${buyerAta}`,
    `to agent:    ${payToAta} (owner ${challenge.payTo})`,
    `facilitator: ${challenge.facilitator} (co-signs fee-payer + broadcasts)`,
    `✓ settled on-chain: ${explorer(sig)}`,
  ];
}

export interface MintReceiptInput {
  story?: { title?: string; heroImagePrompt?: string; heroImageUrl?: string };
  /** SAP Memo v2 receipt signature, when the memo write succeeded. */
  memoSig?: string;
  /** Absolute share URL the published story resolves to. */
  shareUrl: string;
  policy: ImagePolicy;
  explorer?: (sig: string) => string;
}

/**
 * Verbose narration of the MINT step for `--send`: what the agent actually did
 * once payment cleared — Ace chat wrote the story, Ace image rendered the hero
 * (or the local/placeholder shortcut skipped ACE image spend), and a SAP Memo v2
 * SPL-Memo receipt was written on-chain summarising the paid work.
 */
export function buildMintReceipt({
  story,
  memoSig,
  shareUrl,
  policy,
  explorer = solscanTx,
}: MintReceiptInput): string[] {
  const lines = [
    `Ace chat → story: "${story?.title ?? '(untitled)'}"`,
    `image prompt:     "${story?.heroImagePrompt ?? '(none)'}"`,
    policy.expectPlaceholder
      ? 'image render:     placeholder (no ACE image spend on this target)'
      : `image render:     real Midjourney → ${story?.heroImageUrl ?? '(pending)'}`,
    'SAP Memo v2:      SPL Memo receipt (inputHash · storyHash · aceReceipts · paymentSig)',
  ];
  if (memoSig) lines.push(`✓ memo on-chain:  ${explorer(memoSig)}`);
  lines.push(`✓ published:      ${shareUrl}`);
  return lines;
}

// ── Cron flow (issue #64) ───────────────────────────────────────────────────

const TICK_PATH = '/api/cron/autonomous-tick';

export interface CronTriggerPlan {
  /** True when the tick can actually be fired (all required config present). */
  ready: boolean;
  /** The bearer secret to authenticate the tick, when present. */
  cronSecret: string | undefined;
  /** Human-readable reasons the tick can't fire (empty when ready). */
  blockers: string[];
  /** Operator-facing narration of what the tick will (or would) do. */
  narration: string[];
}

/**
 * Probe auth/config and narrate the autonomous-tick the cron flow will trigger.
 * No I/O — `scripts/demo.ts` decides whether to actually POST based on `ready`.
 */
export function buildCronTriggerPlan(
  env: Record<string, string | undefined> = process.env,
): CronTriggerPlan {
  const cronSecret = env.CRON_SECRET?.trim() || undefined;

  const blockers: string[] = [];
  if (!cronSecret) {
    blockers.push('CRON_SECRET is not set — required to authenticate the tick');
  }

  const narration: string[] = [
    `POST ${TICK_PATH} with the CRON_SECRET bearer to run one curator tick.`,
    'The always-on tick picks a subject and renders a story on the x402 buy-side (chat + multi-SERP + image + video + audio), writes a tick_log row, and posts the webhook.',
    'The route returns a minimal { tickLogId, storyUrl } (ADR 0016 — no rationale/receipts/cost leak). Use `bun run ace:debug <input>` for verbose per-stage detail.',
  ];

  return { ready: blockers.length === 0, cronSecret, blockers, narration };
}

export interface CronRequest {
  url: string;
  method: 'POST';
  headers: { Authorization: string };
}

/** Build the authenticated POST that fires one autonomous-tick. */
export function buildCronRequest(baseUrl: string, cronSecret: string): CronRequest {
  return {
    url: `${baseUrl}${TICK_PATH}`,
    method: 'POST',
    headers: { Authorization: `Bearer ${cronSecret}` },
  };
}

export type CronOutcome =
  | { ok: true; tickLogId: string; storyUrl: string }
  | { ok: false; step: string };

/**
 * Normalize the tick route's minimal JSON body into a typed outcome
 * (ADR 0016 — the route returns { tickLogId, storyUrl } | { dormant:true } |
 * { ok:false, step }; no rationale/receipts/cost are echoed).
 */
export function parseCronResult(body: unknown): CronOutcome {
  const b = body as Record<string, unknown> | null;
  if (b?.dormant === true) return { ok: false, step: 'dormant' };
  if (typeof b?.tickLogId === 'string' || b?.ok === true) {
    return {
      ok: true,
      tickLogId: String(b?.tickLogId ?? ''),
      storyUrl: String(b?.storyUrl ?? ''),
    };
  }
  return { ok: false, step: typeof b?.step === 'string' ? b.step : 'unknown' };
}

/**
 * Narrate a fired tick for `--flow cron --send`. The route returns a minimal
 * body (ADR 0016 — no rationale/receipts/cost/sigs), so only the tick id + the
 * public story URL are shown; use `bun run ace:debug <input>` for per-stage detail.
 */
export function buildCronReceipt(outcome: Extract<CronOutcome, { ok: true }>): string[] {
  return [`tick:   ${outcome.tickLogId}`, `story:  ${outcome.storyUrl}`];
}

// ── Reactive --send orchestration seams (issue #63) ───────────────────────
// Pure decisions the `--send` loop wires to chain/network I/O in scripts/demo.ts.
// Kept here, no-I/O, so they stay unit-testable (no `mock.module` on web3.js).

export interface FundingNeedsInput {
  /** Demo-buyer current SOL balance, in lamports. */
  buyerLamports: number;
  /** Demo-buyer current USDC balance, atomic (6 decimals). */
  buyerUsdcAtomic: bigint;
  plan: FundingPlan;
}

export interface FundingNeeds {
  needSol: boolean;
  needUsdc: boolean;
}

/**
 * Idempotent funding decision: only top up the side the demo-buyer is short on.
 * Re-running after a successful fund yields `{ needSol: false, needUsdc: false }`
 * so the loop never double-funds.
 */
export function resolveFundingNeeds({
  buyerLamports,
  buyerUsdcAtomic,
  plan,
}: FundingNeedsInput): FundingNeeds {
  const gasLamports = Math.round(plan.gasSol * 1e9);
  return {
    needSol: buyerLamports < gasLamports,
    needUsdc: buyerUsdcAtomic < plan.usdcAtomic,
  };
}

/**
 * Base64 x402 `x-payment` envelope carrying the buyer's partial-signed USDC
 * transfer (fee-payer = facilitator). The server settles it through AceData's
 * facilitator — the buyer never broadcasts. `txB64` is the base64 serialized
 * VersionedTransaction.
 */
export function buildPaymentEnvelope(txB64: string): string {
  const envelope = {
    x402Version: 2,
    scheme: 'exact',
    network: 'solana',
    payload: { transaction: txB64 },
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
}

export interface MintHeadersInput {
  paymentHeader: string;
  /** The DEMO_SECRET to forward as `x-demo-key` (→ provenance='demo'). */
  demoKey: string | undefined;
}

/**
 * Headers for the POST /api/mint/story call. Always carries the x402 envelope;
 * attaches `x-demo-key` only when a non-empty demo secret is present so the
 * route tags the row `provenance='demo'`.
 */
export function buildMintHeaders({
  paymentHeader,
  demoKey,
}: MintHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Payment': paymentHeader,
  };
  if (demoKey) headers['x-demo-key'] = demoKey;
  return headers;
}

export interface ImagePolicy {
  /** Send `skipImage` in the body → route forces the placeholder, no ACE spend. */
  skipImage: boolean;
  /** Expected outcome — the published hero image is the placeholder. */
  expectPlaceholder: boolean;
}

/**
 * Image-render policy for the loop:
 *   - local  → always placeholder (free dev-server demo, no ACE image spend)
 *   - prod   → real Midjourney by default; `--placeholder` forces the placeholder
 */
export function resolveImagePolicy({
  target,
  placeholder,
}: {
  target: Target;
  placeholder: boolean;
}): ImagePolicy {
  const skipImage = target === 'local' || placeholder;
  return { skipImage, expectPlaceholder: skipImage };
}

export interface RecoverDecision {
  shouldRecover: boolean;
  /** Lamports to sweep to the treasury (0 when not recovering). */
  sweepLamports: number;
}

/**
 * Recover decision: by default sweep the demo-buyer's leftover SOL back to the
 * treasury, keeping `feeReserveLamports` behind to pay the sweep tx fee.
 * `--no-recover` parks the funds; dust at/below the reserve is left in place.
 */
export function resolveRecoverDecision({
  noRecover,
  buyerLamports,
  feeReserveLamports,
}: {
  noRecover: boolean;
  buyerLamports: number;
  feeReserveLamports: number;
}): RecoverDecision {
  if (noRecover || buyerLamports <= feeReserveLamports) {
    return { shouldRecover: false, sweepLamports: 0 };
  }
  return { shouldRecover: true, sweepLamports: buyerLamports - feeReserveLamports };
}

/** Usage / `--help` text. Documents every flag. */
export function usageText(): string {
  return [
    'chainbard demo — reactive-mint loop. Simulates by default; --send runs it for real.',
    '',
    'Usage: bun run demo [flags]',
    '',
    'Flags:',
    '  --flow <reactive|cron>   workflow to demo (default reactive)',
    '  --target <local|prod>    base URL to probe (default local = dev server,',
    '                           prod = chainbard.vercel.app)',
    '  --send                   run the REAL loop (reactive: fund→pay→mint→publish→recover;',
    '                           cron: fire one autonomous-tick). Moves real SOL + USDC.',
    '  --kind <wallet|tx|nft>   input kind for the mint (default wallet). tx uses the',
    '                           baked-in mainnet preset sig; nft uses the baked-in',
    '                           mainnet cNFT preset mint. --input overrides either.',
    '  --input <id>             explicit input string (overrides any kind preset). Use',
    '                           with --kind tx to supply a custom sig, or --kind nft to',
    '                           supply a mint address.',
    '  --tone <Tone>            story tone: Tragedy|Comedy|Epic|Elegy|Forensic',
    '                           forwarded as body.tone in the mint POST; defaults to',
    '                           the kind-inferred tone when omitted.',
    '  --placeholder            prod: skip Midjourney (placeholder image, no ACE image spend)',
    '  --no-recover             skip the final SOL sweep back to the treasury',
    '  -h, --help               show this help',
    '',
    'Reactive (default) simulates: reads balances, surfaces the live 402 challenge, and',
    'narrates fund→pay→mint→publish→recover without spending anything. --send self-funds',
    'the demo buyer from the treasury, pays + mints + publishes, then sweeps leftover SOL',
    'back; USDC round-trips so net cost ≈ gas (+ ACE on prod).',
    '',
    'Cron (--flow cron) probes auth/config and narrates one autonomous curator tick. Add',
    '--send to fire it (POST /api/cron/autonomous-tick with the CRON_SECRET bearer); it',
    'prints the resulting tick id + story URL. The route is always-on x402 (ADR 0016):',
    'every tick spends agent USDC. Use `bun run ace:debug <input>` for verbose per-stage detail.',
  ].join('\n');
}
