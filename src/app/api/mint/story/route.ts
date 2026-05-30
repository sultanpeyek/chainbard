/**
 * Reactive mint endpoint — POST /api/mint/story.
 *
 * Flow:
 *   1. No / invalid X-Payment header → 402 PaymentRequired with `accepts[]`
 *      describing the AceData facilitator scheme (USDC, payTo = AGENT_WALLET,
 *      price = MINT_PRICE_USDC, feePayer = facilitator).
 *   2. Valid X-Payment → decode the buyer's partial-signed USDC transfer, settle
 *      it through AceData's OWN facilitator (`/verify` then `/settle`), confirm +
 *      re-verify the settled tx on-chain via x402-verifier, then dispatch via
 *      mint-orchestrator. Returns 200 with the published story payload plus the
 *      SAP Memo v2 signature.
 *
 * Env (validated by @/env — see ADR 0007):
 *   NEXT_PUBLIC_AGENT_WALLET agent pubkey to receive payment
 *   AGENT_SECRET_KEY_BASE58  agent keypair — signs the memo AND drives the
 *                            reactive buy-side (chat / multi-SERP / image), which
 *                            settles via the agent's x402 self-broadcast rail
 *                            (ADR 0016 B), not a bearer token
 *   USDC_MINT                default EPjFW… (mainnet USDC)
 *   MINT_PRICE_USDC          default "0.30"
 *   SOLANA_RPC_URL/SYNAPSE_RPC_URL  mainnet RPC (resolved SOLANA→SYNAPSE→public)
 *   ACE_FACILITATOR_PUBKEY   facilitator fee-payer pubkey (default 3SPm…2igq)
 *   ACE_FACILITATOR_URL      AceData facilitator base (default
 *                            https://facilitator.acedata.cloud)
 *   QSTASH_TOKEN             enqueues the durable media-attach job (video/audio)
 *   IMAGE_PROVIDER           single-image provider (default nano-banana → fallback
 *                            seedream; both inline + fast, nano-banana cheaper.
 *                            midjourney is queue-based/slow and off the chain)
 *   DATABASE_URL             required (app-wide) — the story is upserted
 *                            into wallet_stories with provenance='buyer'
 *   DEMO_SECRET              required server secret. A request whose
 *                            `x-demo-key` header matches it is persisted with
 *                            provenance='demo' (hidden from the gallery) and
 *                            may set body.skipImage to force the placeholder
 *                            image (no Midjourney call). Buyers/cron must
 *                            never carry it.
 */

import { createHash } from 'node:crypto';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { type AceLike, buildAgentX402Ace, createAceRendererSerpClient } from '@/cron-adapters';
import { env, resolveRpcUrl, resolveSendRpcUrl, resolveSettleRpcUrl } from '@/env';
import { detectKind } from '@/kind-detector';
import { makeKindRpc } from '@/kind-rpc';
import { type AceChatLike, aceChatJson } from '@/lib/ace-chat-json';
import { buildProviderChainImageClient } from '@/lib/ace-image-client';
import { resolveDemoGate, selectImageClient } from '@/lib/demo-gate';
import { mapDasAsset } from '@/lib/map-das-asset';
import { kindFromReason, type MintErrorKind, verifyFailureKind } from '@/lib/mint-error-kind';
import { resolveTone } from '@/lib/resolve-tone';
import { buildTokenSpotlightSource } from '@/lib/token-spotlight-source';
import { createMintRunsRepo } from '@/mint-runs-repo';
import { runDirector } from '@/modules/director';
import {
  type MintContext,
  type MintRunStore,
  RetryableError,
  runMintFlow,
} from '@/modules/mint-orchestrator';
import { createMemoSender, createSapMemoWriter } from '@/modules/sap-memo-writer';
import {
  type FacilitatorPaymentRequirements,
  facilitatorSettle,
  facilitatorVerify,
} from '@/modules/x402-facilitator';
import {
  createWeb3VerifierRpc,
  createX402Verifier,
  type DedupeStore,
  type X402Verifier,
} from '@/modules/x402-verifier';
import { computeIntentId } from '@/payment-intent';
import {
  fetchNftSpotlights,
  fetchTokenSpotlights,
  fetchTxSpotlights,
  fetchWalletSpotlights,
  type NftSpotlightRpc,
  type SpotlightRpc,
  type SpotlightSigInfo,
  type SpotlightTxInfo,
  type TxSpotlightRpc,
  type WalletSpotlights,
} from '@/spotlight-fetcher';
import {
  type ChatClient,
  type ChatCompleteArgs,
  type ImageClient,
  type RenderDeps,
  receiptToProvenance,
  renderNftStory,
  renderStory,
  renderTokenStory,
  renderTxStory,
  type SerpClient,
  type TxRenderDeps,
  type WalletStory,
} from '@/story-renderer';
import { computeInputHash, createSqlRepo } from '@/story-repo';

// Reactive render runs chat + image generation (IMAGE_PROVIDER, wait:true)
// inline, which can take well over a minute. Allow the function the platform max
// so the connection isn't reset mid-render (the cause of replay ECONNRESET).
export const maxDuration = 300;

// Cap inline image generation so a slow/hanging provider can't reset the
// request connection; fall back to a placeholder past this budget.
const IMAGE_GEN_TIMEOUT_MS = env.IMAGE_GEN_TIMEOUT_MS;
// flux requires an explicit size; landscape for the wallet-story hero.
// Ace cortex caps each dimension at 1440; 1344x768 keeps the 1.75 ratio in-range.
const HERO_IMAGE_SIZE = '1344x768';
// Midjourney tuning: fast mode + lowest quality = quicker render + cheaper GPU.
// MJ ignores `size`; landscape comes from `--ar`, single panel from split_images.
const MJ_MODE = 'fast';
const MJ_QUALITY = '.25';
const MJ_ASPECT = '16:9';
// seedream / nano-banana reject the request unless a concrete model is named.
// Defaults: seedream 4.0 (fast + takes `size`), nano-banana base (fastest).
const IMAGE_MODELS: Record<string, string> = {
  seedream: 'doubao-seedream-4-0-250828',
  'nano-banana': 'nano-banana',
};
const PLACEHOLDER_IMAGE_URL =
  env.PLACEHOLDER_IMAGE_URL ?? 'https://chainbard.vercel.app/chainbard-mark.svg';

const USDC_MINT = env.USDC_MINT;
const AGENT_WALLET = env.NEXT_PUBLIC_AGENT_WALLET;
const RPC_URL = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);
// SAP memo (audit write) — generic send RPC, an explicit override is fine.
const SEND_RPC_URL = resolveSendRpcUrl(env.SOLANA_SEND_RPC_URL, env.SOLANA_RPC_URL);
// x402 USDC settlement (agent → AceData) — Synapse-first for compliance (Cat-2).
const SETTLE_RPC_URL = resolveSettleRpcUrl(env.SYNAPSE_RPC_URL, env.SOLANA_RPC_URL);

const VERIFIER_RPC_URL = resolveRpcUrl(env.SYNAPSE_RPC_URL, env.SOLANA_RPC_URL);
const FACILITATOR = env.ACE_FACILITATOR_PUBKEY;
const FACILITATOR_URL = env.ACE_FACILITATOR_URL;
const PRICE_USDC = env.MINT_PRICE_USDC;
const PRICE_ATOMIC = BigInt(Math.round(PRICE_USDC * 1_000_000));

const AGENT_DEST_ATA = getAssociatedTokenAddressSync(
  new PublicKey(USDC_MINT),
  new PublicKey(AGENT_WALLET),
).toBase58();

// Durable idempotency now lives in the `mint_runs` table (keyed on intentId =
// sha256 of the buyer's partial-signed tx) plus the facilitator's on-chain
// nonce — see the intentId entry flow in POST. The maps below are best-effort,
// PROCESS-SCOPED optimizations only; correctness no longer depends on them.
//
// mintStoreMem: in-memory orchestrator step store. A cold start mid-render just
// re-renders (wasted Ace compute, idempotent overwrite, buyer NEVER recharged
// because the settled sig is reused from mint_runs) — acceptable.
const mintStoreMem = new Map<string, MintContext<WalletSpotlights>>();
// dedupeMem: NON-AUTHORITATIVE same-process anti-replay guard for the verifier.
// It only prevents re-verifying the same settled sig twice within one warm
// process. Durable charge-once comes from mint_runs (intentId write-ahead) +
// the facilitator's on-chain nonce, NOT from this set; a cold start clearing it
// cannot cause a double-charge because verify+settle are skipped whenever a
// mint_runs row already records the settled sig. Backing it durably was rejected
// for this pass: the verifier's seen(sig) is keyed on settled_sig, which the
// mint-runs repo does not index (it's keyed on intentId), so a durable lookup
// would need a new query path for no correctness gain.
const dedupeMem = new Set<string>();

const dedupe: DedupeStore = {
  async seen(sig) {
    return dedupeMem.has(sig);
  },
  async mark(sig) {
    dedupeMem.add(sig);
  },
};

const mintStore: MintRunStore<WalletSpotlights> = {
  async get(key) {
    return mintStoreMem.get(key) ?? null;
  },
  async put(key, ctx) {
    mintStoreMem.set(key, ctx);
  },
};

interface Envelope {
  x402Version?: number;
  scheme?: string;
  network?: string;
  // Base64 partial-signed USDC transfer (fee-payer = facilitator). The server
  // settles it via the AceData facilitator; the settled sig is verified on-chain.
  payload?: { transaction?: string };
}

interface MintBody {
  input?: string;
  buyer?: string;
  tone?: string;
  /** Untrusted buyer brief that steers voice/angle via the Director. */
  brief?: string;
  skipImage?: boolean;
}

function paymentRequired(resource: string) {
  return Response.json(
    {
      x402Version: 2,
      accepts: [
        {
          scheme: 'exact',
          network: 'solana',
          maxAmountRequired: PRICE_ATOMIC.toString(),
          maxTimeoutSeconds: 120,
          resource,
          description: 'chainbard reactive story mint',
          payTo: AGENT_WALLET,
          asset: USDC_MINT,
          extra: {
            decimals: 6,
            facilitator: FACILITATOR,
            // x402 client compiles the payment with this fee-payer; the server
            // settles it via the AceData facilitator at facilitatorUrl.
            feePayer: FACILITATOR,
            facilitatorUrl: FACILITATOR_URL,
          },
        },
      ],
    },
    { status: 402 },
  );
}

function decodeEnvelope(header: string): Envelope | null {
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as Envelope;
  } catch {
    return null;
  }
}

// The facilitator broadcasts on /settle, but the settled tx may not be visible
// to our RPC for a few seconds. Wait for confirmation before the orchestrator's
// on-chain re-verify so a fresh settle doesn't false-negative as `tx-not-found`.
async function confirmSettled(
  connection: Connection,
  sig: string,
  timeoutMs = 45_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
    if (value?.err) return false;
    if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

// Stateless on-chain recovery of an already-settled payment sig. This is now a
// NARROW fallback used ONLY for the one ambiguous mint_runs window: a row stuck
// at state='settling' (write-ahead inserted, then the process crashed before we
// could record the settled sig). In that window we don't know whether /settle
// charged the buyer, so we scan the agent destination ATA for the buyer's
// settled transfer and re-validate each candidate with the SAME audited verifier
// the flow uses; the freshest verifier-OK sig is the one to resume on. Normal
// replays (state 'settled'/'published') reuse the recorded sig and NEVER scan.
async function recoverSettledSig(
  connection: Connection,
  verifier: X402Verifier,
  opts: { destAta: string; buyer: string; mint: string; amount: bigint },
): Promise<string | null> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(opts.destAta), {
    limit: 25,
  });
  for (const { signature, err } of sigs) {
    if (err) continue;
    const res = await verifier.verifyPayment({
      signature,
      expectedBuyer: opts.buyer,
      expectedMint: opts.mint,
      expectedAmount: opts.amount,
      expectedDestAta: opts.destAta,
    });
    if (res.ok) return signature;
  }
  return null;
}

function hashStory(story: WalletStory): string {
  // Stable hash by stringifying the canonical fields the buyer paid for.
  const canonical = JSON.stringify({
    kind: story.kind,
    input: story.input,
    tone: story.tone,
    title: story.title,
    subtitle: story.subtitle,
    stats: story.stats,
    sections: story.sections,
    verdict: story.verdict,
    heroImageUrl: story.heroImageUrl,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function buildSpotlightRpc(connection: Connection): SpotlightRpc {
  return {
    async getBalance(pubkey) {
      return BigInt(await connection.getBalance(new PublicKey(pubkey)));
    },
    async getSignaturesForAddress(pubkey, opts) {
      const sigs = await connection.getSignaturesForAddress(new PublicKey(pubkey), {
        limit: opts?.limit ?? 50,
      });
      return sigs.map((s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ?? null,
        err: s.err,
      }));
    },
    async getTransaction(sig) {
      const tx = await connection.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (!tx) return null;
      const keys = tx.transaction.message.getAccountKeys();
      const accountKeys: string[] = [];
      for (let i = 0; i < keys.length; i++) {
        const k = keys.get(i);
        if (k) accountKeys.push(k.toBase58());
      }
      return {
        accountKeys,
        ixCount: tx.transaction.message.compiledInstructions.length,
        blockTime: tx.blockTime ?? null,
        err: tx.meta?.err ?? null,
        feeLamports: tx.meta?.fee ?? 0,
      };
    },
    async getTokenAccountsByOwner(pubkey) {
      const resp = await connection.getParsedTokenAccountsByOwner(new PublicKey(pubkey), {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });
      return { count: resp.value.length };
    },
    async getAssetsByOwner() {
      // Optional — return 0 so the spotlights still render without DAS access.
      return { count: 0 };
    },
  };
}

function buildTxRpc(rpcUrl: string): TxSpotlightRpc {
  return {
    async getTransactionDetails(sig) {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            sig,
            {
              encoding: 'jsonParsed',
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const tx = json.result as {
        slot: number;
        blockTime?: number;
        transaction: {
          message: {
            accountKeys: Array<{ pubkey?: string } | string>;
            instructions: Array<{ programId?: string; programIdIndex?: number }>;
          };
        };
        meta: {
          fee?: number;
          err?: unknown;
          preBalances?: number[];
          postBalances?: number[];
          computeUnitsConsumed?: number;
        };
      } | null;
      if (!tx) return null;

      const accountKeys: string[] = tx.transaction.message.accountKeys.map(
        (k: { pubkey?: string } | string) => (typeof k === 'string' ? k : (k.pubkey ?? '')),
      );
      const signerPubkey = accountKeys[0] ?? null;
      const ixs = tx.transaction.message.instructions as Array<{
        programId?: string;
        programIdIndex?: number;
      }>;
      const ixProgramIds = ixs.map(
        (ix) => ix.programId ?? accountKeys[ix.programIdIndex ?? 0] ?? '',
      );
      const pre = (tx.meta.preBalances ?? []) as number[];
      const post = (tx.meta.postBalances ?? []) as number[];
      const balanceDeltas = accountKeys
        .map((pubkey, i) => ({
          pubkey,
          preLamports: BigInt(pre[i] ?? 0),
          postLamports: BigInt(post[i] ?? 0),
        }))
        .filter((d) => d.preLamports !== d.postLamports);

      return {
        slot: tx.slot,
        blockTime: tx.blockTime ?? null,
        feeLamports: tx.meta.fee ?? 0,
        computeUnitsConsumed: tx.meta.computeUnitsConsumed ?? null,
        accountKeys,
        signerPubkey,
        ixProgramIds,
        revertedInstructionIndices: [],
        balanceDeltas,
        err: tx.meta.err ?? null,
      };
    },
  };
}

function buildNftRpc(rpcUrl: string): NftSpotlightRpc {
  return {
    async getAsset(mint) {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAsset',
            params: { id: mint },
          }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return mapDasAsset(json.result);
      } catch {
        return null;
      }
    },
    async getSignaturesForAddress(address, { limit }) {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [address, { limit }],
          }),
        });
        if (!res.ok) return [];
        const json = await res.json();
        const items = Array.isArray(json.result) ? json.result : [];
        return items.map(
          (s: { signature: string; slot: number; blockTime?: number; err?: unknown }) => ({
            signature: s.signature,
            slot: s.slot,
            blockTime: s.blockTime ?? null,
            err: s.err ?? null,
          }),
        ) as SpotlightSigInfo[];
      } catch {
        return [];
      }
    },
    async getTransaction(sig) {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const tx = json.result as {
          blockTime?: number;
          transaction: {
            message: {
              accountKeys: Array<{ pubkey?: string } | string>;
              instructions: Array<unknown>;
            };
          };
          meta: { fee?: number; err?: unknown };
        } | null;
        if (!tx) return null;
        const accountKeys: string[] = tx.transaction.message.accountKeys.map(
          (k: { pubkey?: string } | string) => (typeof k === 'string' ? k : (k.pubkey ?? '')),
        );
        return {
          accountKeys,
          ixCount: tx.transaction.message.instructions.length,
          feeLamports: tx.meta.fee ?? 0,
          blockTime: tx.blockTime ?? null,
          err: tx.meta.err ?? null,
        } as SpotlightTxInfo;
      } catch {
        return null;
      }
    },
  };
}

async function buildAceClients(
  skipImage: boolean,
  agent: Keypair,
  settleConnection: Connection,
  fallbackConnection?: Connection,
): Promise<{ chat: ChatClient; image: ImageClient; serp: SerpClient; ace: AceChatLike }> {
  // Reactive buy-side is x402 (ADR 0016 B): the SAME agent self-broadcast facade
  // the cron tick uses settles every paid call (chat / multi-SERP / image) in
  // USDC — Cat-2 volume. There is no bearer/credit fallback. The reactive
  // SELL-SIDE (the buyer's 0.30 USDC via the facilitator) is UNCHANGED.
  // Settlement is Synapse-first; solana_send (fallbackConnection) lands it if
  // Synapse can't confirm in time — same signed tx, so no double-spend.
  const ace = await buildAgentX402Ace(agent, settleConnection, undefined, { fallbackConnection });

  const chat: ChatClient = {
    async complete<T>(args: ChatCompleteArgs<T>) {
      const { data, promptTokens, completionTokens, model } = await aceChatJson({
        ace: ace as unknown as AceChatLike,
        system: args.system,
        user: args.user,
        schema: args.schema,
      });
      return { data, promptTokens, completionTokens, model };
    },
  };

  // Shared nano-banana → seedream → placeholder provider chain (ADR 0014),
  // extracted to @/lib/ace-image-client so the cron tick renders on the same
  // chain. Behaviour-preserving: same de-duped provider order, per-provider
  // opts, timeout, and deterministic placeholder fallback.
  const realImage: ImageClient = buildProviderChainImageClient(
    ace as unknown as Parameters<typeof buildProviderChainImageClient>[0],
    {
      providers: [...new Set([env.IMAGE_PROVIDER, env.IMAGE_FALLBACK_PROVIDER])],
      models: IMAGE_MODELS,
      size: HERO_IMAGE_SIZE,
      timeoutMs: IMAGE_GEN_TIMEOUT_MS,
      placeholderUrl: PLACEHOLDER_IMAGE_URL,
      midjourney: { mode: MJ_MODE, quality: MJ_QUALITY, aspect: MJ_ASPECT },
    },
  );

  // Demo runs (gated by x-demo-key) force the placeholder and never call the
  // image provider — keeps demos fast and free of image cost.
  const image = selectImageClient(skipImage, { realImage, placeholderUrl: PLACEHOLDER_IMAGE_URL });
  // SERP rides the x402 facade too (ace.search.google), reusing the cron's
  // renderer serp client so every leg of the reactive render is Cat-2 spend.
  const serp = createAceRendererSerpClient(ace as AceLike);
  return { chat, image, serp, ace: ace as unknown as AceChatLike };
}

function loadAgentKeypair(): Keypair {
  return Keypair.fromSecretKey(bs58.decode(env.AGENT_SECRET_KEY_BASE58));
}

// Enqueue the durable media-attach job (ADR 0016 D): the published story ships
// immediately (chat + multi-SERP + image inline); video/audio land out-of-band.
// Fail-soft + non-blocking — a missing QStash token or a publish error never
// fails the already-charged mint; the page just renders without media. Triggers
// the @upstash/workflow serve() route with { input } as the initial payload.
async function enqueueMediaAttach(input: string, log: MintLog): Promise<void> {
  if (!env.QSTASH_TOKEN) {
    log('media-attach enqueue skipped (no QSTASH_TOKEN)');
    return;
  }
  try {
    const { Client } = await import('@upstash/qstash');
    const client = new Client({ token: env.QSTASH_TOKEN });
    const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/workflow/media-attach`;
    await client.publishJSON({ url, body: { input } });
    log('media-attach enqueued', { url });
  } catch (err) {
    log('media-attach enqueue failed (non-fatal)', { reason: (err as Error).message });
  }
}

// ── NDJSON progress contract (server-emitted steps) ──────────────────────────
// Server StepIds, in order: verify → settle → confirm → direct → facts →
//   search(tx + token) → write → paint → save → memo. ('build'/'dry-run'/'sign'
//   are client-only; 'direct' only fires when the buyer supplied a brief.)
type StepId =
  | 'verify'
  | 'settle'
  | 'confirm'
  | 'direct'
  | 'facts'
  | 'search'
  | 'write'
  | 'paint'
  | 'save'
  | 'memo';

type MintEvent =
  | { t: 'step'; id: StepId; status: 'active' }
  | { t: 'step'; id: StepId; status: 'done'; sig?: string }
  | { t: 'done'; shareUrl: string; paymentSig: string; memoSig: string }
  | { t: 'error'; id: StepId; kind: MintErrorKind; reason: string; paymentSig?: string };

// Verbose seam logging for debugging the paid flow. Every line is tagged
// `[mint/story <reqId> +<ms>ms]` so a single mint can be reconstructed from the
// Vercel function logs (low QPS — every paid request is worth a full trace).
// Untrusted buyer fields (brief) are logged as length/hash only, never raw.
type MintLog = (msg: string, extra?: Record<string, unknown>) => void;
function mintLogger(reqId: string): MintLog {
  const t0 = Date.now();
  return (msg, extra) => {
    const ms = Date.now() - t0;
    if (extra) console.log(`[mint/story ${reqId} +${ms}ms] ${msg}`, extra);
    else console.log(`[mint/story ${reqId} +${ms}ms] ${msg}`);
  };
}

export async function POST(req: Request) {
  const reqId = Math.random().toString(36).slice(2, 8);
  const log = mintLogger(reqId);
  const resource = req.url;
  const header = req.headers.get('x-payment');
  log('POST received', {
    hasXPayment: Boolean(header),
    xPaymentLen: header?.length ?? 0,
    hasDemoKey: Boolean(req.headers.get('x-demo-key')),
  });
  if (!header) {
    log('no X-Payment → 402 PaymentRequired', { price: PRICE_USDC, payTo: AGENT_WALLET });
    return paymentRequired(resource);
  }

  const envelope = decodeEnvelope(header);
  const txB64 = envelope?.payload?.transaction;
  if (!envelope || !txB64) {
    log('400 invalid X-Payment envelope', { decoded: Boolean(envelope) });
    return Response.json(
      { error: 'invalid X-Payment envelope (expected payload.transaction)' },
      { status: 400 },
    );
  }
  // Durable idempotency key: sha256 of the buyer's partial-signed tx. Stable
  // across envelope replays of the SAME payment, unique per fresh signature,
  // instance-independent, computed pre-settle — it tells a Re-mint (new intent)
  // from a Resume (same intent). Drives the mint_runs entry flow below.
  const intentId = computeIntentId(txB64);
  log('X-Payment envelope decoded', {
    scheme: envelope.scheme,
    network: envelope.network,
    x402Version: envelope.x402Version,
    txB64Len: txB64.length,
    intentId,
  });

  let body: MintBody;
  try {
    body = (await req.json()) as MintBody;
  } catch {
    log('400 invalid JSON body');
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const input = body.input?.trim();
  const buyer = body.buyer?.trim();
  if (!input || !buyer) {
    log('400 missing input/buyer', { hasInput: Boolean(input), hasBuyer: Boolean(buyer) });
    return Response.json({ error: 'body must include `input` and `buyer`' }, { status: 400 });
  }
  log('body parsed', {
    input,
    buyer,
    tone: body.tone,
    hasBrief: Boolean(body.brief?.trim()),
    briefLen: body.brief?.length ?? 0,
    bodySkipImage: body.skipImage === true,
  });

  // Gated demo exception: a valid x-demo-key tags this row `provenance='demo'`
  // (isolated from real volume) and may force the placeholder image. Without
  // it the route behaves exactly as a buyer mint and any skipImage is ignored.
  const gate = resolveDemoGate({
    demoKey: req.headers.get('x-demo-key'),
    skipImage: body.skipImage === true,
    demoSecret: env.DEMO_SECRET,
  });
  // In local dev the demo secret is often unwired; still honor an explicit
  // skipImage so `bun run demo --target local` never burns ACE on an image.
  // Production keeps the strict demo gate (only a valid x-demo-key may skip).
  const skipImage = gate.skipImage || (env.NODE_ENV !== 'production' && body.skipImage === true);
  log('demo gate resolved', {
    provenance: gate.provenance,
    gateSkipImage: gate.skipImage,
    effectiveSkipImage: skipImage,
    nodeEnv: env.NODE_ENV,
  });

  log('detecting kind…', { input });
  const { rpc: kindRpc, assetLookup } = makeKindRpc();
  const kind = await detectKind(input, kindRpc, assetLookup);
  log('kind detected', { kind: kind.kind });

  // Guard: only wallet, tx, nft, and token kinds reach the render path.
  // (catches any future unknown variant)
  if (
    kind.kind !== 'wallet' &&
    kind.kind !== 'tx' &&
    kind.kind !== 'nft' &&
    kind.kind !== 'token'
  ) {
    const _: never = kind;
    log('400 unsupported kind', { kind: (kind as { kind: string }).kind });
    return Response.json(
      { error: `reactive mint only supports wallet, tx, nft, and token kinds` },
      { status: 400 },
    );
  }

  let agent: Keypair;
  try {
    agent = loadAgentKeypair();
    log('agent keypair loaded', { agentPubkey: agent.publicKey.toBase58() });
  } catch (err) {
    log('500 agent keypair load failed', { reason: (err as Error).message });
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  log('rpc connection ready', { rpcUrl: RPC_URL, destAta: AGENT_DEST_ATA });

  // Dedicated Synapse-primary connection for the x402-verifier's on-chain
  // re-verification reads (getTransaction/getSlot). Separate from `connection`
  // so the general spotlight/tx/nft/token reads and the facilitator advisory
  // rpcUrl stay on the reliable chain (ADR 0012).
  const verifierConnection = new Connection(VERIFIER_RPC_URL, 'confirmed');

  // Settle the buyer's partial-signed payment through AceData's OWN facilitator.
  // /verify is a non-destructive gate; /settle co-signs (fee-payer = FACILITATOR)
  // and broadcasts. We settle BEFORE the (slow) render so the buyer's tx blockhash
  // can't expire mid-render — the buyer trusts the render-after-pay path (ADR 0001).
  const requirements: FacilitatorPaymentRequirements = {
    scheme: 'exact',
    network: 'solana',
    maxAmountRequired: PRICE_ATOMIC.toString(),
    resource,
    description: 'chainbard reactive story mint',
    payTo: AGENT_WALLET,
    asset: USDC_MINT,
    maxTimeoutSeconds: 120,
    // The facilitator uses this rpcUrl to READ buyer token-account state during
    // /verify (and to broadcast on /settle). It must be a full read-capable RPC —
    // NOT SEND_RPC_URL, which may be a submit-only endpoint (e.g. Helius Sender)
    // that can't serve getAccountInfo, making /verify reject with "TokenLedger
    // account must match transfer source". SEND_RPC_URL stays for our own
    // broadcasts (memo, line 1088).
    extra: { decimals: 6, feePayer: FACILITATOR, rpcUrl: RPC_URL },
  };

  const inputHash = computeInputHash(input);
  const tone = resolveTone(body.tone, kind.kind);

  // Buyer brief (provenance/audit only; never part of identity). A whitespace-
  // only brief is treated as absent. briefHash is always recorded — sha256('')
  // for a briefless mint — so the memo + row carry a stable provenance digest.
  const brief = body.brief?.trim() ? body.brief : '';
  const briefHash = createHash('sha256').update(brief).digest('hex');
  log('render params resolved', {
    inputHash,
    tone,
    briefHash: briefHash.slice(0, 12),
    hasBrief: brief.length > 0,
  });
  log('opening NDJSON stream → entering paid path');

  // From here the work is the paid path (verify → settle → confirm → render →
  // persist → memo). Status 200 is committed before the body, so every failure
  // is an in-stream terminal `error` event, not an HTTP error code. One JSON
  // object per line ('\n'-terminated), flushed as each seam completes.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Whether a terminal `done`/`error` line has been emitted. The catch-all
      // below reads this to guarantee the NDJSON contract (the stream ALWAYS ends
      // with a terminal event) without double-emitting after a handled failure.
      let terminalEmitted = false;
      // Set to the settled payment sig once the buyer is definitively charged, so
      // an unexpected throw AFTER settlement still surfaces paymentSig (→ Resume).
      let chargedSig: string | null = null;

      // Every emitted seam event is mirrored to the function log so the full
      // verify→settle→confirm→…→done/error sequence is reconstructable.
      const emit = (event: MintEvent) => {
        if (event.t === 'step') {
          log(
            `emit step ${event.id} ${event.status}`,
            'sig' in event && event.sig ? { sig: event.sig } : undefined,
          );
        } else if (event.t === 'done') {
          terminalEmitted = true;
          log('emit done', { paymentSig: event.paymentSig, memoSig: event.memoSig });
        } else {
          terminalEmitted = true;
          log(`emit error @${event.id}`, { kind: event.kind, reason: event.reason });
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      // Build the verifier up here (was created post-confirm) so the 'settling'
      // recovery fallback can re-validate on-chain candidates with the SAME
      // audited check the orchestrator uses downstream.
      const verifier = createX402Verifier({
        rpc: createWeb3VerifierRpc(verifierConnection),
        dedupe,
        // ~5.5h window. The render can take minutes and a paid buyer may need
        // to replay across a redeploy; 5_000 (~33min) was too tight and
        // stranded paid sigs as `stale-slot`. Double-spend is still bounded by
        // dedupe-on-publish.
        freshnessSlots: 50_000,
      });

      // Durable mint-run store (same neon import pattern as persistStory). Keyed
      // on intentId; replaces the correctness role of the old settledSigMem.
      const { neon } = await import('@neondatabase/serverless');
      const mintRunsRepo = createMintRunsRepo(
        neon(env.DATABASE_URL) as Parameters<typeof createMintRunsRepo>[0],
      );

      try {
        // Fresh verify+settle with WRITE-AHEAD: insert mint_runs row at
        // state='settling' BEFORE /settle so a crash mid-settle leaves a durable
        // marker. On any pre-settle failure delete the row so a retry starts
        // clean (uncharged). On success record settled_sig + state='settled'.
        // Emits verify/settle steps and returns the settled sig, or null when it
        // has already emitted a terminal error event (caller must `return`).
        const freshVerifyAndSettle = async (): Promise<string | null> => {
          await mintRunsRepo.insertSettling({ intentId, inputHash, buyer });
          log('mint_runs write-ahead → settling', { intentId });

          // ── verify ──────────────────────────────────────────────────────────
          emit({ t: 'step', id: 'verify', status: 'active' });
          log('calling facilitator /verify', { facilitatorUrl: FACILITATOR_URL });
          const verifyRes = await facilitatorVerify(FACILITATOR_URL, txB64, requirements);
          log('facilitator /verify returned', { isValid: verifyRes.isValid });
          if (!verifyRes.isValid) {
            const reason = `facilitator verify: ${verifyRes.invalidReason}`;
            console.error('[mint/story] error facilitator verify', { reason });
            // Pre-settle failure: uncharged. Reap the write-ahead row (only if
            // still 'settling', so a concurrent winner's settled row survives) so
            // a fresh retry starts clean, then error (no paymentSig, never
            // refundable — a replay of an already-settled intent never reaches
            // here, it resumes via the mint_runs entry flow below).
            await mintRunsRepo.deleteIfSettling(intentId);
            emit({ t: 'error', id: 'verify', kind: verifyFailureKind(reason), reason });
            return null;
          }
          emit({ t: 'step', id: 'verify', status: 'done' });

          // ── settle ──────────────────────────────────────────────────────────
          emit({ t: 'step', id: 'settle', status: 'active' });
          log('calling facilitator /settle (broadcasts buyer tx)', {
            facilitatorUrl: FACILITATOR_URL,
          });
          const settleRes = await facilitatorSettle(FACILITATOR_URL, txB64, requirements);
          log('facilitator /settle returned', {
            success: settleRes.success,
            sig: settleRes.transaction ?? null,
          });
          if (!settleRes.success || !settleRes.transaction) {
            const reason = `facilitator settle: ${settleRes.errorReason}`;
            console.error('[mint/story] error facilitator settle', { reason });
            // Settle failed: no charge. Reap the write-ahead row only if still
            // 'settling' (a concurrent winner may have already advanced it to
            // 'settled' — don't delete their row), then error.
            await mintRunsRepo.deleteIfSettling(intentId);
            emit({ t: 'error', id: 'settle', kind: kindFromReason(reason, true), reason });
            return null;
          }
          const settledSig = settleRes.transaction;
          // Charged: persist the settled sig and advance state so any replay of
          // this intent skips verify+settle entirely (no double-charge).
          await mintRunsRepo.markSettled(intentId, settledSig);
          log('mint_runs → settled', { intentId, sig: settledSig });
          // After this point the buyer is charged: every error carries paymentSig.
          emit({ t: 'step', id: 'settle', status: 'done', sig: settledSig });
          return settledSig;
        };

        // ── intentId entry flow ───────────────────────────────────────────────
        // The mint_runs row keyed on intentId is the durable idempotency record.
        // null → fresh mint/re-mint; settled/published → Resume on recorded sig
        // (skip facilitator); settling → ambiguous crash window, recover once.
        const run = await mintRunsRepo.getByIntentId(intentId);
        log('mint_runs lookup', { intentId, state: run?.state ?? null });

        let sig: string;
        if (run === null) {
          const settled = await freshVerifyAndSettle();
          if (settled === null) return;
          sig = settled;
        } else if (run.state === 'published' || run.state === 'settled') {
          // Resume: payment already settled on a prior attempt (render may or may
          // not have finished). Reuse the recorded sig, skip verify+settle (the
          // facilitator would reject the already-used nonce), and let runMintFlow
          // resume — it's idempotent and returns published immediately if done.
          if (!run.settledSig) {
            // Should be impossible (markSettled writes the sig with the state),
            // but guard rather than resume on a null sig.
            const reason = `mint_runs ${run.state} row missing settled_sig`;
            console.error('[mint/story] error mint_runs invariant', { reason, intentId });
            await mintRunsRepo.deleteRun(intentId);
            const settled = await freshVerifyAndSettle();
            if (settled === null) return;
            sig = settled;
          } else {
            log('resume: mint_runs already settled → skip verify+settle', {
              state: run.state,
              sig: run.settledSig,
            });
            sig = run.settledSig;
            emit({ t: 'step', id: 'verify', status: 'done' });
            emit({ t: 'step', id: 'settle', status: 'done', sig });
          }
        } else {
          // state === 'settling': ambiguous crash window — write-ahead row exists
          // but settled_sig was never recorded, so we don't know if /settle
          // charged. Scan on-chain ONCE for the buyer's settled transfer.
          log('mint_runs settling → recovering settled sig on-chain', { intentId });
          const recovered = await recoverSettledSig(connection, verifier, {
            destAta: AGENT_DEST_ATA,
            buyer,
            mint: USDC_MINT,
            amount: PRICE_ATOMIC,
          });
          if (recovered && (await confirmSettled(connection, recovered))) {
            // Settle did happen: record the sig and resume (no double-charge).
            log('settling: recovered settled sig on-chain', { sig: recovered });
            await mintRunsRepo.markSettled(intentId, recovered);
            sig = recovered;
            emit({ t: 'step', id: 'verify', status: 'done' });
            emit({ t: 'step', id: 'settle', status: 'done', sig });
          } else {
            // No settled transfer found: /settle likely never ran. Delete the
            // stale write-ahead row and fall through to a fresh verify+settle
            // (which write-aheads again).
            log('settling: no settled sig found → deleting stale row, retrying fresh');
            await mintRunsRepo.deleteIfSettling(intentId);
            const settled = await freshVerifyAndSettle();
            if (settled === null) return;
            sig = settled;
          }
        }

        // Past this point the buyer is charged: every branch above resolved `sig`
        // from a settled payment. Record it so an unexpected throw downstream still
        // surfaces paymentSig and the UI offers Resume rather than Try-again.
        chargedSig = sig;

        // ── confirm ─────────────────────────────────────────────────────────
        // Defense-in-depth: confirm + re-verify the settled tx on-chain (ADR
        // 0001 — "we verify the settlement tx via x402-verifier").
        emit({ t: 'step', id: 'confirm', status: 'active' });
        log('confirming settled tx on-chain…', { sig });
        const confirmed = await confirmSettled(connection, sig);
        log('on-chain confirmation result', { sig, confirmed });
        if (!confirmed) {
          const reason = `settled tx ${sig} not confirmed`;
          console.error('[mint/story] error confirm', { reason, paymentSig: sig });
          emit({
            t: 'error',
            id: 'confirm',
            kind: kindFromReason(reason, false),
            reason,
            paymentSig: sig,
          });
          return;
        }
        emit({ t: 'step', id: 'confirm', status: 'done' });

        // Memo broadcast goes on the generic send RPC (audit write, not Synapse).
        const memoConnection = new Connection(SEND_RPC_URL, 'confirmed');
        // x402 settlement broadcasts on the Synapse-first settle RPC (compliance).
        const settleConnection = new Connection(SETTLE_RPC_URL, 'confirmed');
        // Memo sender auto-estimates the priority fee from live network congestion
        // (getRecentPrioritizationFees, floored at 5000 µLamports) so the receipt
        // lands without a hand-tuned constant. A 0-fee tx times out the confirm budget.
        const memoWriter = createSapMemoWriter(createMemoSender(memoConnection, agent));

        log('building Ace clients (chat/image/serp)…', { skipImage });
        const aceClients = await buildAceClients(
          skipImage,
          agent,
          settleConnection,
          memoConnection,
        ).catch((err: Error) => err);
        if (aceClients instanceof Error) {
          // Ace client build failed after settle → buyer charged → paymentSig.
          console.error('[mint/story] error ace clients', {
            reason: aceClients.message,
            paymentSig: sig,
          });
          emit({
            t: 'error',
            id: 'write',
            kind: kindFromReason(aceClients.message, false),
            reason: aceClients.message,
            paymentSig: sig,
          });
          return;
        }

        log('Ace clients ready → starting render pipeline', { kind: kind.kind });
        const spotlightRpc = buildSpotlightRpc(connection);
        const txRpc = buildTxRpc(RPC_URL);
        const nftRpcUrl = RPC_URL;
        const nftRpc = buildNftRpc(nftRpcUrl);
        const tokenSource = buildTokenSpotlightSource(nftRpcUrl);

        // Render steps (search/write/paint) are emitted by the renderer itself
        // via onProgress; orchestrator steps (facts/save/memo) come through the
        // orchestrator's onProgress. Both forward into the same emit stream.
        const renderProgress = (id: 'search' | 'write' | 'paint', status: 'active' | 'done') => {
          emit({ t: 'step', id, status });
        };

        // Branch fetch + render by kind, feeding the same runMintFlow persist/memo machinery.
        const txDeps: TxRenderDeps = {
          chat: aceClients.chat,
          serp: aceClients.serp,
          image: aceClients.image,
          onProgress: renderProgress,
        };
        const nftDeps: RenderDeps = {
          chat: aceClients.chat,
          // serp wired so a Director-emitted SERP query (brief-only, nft/wallet)
          // can actually reach the search step; absent a brief plan.serpQuery=''.
          serp: aceClients.serp,
          image: aceClients.image,
          onProgress: renderProgress,
        };
        const tokenDeps: TxRenderDeps = {
          chat: aceClients.chat,
          serp: aceClients.serp,
          image: aceClients.image,
          onProgress: renderProgress,
        };

        const ctx = await runMintFlow<unknown>(
          {
            verifier,
            fetchSpotlights:
              kind.kind === 'tx'
                ? (sig) => fetchTxSpotlights(sig, txRpc) as Promise<unknown>
                : kind.kind === 'nft'
                  ? (mint) => fetchNftSpotlights(mint, nftRpc) as Promise<unknown>
                  : kind.kind === 'token'
                    ? (mint) => fetchTokenSpotlights(mint, tokenSource) as Promise<unknown>
                    : (addr) => fetchWalletSpotlights(addr, spotlightRpc) as Promise<unknown>,
            render: async ({ spotlights, plan }) => {
              log('render start', {
                kind: kind.kind,
                hasPlan: Boolean(plan),
              });
              if (kind.kind === 'tx') {
                const { story, receipts } = await renderTxStory(
                  spotlights as Awaited<ReturnType<typeof fetchTxSpotlights>>,
                  tone,
                  txDeps,
                  plan,
                );
                return {
                  story: story as unknown as WalletStory,
                  // Complete service-provenance receipt, every leg (ADR 0016 E/6).
                  aceReceipts: receipts.map(receiptToProvenance),
                };
              }
              if (kind.kind === 'nft') {
                const { story, receipts } = await renderNftStory(
                  spotlights as Awaited<ReturnType<typeof fetchNftSpotlights>>,
                  tone,
                  nftDeps,
                  plan,
                );
                return {
                  story: story as unknown as WalletStory,
                  // Complete receipt incl. serp (the nft path now searches) — no
                  // leg silently dropped to 'unknown' (ADR 0016 E/6).
                  aceReceipts: receipts.map(receiptToProvenance),
                };
              }
              if (kind.kind === 'token') {
                const { story, receipts } = await renderTokenStory(
                  spotlights as Awaited<ReturnType<typeof fetchTokenSpotlights>>,
                  tone,
                  tokenDeps,
                  plan,
                );
                return {
                  story: story as unknown as WalletStory,
                  aceReceipts: receipts.map(receiptToProvenance),
                };
              }
              const { story, receipts } = await renderStory(
                spotlights as WalletSpotlights,
                'wallet',
                tone,
                { ...aceClients, onProgress: renderProgress },
                plan,
              );
              return {
                story,
                aceReceipts: receipts.map(receiptToProvenance),
              };
            },
            persistStory: async ({ story }) => {
              log('persisting story → wallet_stories', {
                inputHash,
                provenance: gate.provenance,
                title: (story as { title?: string }).title,
                heroImageModel: (story as { heroImageUrl?: string }).heroImageUrl ? 'set' : 'none',
              });
              try {
                const { neon } = await import('@neondatabase/serverless');
                const sql = neon(env.DATABASE_URL);
                const repo = createSqlRepo(sql as Parameters<typeof createSqlRepo>[0]);
                await repo.upsert({
                  inputHash,
                  input,
                  story,
                  provenance: gate.provenance,
                  brief: brief || null,
                  briefHash,
                });
                log('story persisted', { inputHash });
                return { id: inputHash };
              } catch (err) {
                // DB write failure is retryable — buyer already paid; retry on resume.
                log('db upsert FAILED (retryable)', { reason: (err as Error).message });
                throw new RetryableError(`db upsert: ${(err as Error).message}`);
              }
            },
            director: runDirector,
            ace: aceClients.ace,
            memoWriter,
            hashStory,
            now: () => Date.now(),
            // facts/save/memo (memo done carries memoSig); the route forwards
            // them as `step` events on the same stream.
            onProgress: (id, status, memoStepSig) => {
              if (status === 'done' && memoStepSig) {
                emit({ t: 'step', id, status, sig: memoStepSig });
              } else {
                emit({ t: 'step', id, status });
              }
            },
          },
          mintStore,
          {
            input,
            buyer,
            paymentSig: sig,
            inputHash,
            expectedMint: USDC_MINT,
            expectedAmount: PRICE_ATOMIC,
            expectedDestAta: AGENT_DEST_ATA,
            brief,
            kind: kind.kind,
          },
        );
        log('orchestrator returned', { state: ctx.state, memoSig: ctx.effects.memoSig ?? null });

        // Orchestrator terminal failures. The buyer has already settled, so each
        // error carries paymentSig (Resume boundary, not Try-again).
        if (ctx.state === 'refundable') {
          console.error('[mint/story] error refundable', {
            reason: ctx.failureReason,
            verifierReason: ctx.verifierReason,
            paymentSig: sig,
          });
          const reason = ctx.failureReason ?? 'refundable';
          emit({
            t: 'error',
            id: 'memo',
            kind: kindFromReason(reason, true),
            reason,
            paymentSig: sig,
          });
          return;
        }
        if (ctx.state === 'fatal') {
          console.error('[mint/story] error fatal', {
            reason: ctx.failureReason,
            paymentSig: sig,
          });
          const reason = ctx.failureReason ?? 'fatal';
          emit({
            t: 'error',
            id: 'memo',
            kind: kindFromReason(reason, false),
            reason,
            paymentSig: sig,
          });
          return;
        }
        if (ctx.state === 'retryable') {
          console.error('[mint/story] error retryable', {
            reason: ctx.failureReason,
            paymentSig: sig,
          });
          const reason = ctx.failureReason ?? 'retryable';
          emit({
            t: 'error',
            id: 'memo',
            kind: kindFromReason(reason, false),
            reason,
            paymentSig: sig,
          });
          return;
        }

        // Publish receipts onto the persisted row so the share page can surface
        // them on subsequent visits.
        if (ctx.effects.memoSig) {
          try {
            const { neon } = await import('@neondatabase/serverless');
            const sql = neon(env.DATABASE_URL);
            const repo = createSqlRepo(sql as Parameters<typeof createSqlRepo>[0]);
            await repo.attachReceipts(inputHash, {
              memoSig: ctx.effects.memoSig,
              paymentSig: sig,
            });
            log('receipts attached to row', { inputHash, memoSig: ctx.effects.memoSig });
          } catch (err) {
            // Non-fatal: share page falls back to no-links state until manual repair.
            log('receipts attach failed (non-fatal)', { reason: (err as Error).message });
          }
        }

        // Fully published: BOTH paymentSig and memoSig exist (memo is gated on
        // ctx.effects.memoSig above). Advance the durable run to 'published' so a
        // future replay of this intent short-circuits to Resume.
        try {
          await mintRunsRepo.markPublished(intentId);
          log('mint_runs → published', { intentId });
        } catch (err) {
          // Non-fatal: the row stays at 'settled'; a replay still resumes
          // idempotently (skips verify+settle, re-runs the flow which no-ops).
          log('mint_runs markPublished failed (non-fatal)', { reason: (err as Error).message });
        }

        // Enqueue the durable media-attach job (ADR 0016 D). Skipped for demo
        // runs (isolated, throwaway) so they never spend on out-of-band media.
        if (gate.provenance !== 'demo') {
          await enqueueMediaAttach(input, log);
        }

        emit({
          t: 'done',
          shareUrl: `/${encodeURIComponent(input)}`,
          paymentSig: sig,
          memoSig: ctx.effects.memoSig ?? '',
        });
      } catch (err) {
        // Unexpected throw inside the paid path. The NDJSON contract requires the
        // stream to end with a terminal event; the `finally` below closes it, so a
        // re-throw here would just close cleanly with NO terminal line — which the
        // client reports as the cryptic "mint stream closed without a terminal
        // event". Instead emit a terminal `error` (carrying paymentSig when the
        // buyer was already charged → Resume) so the UI shows the real reason.
        const reason = (err as Error)?.message ?? String(err);
        log('UNHANDLED error in paid path', { reason, charged: Boolean(chargedSig) });
        if (!terminalEmitted) {
          emit({
            t: 'error',
            id: 'memo',
            kind: kindFromReason(reason, Boolean(chargedSig)),
            reason,
            ...(chargedSig ? { paymentSig: chargedSig } : {}),
          });
        }
      } finally {
        log('stream closing');
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

export async function GET(req: Request) {
  return paymentRequired(req.url);
}
