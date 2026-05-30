/**
 * ace:debug — the single verbose end-to-end ACE-flow debug runner (ADR 0016 H).
 *
 * Walks the WHOLE ACE flow for ONE input, reusing the production modules:
 *   detect → spotlights → director → multi-SERP → render → image → video →
 *   audio → persist → memo.
 *
 * For EACH stage it prints the provider + model in use, the output (and the
 * URL/link when there is one), and on failure the error message PLUS its root
 * cause (walking the err.cause / err.cause1 / err.cause2 / AggregateError chain).
 *
 * Dual-mode (operator-only, so verbose cost estimates + the full ACE receipt
 * provenance are fine here — NEVER ship this output to a public surface):
 *   default        SIMULATES — no real x402 spend, no broadcast, no DB writes.
 *                  Detect + spotlights are FREE RPC reads, so they run for real;
 *                  the paid legs (director / render / image / video / audio) and
 *                  the broadcasting legs (persist / memo) narrate what WOULD
 *                  happen, with cost estimates and the provider+model that would
 *                  be used.
 *   --live         Runs the REAL flow: the agent x402 self-broadcast rail settles
 *                  every paid call, media is generated + collected, and the story
 *                  is persisted + an on-chain SAP memo is written.
 *
 * Usage:
 *   bun run ace:debug <input>            # simulate (default)
 *   bun run ace:debug <input> --live     # real x402 spend + real artifacts
 *
 * Env (validated per-need via requireEnv):
 *   SOLANA_RPC_URL / SYNAPSE_RPC_URL  read RPC (detect + spotlights)
 *   ACE_API_KEY                       AceData token (presence-checked for --live)
 *   AGENT_SECRET_KEY_BASE58           agent keypair — x402 payer + memo signer (--live)
 *   DATABASE_URL                      Postgres (persist; --live only)
 *   ACE_CHAT_MODEL_HEAVY              heavy WRITE/Director chat model (optional)
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { RENDER_COST_USDC } from '@/cost-guard';
import {
  type AceLike,
  buildAgentX402Ace,
  buildMediaClients,
  type CronEnv,
  createAceRenderChatClient,
  createAceRendererSerpClient,
} from '@/cron-adapters';
import { detectKind, type KindResult } from '@/kind-detector';
import type { AceChatLike } from '@/lib/ace-chat-json';
import { buildProviderChainImageClient } from '@/lib/ace-image-client';
import { mapDasAsset } from '@/lib/map-das-asset';
import { enrichStoryMedia, type MediaEnrichableStory } from '@/lib/media-enrich';
import { resolveTone } from '@/lib/resolve-tone';
import { buildTokenSpotlightSource } from '@/lib/token-spotlight-source';
import { type Plan, runDirector, type Spotlights } from '@/modules/director';
import { createMemoSender, createSapMemoWriter } from '@/modules/sap-memo-writer';
import {
  fetchNftSpotlights,
  fetchTokenSpotlights,
  fetchTxSpotlights,
  fetchWalletSpotlights,
  type NftSpotlightRpc,
  type SpotlightRpc,
  type SpotlightSigInfo,
  type SpotlightTxInfo,
  type TxRpcDetails,
  type TxSpotlightRpc,
} from '@/spotlight-fetcher';
import {
  type ImageClient,
  type Receipt,
  receiptToProvenance,
  renderNftStory,
  renderStory,
  renderTokenStory,
  renderTxStory,
  type Tone,
  type TxRenderDeps,
} from '@/story-renderer';
import { computeInputHash } from '@/story-repo';
import {
  env,
  requireEnv,
  resolveRpcUrl,
  resolveSendRpcUrl,
  resolveSettleRpcUrl,
  rpcHost,
} from '../src/env/cli';

// ── Args ────────────────────────────────────────────────────────────────────

const LIVE = process.argv.includes('--live');
const INPUT = process.argv.slice(2).find((a) => !a.startsWith('--'));

// ── Verbose cost estimates (operator-only; never public, ADR 0016 H) ──────────
// Rough per-call USDC the operator wants surfaced in this debug runner. The real
// ceiling is the wallet balance (ADR 0015/0016 G); these are narration only.
const COST = {
  chat: RENDER_COST_USDC, // 1 heavy LLM write (env: ACE_COST_PER_RENDER_USDC)
  serp: 0.005, // per SERP query
  image: 0.02, // 1 inline image
  video: 0.1, // 1 async video task
  audio: 0.02, // 1 async TTS task
  solFee: 0.000005, // dust SOL per self-broadcast settlement
};

// ── Stage logging + result table ──────────────────────────────────────────────

interface StageResult {
  stage: string;
  status: 'ok' | 'sim' | 'fail' | 'skip';
  detail: string;
}

const results: StageResult[] = [];

function header(): void {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ace:debug — end-to-end ACE-flow walk (${LIVE ? 'LIVE' : 'SIMULATE'})`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  input: ${INPUT}`);
  // Host only — RPC URLs embed API keys, never log the full URL.
  console.log(`  rpc host: ${rpcHost(resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL))}`);
  if (LIVE) {
    console.log('  ⚠ LIVE: each paid stage settles real USDC and broadcasts on-chain.');
  } else {
    console.log('  simulate: paid/broadcast stages are narrated; free reads run for real.');
  }
  console.log();
}

function stage(name: string): void {
  console.log(`\n[${name}]`);
}

function provider(text: string): void {
  console.log(`  provider/model: ${text}`);
}

function out(text: string): void {
  console.log(`  output: ${text}`);
}

function link(label: string, url: string | null | undefined): void {
  console.log(`  ${label}: ${url ?? '(none)'}`);
}

function cost(text: string): void {
  console.log(`  est. cost: ${text}`);
}

/**
 * Print the on-chain USDC settlement sig(s) a paid stage produced — the actual
 * tx that moved USDC, one Solscan link per successful paid call (operator-only;
 * settlement sigs never reach the public memo, ADR 0016 E).
 */
function settle(label: string, sigs: string[]): void {
  if (sigs.length === 0) {
    console.log(`  ${label}: (no USDC settlement)`);
    return;
  }
  console.log(`  ${label} (${sigs.length}):`);
  for (const s of sigs) console.log(`    · settlement tx: https://solscan.io/tx/${s}`);
}

function ok(name: string, detail: string): void {
  results.push({ stage: name, status: 'ok', detail });
}

function sim(name: string, detail: string): void {
  results.push({ stage: name, status: 'sim', detail });
}

function skip(name: string, detail: string): void {
  console.log(`  skipped: ${detail}`);
  results.push({ stage: name, status: 'skip', detail });
}

/** Print the error message AND walk its root-cause chain (ADR 0016 H). */
function fail(name: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`  ✗ error: ${msg}`);
  const chain = rootCauseChain(err);
  if (chain.length > 0) {
    console.log('  root cause chain:');
    for (const [i, c] of chain.entries()) console.log(`    ${i + 1}. ${c}`);
  }
  results.push({ stage: name, status: 'fail', detail: msg });
}

/**
 * Walk every cause reachable from `err` (the standard `.cause`, the non-standard
 * `.cause1`/`.cause2` our AceChatJsonError throws, and AggregateError.errors),
 * de-duped, so the ROOT cause of a failure is always surfaced (ADR 0016 H).
 */
function rootCauseChain(err: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [];
  if (err && typeof err === 'object') {
    const n = err as { cause?: unknown; cause1?: unknown; cause2?: unknown; errors?: unknown };
    queue.push(n.cause, n.cause1, n.cause2);
    if (Array.isArray(n.errors)) queue.push(...n.errors);
  }
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined || cur === null || seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur));
    if (typeof cur === 'object') {
      const n = cur as { cause?: unknown; cause1?: unknown; cause2?: unknown; errors?: unknown };
      queue.push(n.cause, n.cause1, n.cause2);
      if (Array.isArray(n.errors)) queue.push(...n.errors);
    }
  }
  return out;
}

// ── Read-RPC adapters (FREE — run for real in both modes) ─────────────────────

function makeRpcCaller(rpcUrl: string) {
  return async function rpc<T>(method: string, params: unknown): Promise<T> {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`RPC ${method} error: ${json.error.message}`);
    return json.result as T;
  };
}

function buildOwnerLookup(rpcUrl: string) {
  const rpc = makeRpcCaller(rpcUrl);
  return {
    async getOwner(pubkey: string): Promise<string | null> {
      const result = await rpc<{ value?: { owner?: string } | null } | null>('getAccountInfo', [
        pubkey,
        { encoding: 'base64', commitment: 'confirmed' },
      ]);
      return result?.value?.owner ?? null;
    },
  };
}

function buildAssetLookup(rpcUrl: string) {
  const rpc = makeRpcCaller(rpcUrl);
  return {
    async getAsset(mint: string) {
      try {
        const result = await rpc<{
          interface?: string;
          token_info?: { supply?: number };
          content?: { metadata?: { name?: string } };
        } | null>('getAsset', { id: mint });
        if (!result?.interface) return null;
        return {
          interface: result.interface,
          supply: result.token_info?.supply,
          name: result.content?.metadata?.name,
        };
      } catch {
        return null;
      }
    },
  };
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
      return sigs.map(
        (s): SpotlightSigInfo => ({
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime ?? null,
          err: s.err,
        }),
      );
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
      const info: SpotlightTxInfo = {
        accountKeys,
        ixCount: tx.transaction.message.compiledInstructions.length,
        feeLamports: tx.meta?.fee ?? 0,
        blockTime: tx.blockTime ?? null,
        err: tx.meta?.err ?? null,
      };
      return info;
    },
    async getTokenAccountsByOwner(pubkey) {
      const resp = await connection.getParsedTokenAccountsByOwner(new PublicKey(pubkey), {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });
      return { count: resp.value.length };
    },
    async getAssetsByOwner() {
      return { count: 0 };
    },
  };
}

function buildTxRpc(rpcUrl: string): TxSpotlightRpc {
  const rpc = makeRpcCaller(rpcUrl);
  return {
    async getTransactionDetails(sig) {
      type TxResp = {
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
      };
      const tx = await rpc<TxResp | null>('getTransaction', [
        sig,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx) return null;
      const accountKeys = tx.transaction.message.accountKeys.map((k) =>
        typeof k === 'string' ? k : (k.pubkey ?? ''),
      );
      const signerPubkey = accountKeys[0] ?? null;
      const ixs = tx.transaction.message.instructions;
      const ixProgramIds = ixs.map(
        (ix) => ix.programId ?? accountKeys[ix.programIdIndex ?? 0] ?? '',
      );
      const pre = tx.meta.preBalances ?? [];
      const post = tx.meta.postBalances ?? [];
      const balanceDeltas = accountKeys
        .map((pubkey, i) => ({
          pubkey,
          preLamports: BigInt(pre[i] ?? 0),
          postLamports: BigInt(post[i] ?? 0),
        }))
        .filter((d) => d.preLamports !== d.postLamports);
      const details: TxRpcDetails = {
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
      return details;
    },
  };
}

function buildNftRpc(rpcUrl: string): NftSpotlightRpc {
  const rpc = makeRpcCaller(rpcUrl);
  return {
    async getAsset(mint) {
      try {
        const asset = await rpc<Record<string, unknown> | null>('getAsset', { id: mint });
        return mapDasAsset(asset);
      } catch {
        return null;
      }
    },
    async getSignaturesForAddress(address, opts) {
      type SigResp = Array<{ signature: string; slot: number; blockTime?: number; err: unknown }>;
      const sigs = await rpc<SigResp>('getSignaturesForAddress', [address, { limit: opts.limit }]);
      return sigs.map((s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ?? null,
        err: s.err,
      }));
    },
    async getTransaction(sig) {
      type TxResp = {
        transaction: { message: { accountKeys: Array<{ pubkey?: string } | string> } };
        meta?: { fee?: number; err?: unknown };
        blockTime?: number;
      } | null;
      const tx = await rpc<TxResp>('getTransaction', [
        sig,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx) return null;
      const accountKeys = tx.transaction.message.accountKeys.map((k) =>
        typeof k === 'string' ? k : (k.pubkey ?? ''),
      );
      const info: SpotlightTxInfo = {
        accountKeys,
        ixCount: 0,
        feeLamports: tx.meta?.fee ?? 0,
        blockTime: tx.blockTime ?? null,
        err: tx.meta?.err ?? null,
      };
      return info;
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** BigInt-safe view of spotlights for the Director (mirrors curator wiring). */
function safeSpotlights(spotlights: unknown): Spotlights {
  return JSON.parse(
    JSON.stringify(spotlights, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Spotlights;
}

/** Short label for a public identifier in the brief steer. */
function subjectBrief(kind: KindResult['kind'], spotlights: unknown): string {
  if (kind === 'token') {
    const s = spotlights as { ticker?: string | null; name?: string | null };
    return [s.ticker, s.name].filter(Boolean).join(' ');
  }
  return '';
}

// Image-gen constants (mirror the reactive mint route / cron adapters).
const HERO_IMAGE_SIZE = '1344x768';
const IMAGE_MODELS: Record<string, string> = {
  seedream: 'doubao-seedream-4-0-250828',
  'nano-banana': 'nano-banana',
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!INPUT) {
    console.error('usage: bun run ace:debug <input> [--live]');
    process.exit(1);
  }

  header();

  const rpcUrl = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);
  const connection = new Connection(rpcUrl, 'confirmed');

  // ── Stage 1: detect (FREE RPC read — runs for real in both modes) ──
  stage('detect');
  provider('kind-detector (base58 + getAccountInfo owner / getAsset DAS)');
  let kind: KindResult;
  try {
    kind = await detectKind(INPUT, buildOwnerLookup(rpcUrl), buildAssetLookup(rpcUrl));
    out(`kind=${kind.kind}`);
    ok('detect', `kind=${kind.kind}`);
  } catch (err) {
    fail('detect', err);
    return summary();
  }

  const tone: Tone = resolveTone(undefined, kind.kind);

  // ── Stage 2: spotlights (FREE RPC/DAS reads — run for real in both modes) ──
  stage('spotlights');
  let spotlights: unknown;
  try {
    if (kind.kind === 'wallet') {
      provider('spotlight-fetcher (wallet) via Solana RPC');
      spotlights = await fetchWalletSpotlights(kind.pubkey, buildSpotlightRpc(connection));
    } else if (kind.kind === 'tx') {
      provider('spotlight-fetcher (tx) via Solana RPC getTransaction');
      spotlights = await fetchTxSpotlights(kind.sig, buildTxRpc(rpcUrl));
    } else if (kind.kind === 'nft') {
      provider('spotlight-fetcher (nft) via DAS getAsset + signatures');
      spotlights = await fetchNftSpotlights(kind.mint, buildNftRpc(rpcUrl));
    } else {
      provider('spotlight-fetcher (token) via Dexscreener + RPC/DAS');
      spotlights = await fetchTokenSpotlights(kind.mint, buildTokenSpotlightSource(rpcUrl));
    }
    out(
      JSON.stringify(spotlights, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(
        0,
        400,
      ),
    );
    ok('spotlights', `${kind.kind} enriched`);
  } catch (err) {
    fail('spotlights', err);
    return summary();
  }

  // ── From here, every stage is PAID (ACE x402) or a BROADCAST/DB write. ──
  // Simulate narrates; --live builds the real agent x402 rail and runs it.
  const heavyModel = env.ACE_CHAT_MODEL_HEAVY;
  const chatModelLabel = heavyModel ?? env.ACE_CHAT_MODEL ?? '(env default)';

  if (!LIVE) {
    return simulateRemainder(kind, spotlights, tone, chatModelLabel);
  }

  // ── LIVE: build the agent x402 self-broadcast rail (the ONLY buy-side rail) ──
  const agent = Keypair.fromSecretKey(bs58.decode(requireEnv('AGENT_SECRET_KEY_BASE58')));
  requireEnv('ACE_API_KEY');
  // x402 settlement → Synapse-first (compliance); memo → generic send RPC.
  const settleConnection = new Connection(
    resolveSettleRpcUrl(env.SYNAPSE_RPC_URL, env.SOLANA_RPC_URL),
    'confirmed',
  );
  const memoConnection = new Connection(
    resolveSendRpcUrl(env.SOLANA_SEND_RPC_URL, env.SOLANA_RPC_URL),
    'confirmed',
  );
  console.log(`\n  agent (payer): ${agent.publicKey.toBase58()}`);
  // Host only — never log the full RPC URL (it embeds the API key).
  console.log(
    `  settlement rpc host: ${rpcHost(resolveSettleRpcUrl(env.SYNAPSE_RPC_URL, env.SOLANA_RPC_URL))}`,
  );
  console.log(
    `  ${env.SYNAPSE_RPC_URL ? '✓ settlement → Synapse RPC (Cat-2 compliant)' : '⚠ SYNAPSE_RPC_URL unset → settlement on fallback RPC (bounty wants Synapse)'}`,
  );
  console.log(
    `  ↳ fallback (solana_send) if Synapse can't confirm in 15s: ${rpcHost(resolveSendRpcUrl(env.SOLANA_SEND_RPC_URL, env.SOLANA_RPC_URL))}`,
  );
  // Tap EVERY successful USDC settlement so each paid call's on-chain tx is
  // surfaced per-stage + tallied (operator-only — sigs never reach the memo).
  const settlements: string[] = [];
  // Synapse-first execution; solana_send (memoConnection) lands it on Synapse
  // timeout — same signed tx, so no double-spend.
  const ace = await buildAgentX402Ace(agent, settleConnection, (sig) => settlements.push(sig), {
    fallbackConnection: memoConnection,
  });

  const cronEnv = buildCronEnv();
  const image: ImageClient = buildProviderChainImageClient(
    ace as unknown as Parameters<typeof buildProviderChainImageClient>[0],
    {
      providers: [...new Set([env.IMAGE_PROVIDER, env.IMAGE_FALLBACK_PROVIDER])],
      models: IMAGE_MODELS,
      size: HERO_IMAGE_SIZE,
      timeoutMs: env.IMAGE_GEN_TIMEOUT_MS,
      placeholderUrl:
        env.PLACEHOLDER_IMAGE_URL ?? 'https://chainbard.vercel.app/chainbard-mark.svg',
    },
  );
  const chat = createAceRenderChatClient(ace, heavyModel);
  const serp = createAceRendererSerpClient(ace as AceLike);

  // ── Stage 3: director (only when a brief/subject steer exists) ──
  stage('director');
  const brief = subjectBrief(kind.kind, spotlights);
  let plan: Plan | undefined;
  if (brief.trim().length > 0) {
    provider(`Director chat: ${chatModelLabel} (x402 settle)`);
    const before = settlements.length;
    try {
      plan = await runDirector(
        safeSpotlights(spotlights),
        brief,
        kind.kind,
        ace as unknown as AceChatLike,
        heavyModel,
      );
      out(`plan tone=${plan.tone} serpQuery="${plan.serpQuery}" emphasis="${plan.emphasis}"`);
      settle('settlement tx', settlements.slice(before));
      ok('director', `tone=${plan.tone}`);
    } catch (err) {
      fail('director', err);
    }
  } else {
    skip('director', 'no subject brief for this kind — renderer uses default plan');
  }

  // ── Stages 4–6: multi-SERP + render + image (run inside the renderer) ──
  // The renderer emits search/write/paint via onProgress; we surface each seam.
  stage('multi-SERP + render + image');
  provider(`serp: ace.search.google | write: ${chatModelLabel} | image: nano-banana→seedream`);
  let story: unknown;
  let receipts: Receipt[] = [];
  const sBeforeRender = settlements.length;
  try {
    const onProgress = (id: 'search' | 'write' | 'paint', status: 'active' | 'done') => {
      console.log(`  · ${id} ${status}`);
    };
    if (kind.kind === 'tx') {
      const deps: TxRenderDeps = { chat, image, serp, onProgress };
      const r = await renderTxStory(spotlights as never, tone, deps, plan);
      story = r.story;
      receipts = r.receipts;
    } else if (kind.kind === 'nft') {
      const r = await renderNftStory(
        spotlights as never,
        tone,
        { chat, image, serp, onProgress },
        plan,
      );
      story = r.story;
      receipts = r.receipts;
    } else if (kind.kind === 'token') {
      const deps: TxRenderDeps = { chat, image, serp, onProgress };
      const r = await renderTokenStory(spotlights as never, tone, deps, plan);
      story = r.story;
      receipts = r.receipts;
    } else {
      const r = await renderStory(
        spotlights as never,
        'wallet',
        tone,
        { chat, image, serp, onProgress },
        plan,
      );
      story = r.story;
      receipts = r.receipts;
    }
    const s = story as { title?: string; heroImageUrl?: string; storyImageUrl?: string };
    out(`title="${s.title}"`);
    link('hero image', s.heroImageUrl ?? s.storyImageUrl);
    for (const r of receipts) console.log(`  receipt: ${receiptToProvenance(r)}`);
    settle('settlement tx (serp + write + image)', settlements.slice(sBeforeRender));
    ok('render', `title="${s.title}"`);
  } catch (err) {
    fail('render', err);
    // Surface what DID settle before the failure (e.g. serp + write landed, image threw).
    settle('settlement tx before failure', settlements.slice(sBeforeRender));
    return summary();
  }

  // ── Stages 7–8: video + audio (async x402 tasks, fail-soft enrichment) ──
  stage('video + audio');
  provider(
    `video: ${cronEnv.VIDEO_PROVIDER}/${cronEnv.VIDEO_MODEL} | audio: ${cronEnv.AUDIO_PROVIDER}`,
  );
  const { video, audio, blobStore } = buildMediaClients(ace, cronEnv);
  const keyPrefix = computeInputHash(INPUT);
  const sBeforeMedia = settlements.length;
  const mediaReceipts = await enrichStoryMedia(story as MediaEnrichableStory, keyPrefix, {
    video,
    audio,
    blobStore,
  });
  receipts.push(...mediaReceipts);
  const ms = story as MediaEnrichableStory;
  link('video', ms.videoUrl);
  link('audio', ms.audioUrl);
  for (const r of mediaReceipts) console.log(`  receipt: ${receiptToProvenance(r)}`);
  settle('settlement tx (video + audio)', settlements.slice(sBeforeMedia));
  ok('media', `video=${ms.videoUrl ? 'set' : 'none'} audio=${ms.audioUrl ? 'set' : 'none'}`);

  // ── Stage 9: persist (DB write) ──
  stage('persist');
  const inputHash = computeInputHash(INPUT);
  try {
    const databaseUrl = requireEnv('DATABASE_URL');
    const { SQL } = await import('bun');
    const db = new SQL(databaseUrl) as unknown as {
      unsafe(q: string, args?: unknown[]): Promise<unknown[]>;
    };
    await db.unsafe(
      `INSERT INTO wallet_stories (input_hash, input, story, provenance)
       VALUES ($1, $2, $3::jsonb, 'curator')
       ON CONFLICT (input_hash) DO NOTHING`,
      [inputHash, INPUT, JSON.stringify(story)],
    );
    out(`upserted wallet_stories input_hash=${inputHash.slice(0, 12)}…`);
    ok('persist', `input_hash=${inputHash.slice(0, 12)}…`);
  } catch (err) {
    fail('persist', err);
  }

  // ── Stage 10: memo (SAP Memo v2, on-chain broadcast) ──
  stage('memo');
  provider('SAP Memo v2 — agent-signed SPL Memo (self-broadcast)');
  try {
    const memoWriter = createSapMemoWriter(createMemoSender(memoConnection, agent));
    const storyHash = await hashStory(story);
    const memoSig = await memoWriter.writeMemo({
      inputHash,
      storyHash,
      // Operator debug runs carry no buyer brief → sha256('').
      briefHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      // Complete service-provenance receipt, every leg (ADR 0016 E).
      aceReceipts: receipts.map(receiptToProvenance),
      paymentSig: 'ace:debug',
      timestamp: Math.floor(Date.now() / 1000),
    });
    link('memo sig (Solscan)', `https://solscan.io/tx/${memoSig}`);
    ok('memo', memoSig.slice(0, 16));
  } catch (err) {
    fail('memo', err);
  }

  // ── USDC settlement tally — exactly the USDC this run spent (Cat-2 volume) ──
  // One tx per SUCCESSFUL paid call; a failed/reverted leg (e.g. an
  // InsufficientFunds video transfer) is NOT here — its sig is in the [video +
  // audio] error line instead. The memo above is a SOL-fee tx, not USDC.
  stage('settlements');
  if (settlements.length === 0) {
    console.log('  no USDC settled (every paid leg failed or was skipped)');
  } else {
    console.log(`  ${settlements.length} USDC settlement(s) — this IS your USDC spend:`);
    for (const s of settlements) console.log(`    · https://solscan.io/tx/${s}`);
  }

  summary();
}

// ── Simulate the paid/broadcast remainder (default mode) ──────────────────────

function simulateRemainder(
  kind: KindResult,
  spotlights: unknown,
  tone: Tone,
  chatModelLabel: string,
): void {
  const brief = subjectBrief(kind.kind, spotlights);
  // Wallet now multi-SERPs on every render (ADR 0016 D): 2 facets with a Director
  // brief, else 1 pubkey fallback facet.
  const serpFacets =
    kind.kind === 'token' ? 5 : kind.kind === 'nft' ? 3 : kind.kind === 'tx' ? 2 : brief ? 2 : 1;

  stage('director');
  if (brief.trim().length > 0) {
    provider(`Director chat: ${chatModelLabel} (would settle via x402)`);
    out(`would steer a Plan from brief="${brief}" + spotlights (tone default=${tone})`);
    cost(`~${COST.chat.toFixed(4)} USDC + ${COST.solFee} SOL`);
    sim('director', `brief="${brief}"`);
  } else {
    skip('director', 'no subject brief for this kind — renderer uses default plan');
  }

  stage('multi-SERP');
  provider('serp: ace.search.google (would settle via x402)');
  out(`would fire ${serpFacets} deduped query facet(s) → merged untrusted web context`);
  cost(`~${(COST.serp * serpFacets).toFixed(4)} USDC + ${serpFacets} × ${COST.solFee} SOL`);
  if (serpFacets > 0) sim('multi-SERP', `${serpFacets} facets`);
  else skip('multi-SERP', 'no SERP base for this kind');

  stage('render (write)');
  provider(`write: ${chatModelLabel} (would settle via x402)`);
  out(`would render a ${kind.kind} story in tone=${tone}`);
  cost(`~${COST.chat.toFixed(4)} USDC + ${COST.solFee} SOL`);
  sim('render', `${kind.kind} tone=${tone}`);

  stage('image');
  provider(`image: nano-banana → seedream → placeholder (would settle via x402)`);
  out('would generate one infographic/cinematic hero from heroImagePrompt');
  cost(`~${COST.image.toFixed(4)} USDC + ${COST.solFee} SOL`);
  sim('image', 'hero image');

  stage('video');
  provider(`video: ${env.VIDEO_PROVIDER}/${env.VIDEO_MODEL} → ${env.VIDEO_FALLBACK_PROVIDER}`);
  out('would fire an async abstract data-motion task (wait:false), collect, mirror to Blob');
  cost(`~${COST.video.toFixed(4)} USDC + ${COST.solFee} SOL (fail-soft enrichment)`);
  sim('video', `${env.VIDEO_PROVIDER}/${env.VIDEO_MODEL}`);

  stage('audio');
  provider(`audio: ${env.AUDIO_PROVIDER} (TTS/spoken-word only, CONTENT_POLICY)`);
  out('would fire an async spoken-word narration task (wait:false), collect, mirror to Blob');
  cost(`~${COST.audio.toFixed(4)} USDC + ${COST.solFee} SOL (fail-soft enrichment)`);
  sim('audio', env.AUDIO_PROVIDER ?? 'fish');

  stage('persist');
  out(
    `would upsert wallet_stories (input_hash=${computeInputHash(INPUT as string).slice(0, 12)}…)`,
  );
  cost('0 (DB write, no chain/ACE spend)');
  sim('persist', 'DB upsert');

  stage('memo');
  provider('SAP Memo v2 — agent-signed SPL Memo (self-broadcast)');
  out('would write a trimmed memo: input_hash + kind + identifier + service-provenance receipt');
  cost(`~${COST.solFee} SOL (memo tx fee)`);
  sim('memo', 'on-chain audit');

  summary();
}

// ── CronEnv for the live media clients (mirrors the cron / media-attach route) ─

function buildCronEnv(): CronEnv {
  return {
    DATABASE_URL: env.DATABASE_URL ?? '',
    ACE_API_KEY: env.ACE_API_KEY ?? '',
    SOLANA_RPC_URL: env.SOLANA_RPC_URL,
    SYNAPSE_RPC_URL: env.SYNAPSE_RPC_URL,
    AGENT_SECRET_KEY_BASE58: env.AGENT_SECRET_KEY_BASE58,
    AGENT_WALLET: env.NEXT_PUBLIC_AGENT_WALLET,
    WEBHOOK_URL: env.WEBHOOK_URL ?? '',
    ACE_CHAT_MODEL_HEAVY: env.ACE_CHAT_MODEL_HEAVY,
    VIDEO_PROVIDER: env.VIDEO_PROVIDER,
    VIDEO_MODEL: env.VIDEO_MODEL,
    VIDEO_FALLBACK_PROVIDER: env.VIDEO_FALLBACK_PROVIDER,
    VIDEO_FALLBACK_MODEL: env.VIDEO_FALLBACK_MODEL,
    AUDIO_PROVIDER: env.AUDIO_PROVIDER,
    AUDIO_MODEL: env.AUDIO_MODEL,
    MEDIA_COLLECT_TIMEOUT_MS: env.MEDIA_COLLECT_TIMEOUT_MS,
    BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN,
  };
}

// ── Story hash (canonical-form sha256) ────────────────────────────────────────

async function hashStory(story: unknown): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(JSON.stringify(story), 'utf8').digest('hex');
}

// ── Summary table ─────────────────────────────────────────────────────────────

function summary(): void {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════');
  const icon = { ok: '✅', sim: '◌', fail: '❌', skip: '–' } as const;
  for (const r of results) {
    console.log(`  ${icon[r.status]} ${r.stage.padEnd(20)} ${r.detail}`);
  }
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log();
  if (LIVE) {
    console.log('  ⚠ LIVE run — verify settlement on the AceData dashboard + Solscan.');
  } else {
    console.log('  simulate run — no spend, no broadcast, no DB writes. Use --live for real.');
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[ace:debug] fatal:', err);
  process.exit(1);
});
