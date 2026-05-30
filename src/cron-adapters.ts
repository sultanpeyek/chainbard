import { createHash } from 'node:crypto';
import { and, sql as dsql, eq, gt } from 'drizzle-orm';
import type { z } from 'zod';
import { createSqlAgentStateRepo } from '@/agent-state-repo';
import type {
  CuratorDeps,
  CuratorStoryRepo,
  MemoWriter,
  TickLog,
  TickLogRepo,
} from '@/autonomous-curator';
import type { Db } from '@/db';
import * as schema from '@/db/schema';
import type { DexPair, DexscreenerClient } from '@/dexscreener-resolver';
import { env as appEnv, resolveSendRpcUrl, resolveSettleRpcUrl } from '@/env';
import { buildFishAudioClient } from '@/lib/ace-audio-client';
import { type AceChatLike, aceChatJson } from '@/lib/ace-chat-json';
import { type AceImageGenerate, buildProviderChainImageClient } from '@/lib/ace-image-client';
import { buildProviderChainVideoClient } from '@/lib/ace-video-client';
import { storeRemoteAsset } from '@/lib/blob-store';
import { buildTokenSpotlightSource } from '@/lib/token-spotlight-source';
import type { MemoArgs, SapMemoWriter } from '@/modules/sap-memo-writer';
import type {
  AggregatorChatClient,
  SerpClient as AggregatorSerpClient,
  RenderedSubjectStore,
} from '@/signal-aggregator';
import type {
  SpotlightRpc,
  SpotlightSigInfo,
  SpotlightTxInfo,
  TokenSpotlightSource,
} from '@/spotlight-fetcher';
import type {
  ImageClient,
  ChatClient as RenderChatClient,
  SerpClient as RenderSerpClient,
  TxRenderDeps,
} from '@/story-renderer';
import { computeInputHash } from '@/story-repo';
import { FundsExhaustedError } from '@/treasury';

// ── Image-gen constants (mirror the reactive mint route, ADR 0014) ────────────
// Ace cortex caps each dimension at 1440; 1344x768 keeps the 1.75 landscape ratio
// in-range. seedream / nano-banana reject the request unless a concrete model is
// named (seedream 4.0 fast + takes `size`, nano-banana base fastest).
const HERO_IMAGE_SIZE = '1344x768';
const IMAGE_MODELS: Record<string, string> = {
  seedream: 'doubao-seedream-4-0-250828',
  'nano-banana': 'nano-banana',
};

// ── SQL adapters (Drizzle ORM) ────────────────────────────────────────────────

const { walletStories, tickLog } = schema;

export function createSqlCuratorStoryRepo(db: Db): CuratorStoryRepo {
  return {
    async upsertCurated(identifier, _kind, story, _tickLogId) {
      const inputHash = computeInputHash(identifier);
      await db
        .insert(walletStories)
        .values({
          inputHash,
          input: identifier,
          story,
          provenance: 'curator',
        })
        .onConflictDoNothing();
    },
    async attachMemo(identifier, memoSig) {
      const inputHash = computeInputHash(identifier);
      await db.update(walletStories).set({ memoSig }).where(eq(walletStories.inputHash, inputHash));
    },
  };
}

export function createSqlRenderedSubjectStore(db: Db): RenderedSubjectStore {
  return {
    async hasBeenRendered(identifier, withinDays) {
      const rows = await db
        .select({ exists: dsql<number>`1` })
        .from(walletStories)
        .where(
          and(
            eq(walletStories.input, identifier),
            gt(walletStories.createdAt, dsql`NOW() - (${withinDays} || ' days')::interval`),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}

export function createSqlTickLogRepo(db: Db): TickLogRepo {
  return {
    async insert(log: TickLog) {
      await db
        .insert(tickLog)
        .values({
          id: log.id,
          startedAt: log.startedAt,
          signalSource: log.signalSource,
          candidatesConsidered: log.candidatesConsidered,
          pickKind: log.pickKind,
          pickIdentifier: log.pickIdentifier,
          pickRationale: log.pickRationale,
          pickSourceHit: log.pickSourceHit,
          briefHash: log.briefHash,
          aceReceipts: log.aceReceipts,
          memoSig: log.memoSig,
          webhookPosted: log.webhookPosted,
          error: log.error,
        })
        .onConflictDoNothing();
    },
  };
}

// ── Ace clients ───────────────────────────────────────────────────────────────
// Minimal duck-typed interface so we don't take a hard dep on @acedatacloud/sdk
// internals from this file (and to keep tests light).

export interface AceLike {
  openai: {
    chat: {
      completions: {
        create(params: {
          model: string;
          messages: Array<{ role: 'system' | 'user'; content: string }>;
          response_format?: { type: 'json_object' };
        }): Promise<{
          choices: Array<{ message: { content: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          model?: string;
        }>;
      };
    };
    images: {
      generate(params: {
        model: string;
        prompt: string;
        n?: number;
      }): Promise<{ data: Array<{ url: string }>; model?: string }>;
    };
  };
  search?: {
    google(params: {
      query: string;
      type?: string;
      country?: string;
      language?: string;
      page?: number;
    }): Promise<{
      organic?: Array<{ title?: string; snippet?: string; link?: string }>;
      [key: string]: unknown;
    }>;
  };
  // Async media surfaces (ADR 0015). Duck-typed + optional so the SAME `ace`
  // facade drives video/audio when the x402 rail is live, without this file
  // taking a hard dep on the SDK's media types.
  video?: { generate(opts: Record<string, unknown>): Promise<unknown> };
  audio?: { generate(opts: Record<string, unknown>): Promise<unknown> };
  tasks?: { get(id: string, opts?: { service?: string }): Promise<Record<string, unknown>> };
}

export function createAceAggregatorSerpClient(ace: AceLike): AggregatorSerpClient {
  return {
    async search(query: string) {
      if (!ace.search?.google) {
        throw new Error('AceLike.search.google not available');
      }
      const resp = await ace.search.google({ query });
      return (resp.organic ?? []).map((h) => ({
        title: h.title ?? '',
        snippet: h.snippet ?? '',
        url: h.link ?? '',
      }));
    },
  };
}

// Keyless Dexscreener adapter. No SDK, no API key. Fail-soft: any transport/HTTP
// error (incl. 429) yields an empty pair list, which the resolver treats as
// "unresolvable" (fail-closed) rather than crashing the tick.
//   - search: /latest/dex/search?q={ticker} — fuzzy candidate discovery.
//   - pairsForMint: /latest/dex/tokens/{mint} — ALL pools for one mint, so the
//     resolver can size a candidate on its TRUE aggregated liquidity/volume
//     rather than the single (possibly dead) pool search happened to surface.
export function createDexscreenerClient(): DexscreenerClient {
  return {
    async search(ticker: string): Promise<DexPair[]> {
      const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(ticker)}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return [];
        const json = (await resp.json()) as { pairs?: DexPair[] };
        return json.pairs ?? [];
      } catch {
        return [];
      }
    },
    async pairsForMint(mint: string): Promise<DexPair[]> {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return [];
        const json = (await resp.json()) as { pairs?: DexPair[] | null };
        return json.pairs ?? [];
      } catch {
        return [];
      }
    },
  };
}

export function createAceRendererSerpClient(ace: AceLike): RenderSerpClient {
  return {
    async search(query: string) {
      if (!ace.search?.google) {
        throw new Error('AceLike.search.google not available');
      }
      const resp = await ace.search.google({ query });
      const snippets = (resp.organic ?? []).map((h) => h.snippet ?? '').filter((s) => s.length > 0);
      return { snippets };
    },
  };
}

export function createAceAggregatorChatClient(ace: AceLike): AggregatorChatClient {
  return {
    async complete<T>(args: { system: string; user: string; schema: z.ZodType<T> }) {
      const { data } = await aceChatJson({
        ace: ace as unknown as AceChatLike,
        system: args.system,
        user: args.user,
        schema: args.schema,
      });
      return { data };
    },
  };
}

export function createAceRenderChatClient(ace: AceLike, model?: string): RenderChatClient {
  return {
    async complete<T>(args: { system: string; user: string; schema: z.ZodType<T> }) {
      // `model` overrides the default chat model for the WRITE step (ADR 0015:
      // ACE_CHAT_MODEL_HEAVY). Undefined keeps the env default (cheap model).
      const {
        data,
        promptTokens,
        completionTokens,
        model: resolvedModel,
      } = await aceChatJson({
        ace: ace as unknown as AceChatLike,
        system: args.system,
        user: args.user,
        schema: args.schema,
        model,
      });
      return { data, promptTokens, completionTokens, model: resolvedModel };
    },
  };
}

// ── Solana RPC adapter (SpotlightRpc) ─────────────────────────────────────────

export interface ConnectionLike {
  getBalance(pubkey: import('@solana/web3.js').PublicKey): Promise<number>;
  getSignaturesForAddress(
    pubkey: import('@solana/web3.js').PublicKey,
    opts: { limit: number },
  ): Promise<
    Array<{ signature: string; slot: number; blockTime: number | null; err: unknown | null }>
  >;
  getParsedTransaction(
    sig: string,
    opts?: { maxSupportedTransactionVersion?: number },
  ): Promise<{
    blockTime: number | null;
    transaction: {
      message: {
        accountKeys: Array<{ pubkey: { toBase58(): string } } | { toBase58(): string }>;
        instructions: unknown[];
      };
    };
    meta: { fee?: number; err?: unknown; logMessages?: string[] } | null;
  } | null>;
  getParsedTokenAccountsByOwner(
    pubkey: import('@solana/web3.js').PublicKey,
    filter: { programId: import('@solana/web3.js').PublicKey },
  ): Promise<{ value: unknown[] }>;
}

export function createWeb3SpotlightRpc(
  connection: ConnectionLike,
  PublicKey: typeof import('@solana/web3.js').PublicKey,
  TOKEN_PROGRAM_ID: import('@solana/web3.js').PublicKey,
): SpotlightRpc {
  return {
    async getBalance(pubkey: string): Promise<bigint> {
      const lamports = await connection.getBalance(new PublicKey(pubkey));
      return BigInt(lamports);
    },
    async getSignaturesForAddress(
      pubkey: string,
      opts: { limit: number },
    ): Promise<SpotlightSigInfo[]> {
      const sigs = await connection.getSignaturesForAddress(new PublicKey(pubkey), {
        limit: opts.limit,
      });
      return sigs.map((s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ?? null,
        err: s.err ?? null,
      }));
    },
    async getTransaction(signature: string): Promise<SpotlightTxInfo | null> {
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return null;
      const keys = tx.transaction?.message?.accountKeys ?? [];
      const accountKeys = keys
        .map((k) => {
          if (k && typeof k === 'object' && 'pubkey' in k) return k.pubkey.toBase58();
          if (k && typeof (k as { toBase58?: unknown }).toBase58 === 'function') {
            return (k as { toBase58(): string }).toBase58();
          }
          return '';
        })
        .filter((s) => s.length > 0);
      return {
        accountKeys,
        ixCount: tx.transaction?.message?.instructions?.length ?? 0,
        feeLamports: tx.meta?.fee ?? 0,
        blockTime: tx.blockTime ?? null,
        err: tx.meta?.err ?? null,
      };
    },
    async getTokenAccountsByOwner(pubkey: string): Promise<{ count: number }> {
      const resp = await connection.getParsedTokenAccountsByOwner(new PublicKey(pubkey), {
        programId: TOKEN_PROGRAM_ID,
      });
      return { count: resp.value.length };
    },
    async getAssetsByOwner(_pubkey: string): Promise<{ count: number }> {
      // DAS requires Helius/Synapse RPC with `getAssetsByOwner` method.
      // Stubbed to 0 here; rich impl can be added once a DAS-capable client is
      // injected (e.g., synapse-client-sdk DasClient).
      return { count: 0 };
    },
  };
}

// ── Memo writer adapter ───────────────────────────────────────────────────────

export interface MemoWriterAdapterDeps {
  writer: SapMemoWriter;
  /**
   * Returns the inputHash + storyHash + aceReceipts + paymentSig that
   * correspond to the given tickLogId. The autonomous-curator tick log
   * itself doesn't carry these values, so a caller-supplied resolver is
   * required.  For curator ticks we want a memo entry that proves an
   * agent-signed audit record exists for this tick.
   */
  resolveArgs(tickLogId: string, summary: string): Promise<MemoArgs>;
}

export function createMemoWriterAdapter(deps: MemoWriterAdapterDeps): MemoWriter {
  return {
    async write(tickLogId, summary) {
      try {
        const args = await deps.resolveArgs(tickLogId, summary);
        const sig = await deps.writer.writeMemo(args);
        return { sig };
      } catch (err) {
        console.error('[memo-adapter] writeMemo failed:', (err as Error).message);
        return { sig: null };
      }
    },
  };
}

/**
 * Default MemoArgs resolver for curator ticks. Curator runs don't have a
 * buyer paymentSig or per-render aceReceipts threaded into the MemoWriter
 * call (cron contract is `(tickLogId, summary)`), so we synthesize stable
 * SHA-256 hashes from those inputs.  This is enough to land a signed
 * SPL-Memo entry that proves the curator agent ran at a given UTC time.
 */
export function defaultCuratorMemoArgsResolver(): MemoWriterAdapterDeps['resolveArgs'] {
  return async (tickLogId: string, summary: string) => {
    const inputHash = createHash('sha256').update(tickLogId, 'utf8').digest('hex');
    const storyHash = createHash('sha256').update(summary, 'utf8').digest('hex');
    return {
      inputHash,
      storyHash,
      // Curator ticks carry no buyer brief → sha256('').
      briefHash: createHash('sha256').update('').digest('hex'),
      aceReceipts: [],
      paymentSig: '',
      timestamp: Math.floor(Date.now() / 1000),
    };
  };
}

// ── Agent x402 wallet adapter (ADR 0015) ──────────────────────────────────────

/**
 * Structural Solana wallet adapter for the x402 client (`createX402PaymentHandler`).
 * Duck-typed (matches `@acedatacloud/x402-client`'s `SolanaWalletAdapter`) so this
 * module takes no hard dep on the x402 package types.
 */
export interface SolanaWalletAdapter {
  publicKey: { toBase58(): string; toString(): string };
  signAndSendTransaction(tx: unknown): Promise<string | { signature: string }>;
}

/**
 * Reliability knobs for the x402 settlement broadcast. The settlement runs
 * Synapse-FIRST (compliance: "x402 ... with Synapse RPC in execution"); the
 * optional `fallbackConnection` (the generic solana_send RPC, e.g. Helius) is
 * engaged ONLY if Synapse hasn't confirmed within `primaryMs`. The SAME signed tx
 * is re-broadcast through both — identical signature ⇒ the network executes it at
 * most once, so there is NO double-spend risk. Omit `fallbackConnection` to keep
 * the Synapse-only behavior.
 */
export interface SettlementOpts {
  fallbackConnection?: import('@solana/web3.js').Connection;
  /** Synapse-only window before the fallback is engaged (default 15s). */
  primaryMs?: number;
  /** Overall confirm budget across both RPCs (default 60s). */
  totalMs?: number;
}

// Agent self-broadcast confirm budget. 60s comfortably covers a `confirmed`
// blockhash's ~150-slot (~60-80s) validity window, leaving room for the
// re-broadcast loop to land a tx through Synapse's weaker tx forwarding.
const X402_CONFIRM_TIMEOUT_MS = 60_000;
// How often to re-submit the (idempotent) signed tx while awaiting confirmation.
const X402_REBROADCAST_INTERVAL_MS = 3_000;
// Synapse-ONLY window: how long the settlement broadcasts through Synapse alone
// (the bounty's "Synapse RPC in execution") before the solana_send fallback is
// also engaged. Short, because a staging Synapse may never land it on its own.
const X402_SYNAPSE_PRIMARY_MS = 15_000;

/**
 * Classify a polled signature status into confirmed (true) / still-pending
 * (false), throwing a TYPED error on an on-chain failure. SPL Token
 * InsufficientFunds (Custom code 1) = the agent ran out of USDC, the dominant
 * funds-exhaustion path for this rail. Because we send with skipPreflight it
 * surfaces here (confirmed-tx `err`) as {InstructionError:[i,{Custom:1}]} — NOT
 * the human-readable `0x1` — so raise FundsExhaustedError to let the curator's
 * D7 classifier flip the agent dormant instead of looping on a doomed transfer.
 */
function settlementConfirmed(
  value: { err: unknown; confirmationStatus?: string | null } | null,
  sig: string,
): boolean {
  if (value?.err) {
    const errJson = JSON.stringify(value.err);
    const ie = (value.err as { InstructionError?: [number, unknown] }).InstructionError;
    const detail = ie?.[1];
    const insufficient =
      detail === 'InsufficientFunds' ||
      (typeof detail === 'object' &&
        detail !== null &&
        (detail as { Custom?: number }).Custom === 1);
    if (insufficient) {
      throw new FundsExhaustedError(
        `x402 USDC transfer failed (insufficient funds): ${errJson} (sig ${sig})`,
      );
    }
    throw new Error(`x402 tx failed on-chain: ${errJson} (sig ${sig})`);
  }
  return value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized';
}

/**
 * `getLatestBlockhash` with a small backoff retry — a transient blip on the
 * blockhash fetch (Synapse rate-limit / cold read) must not abort a settlement
 * before it even broadcasts.
 */
async function getLatestBlockhashRetry(
  connection: import('@solana/web3.js').Connection,
  attempts = 3,
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await connection.getLatestBlockhash('confirmed');
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error(
    `getLatestBlockhash failed after ${attempts} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

/**
 * Build the agent's x402 (USDC) self-broadcast `ace` facade — the ONE buy-side
 * rail shared by the cron tick AND the reactive mint (ADR 0016 B). The agent is
 * fee-payer: it signs + broadcasts each USDC settlement itself, so it also needs
 * a dust of SOL. Every paid AceData call (chat / serp / image / video / audio)
 * driven through this facade settles on-chain — the only spend that counts for
 * Cat-2. Returned untyped (`AceLike`-compatible) so both callers cast as needed.
 */
export async function buildAgentX402Ace(
  agent: import('@solana/web3.js').Keypair,
  settleConnection: import('@solana/web3.js').Connection,
  onSettle?: (sig: string) => void,
  opts: SettlementOpts = {},
): Promise<AceLike> {
  const { AceDataCloud } = await import('@acedatacloud/sdk');
  const { createX402PaymentHandler } = await import('@acedatacloud/x402-client');
  const solanaWallet = buildAgentSolanaWalletAdapter(agent, settleConnection, onSettle, opts);
  // @acedatacloud/sdk and @acedatacloud/x402-client ship structurally
  // incompatible PaymentRequirement types (sdk's maxTimeoutSeconds is optional,
  // the x402-client's is required) — a known cross-package quirk; the x402-client
  // README wires them together exactly like this and the runtime shapes match,
  // so bridge the nominal mismatch with a cast.
  const paymentHandler = createX402PaymentHandler({
    network: 'solana',
    solanaWallet,
  }) as never;
  return new AceDataCloud({ paymentHandler }) as unknown as AceLike;
}

/**
 * Build the wallet adapter the x402 client drives: the agent is fee-payer and
 * broadcasts each USDC settlement itself. The x402 client hands us a prebuilt SPL
 * TransferChecked tx (feePayer + optional CU ix already set) BUT it fetched the
 * blockhash from a FOREIGN rpc (requirements.extra.rpcUrl ?? public mainnet — see
 * @acedatacloud/x402-client `signSolanaPayment`). Broadcasting that foreign
 * blockhash through Synapse races Synapse's slot view and, under skipPreflight,
 * silently drops the tx. So we RE-ANCHOR the blockhash to a fresh one from the
 * Synapse settle node before signing — a node always recognizes its own recent
 * blockhash, and a slightly-older one stays valid on the (ahead-of-Synapse)
 * fallback RPC too. We leave feePayer + instructions untouched.
 *
 * SETTLEMENT IS SYNAPSE-FIRST (compliance: "x402 ... with Synapse RPC in
 * execution"). The ONE signed tx broadcasts through Synapse, and re-broadcasts
 * there the whole time. ONLY if Synapse hasn't confirmed within `opts.primaryMs`
 * do we ALSO broadcast the SAME signed bytes through `opts.fallbackConnection`
 * (the generic solana_send RPC) so a flaky/staging Synapse still lands the
 * settlement. Same signature ⇒ the network executes it at most once: re-sending
 * the identical tx can NEVER double-spend.
 *
 * `onSettle` (optional) is invoked with the confirmed signature of EACH
 * successful USDC settlement — the single seam where every paid-call sig is
 * visible. Operator-only (the ace:debug runner taps it to surface settlement
 * tx links); production callers omit it. Settlement sigs are NEVER threaded into
 * the public memo / receipts (ADR 0016 E) — only the memo's own sig is on-chain.
 */
export function buildAgentSolanaWalletAdapter(
  agent: import('@solana/web3.js').Keypair,
  settleConnection: import('@solana/web3.js').Connection,
  onSettle?: (sig: string) => void,
  opts: SettlementOpts = {},
): SolanaWalletAdapter {
  const fallbackConnection = opts.fallbackConnection;
  const primaryMs = opts.primaryMs ?? X402_SYNAPSE_PRIMARY_MS;
  const totalMs = opts.totalMs ?? X402_CONFIRM_TIMEOUT_MS;
  return {
    publicKey: {
      toBase58: () => agent.publicKey.toBase58(),
      toString: () => agent.publicKey.toBase58(),
    },
    async signAndSendTransaction(tx: unknown): Promise<string> {
      const transaction = tx as import('@solana/web3.js').Transaction;
      // Re-anchor to a FRESH blockhash from the Synapse settle node (so Synapse
      // recognizes it AND the slightly-older hash stays valid on the fallback).
      // Set blockhash BEFORE signing (the signature covers it); feePayer +
      // instructions are left as the x402 client built them.
      const { blockhash, lastValidBlockHeight } = await getLatestBlockhashRetry(settleConnection);
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.sign(agent);
      const raw = transaction.serialize();

      // Best-effort idempotent re-submit of the SAME signed bytes. Returns the
      // (identical) signature or undefined on a transient send error — the poll
      // loop watches the signature, so a failed send never aborts the settlement.
      const sendVia = async (
        conn: import('@solana/web3.js').Connection,
      ): Promise<string | undefined> => {
        try {
          return await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 3 });
        } catch {
          return undefined;
        }
      };

      // Broadcast through Synapse FIRST (execution/compliance). If Synapse rejects
      // the broadcast outright, fall straight to solana_send (when present) to
      // obtain the signature; with no fallback, a Synapse send error is fatal.
      let fallbackEngaged = false;
      let sig = await sendVia(settleConnection);
      if (!sig) {
        if (!fallbackConnection) {
          throw new Error('x402 settlement broadcast failed on Synapse (no fallback configured)');
        }
        fallbackEngaged = true;
        sig = await fallbackConnection.sendRawTransaction(raw, {
          skipPreflight: true,
          maxRetries: 3,
        });
      }

      const start = Date.now();
      const deadline = start + totalMs;
      let lastSynapse = start;
      let lastFallback = 0;
      while (Date.now() < deadline) {
        // Poll the reliable fallback once engaged (Synapse may fail to REPORT a tx
        // it actually landed); else poll Synapse. No history scan — a just-sent sig
        // lives in the recent-status cache; searchTransactionHistory forces an
        // expensive lookup that times out on a slow RPC even when the tx landed.
        const statusConn =
          fallbackEngaged && fallbackConnection ? fallbackConnection : settleConnection;
        const { value } = await statusConn.getSignatureStatus(sig);
        if (settlementConfirmed(value, sig)) {
          onSettle?.(sig);
          return sig;
        }
        // Engage solana_send once Synapse has had its primary (compliance) window.
        if (!fallbackEngaged && fallbackConnection && Date.now() - start >= primaryMs) {
          fallbackEngaged = true;
          await sendVia(fallbackConnection);
          lastFallback = Date.now();
        }
        // Keep re-broadcasting on Synapse the whole time (stays in execution)…
        if (Date.now() - lastSynapse > X402_REBROADCAST_INTERVAL_MS) {
          await sendVia(settleConnection);
          lastSynapse = Date.now();
        }
        // …and on solana_send once engaged.
        if (
          fallbackEngaged &&
          fallbackConnection &&
          Date.now() - lastFallback > X402_REBROADCAST_INTERVAL_MS
        ) {
          await sendVia(fallbackConnection);
          lastFallback = Date.now();
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      // Authoritative final check (with history scan) on the most reliable
      // connection, so a tx that DID land isn't reported as a failed settlement.
      const finalConn = fallbackConnection ?? settleConnection;
      const final = await finalConn.getSignatureStatus(sig, { searchTransactionHistory: true });
      if (settlementConfirmed(final.value, sig)) {
        onSettle?.(sig);
        return sig;
      }
      throw new Error(`x402 tx not confirmed within ${totalMs}ms (sig ${sig})`);
    },
  };
}

// ── Media provider guards (ADR 0015 content policy) ──────────────────────────
// The audio path is HARD-PINNED to TTS / spoken-word providers so the no-music
// halal invariant (CONTENT_POLICY) is enforced in CODE, not left to operator
// config. The SDK's AudioProvider union also includes the song/music generators
// `suno`/`producer`; those are refused here (fail closed → no audio).
const TTS_AUDIO_PROVIDERS = new Set(['fish']);

/**
 * Build the de-duped video provider chain (primary → fallback) from env.
 * Drops empty providers and collapses a fallback identical to the primary.
 */
function buildVideoChain(env: CronEnv): Array<{ provider: string; model?: string }> {
  const raw = [
    { provider: env.VIDEO_PROVIDER ?? 'veo', model: env.VIDEO_MODEL ?? 'veo3' },
    {
      provider: env.VIDEO_FALLBACK_PROVIDER ?? 'kling',
      model: env.VIDEO_FALLBACK_MODEL ?? 'kling-v2-5-turbo',
    },
  ];
  const seen = new Set<string>();
  return raw.filter((c) => {
    if (!c.provider) return false;
    const key = `${c.provider}:${c.model ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build the x402 video + audio clients and the Blob mirror from the agent's
 * x402 `ace` facade (ADR 0016 B/D). Shared by the cron factory AND the reactive
 * media-attach job so both fire media on the SAME rail with the SAME content-policy
 * guards. A media miss never throws (the clients swallow errors → null).
 */
export function buildMediaClients(
  ace: AceLike,
  env: CronEnv,
): {
  video: ReturnType<typeof buildProviderChainVideoClient>;
  audio: ReturnType<typeof buildFishAudioClient> | undefined;
  blobStore: (url: string, key: string) => Promise<string>;
} {
  const mediaTimeoutMs = env.MEDIA_COLLECT_TIMEOUT_MS ?? 120000;
  const video = buildProviderChainVideoClient(
    ace as unknown as Parameters<typeof buildProviderChainVideoClient>[0],
    { chain: buildVideoChain(env), timeoutMs: mediaTimeoutMs },
  );

  // Audio is hard-pinned to a TTS/spoken-word provider (CONTENT_POLICY no-music
  // invariant enforced in code). A non-TTS provider (e.g. the suno/producer song
  // generators) fails closed → no audio, regardless of operator config.
  const audioProvider = env.AUDIO_PROVIDER ?? 'fish';
  if (!TTS_AUDIO_PROVIDERS.has(audioProvider)) {
    console.warn(
      `[cron-adapters] AUDIO_PROVIDER='${audioProvider}' is not a permitted TTS/spoken-word provider — audio disabled (CONTENT_POLICY).`,
    );
  }
  const audio = TTS_AUDIO_PROVIDERS.has(audioProvider)
    ? buildFishAudioClient(ace as unknown as Parameters<typeof buildFishAudioClient>[0], {
        provider: audioProvider,
        timeoutMs: mediaTimeoutMs,
      })
    : undefined;

  // Mirror collected media to Vercel Blob (fail-soft passthrough without a token).
  const blobStore = (url: string, key: string) => storeRemoteAsset(url, key);
  return { video, audio, blobStore };
}

// ── Env factory ───────────────────────────────────────────────────────────────

export interface CronEnv {
  DATABASE_URL: string;
  ACE_API_KEY: string;
  SOLANA_RPC_URL?: string;
  SYNAPSE_RPC_URL?: string;
  AGENT_SECRET_KEY_BASE58?: string;
  AGENT_WALLET?: string;
  WEBHOOK_URL: string;
  STORY_BASE_URL?: string;
  // ── Autonomous x402 burn rail + media enrichment (ADR 0015) ──
  /** Heavy WRITE-step chat model for the renderer + Director. */
  ACE_CHAT_MODEL_HEAVY?: string;
  VIDEO_PROVIDER?: string;
  VIDEO_MODEL?: string;
  VIDEO_FALLBACK_PROVIDER?: string;
  VIDEO_FALLBACK_MODEL?: string;
  AUDIO_PROVIDER?: string;
  AUDIO_MODEL?: string;
  MEDIA_COLLECT_TIMEOUT_MS?: number;
  BLOB_READ_WRITE_TOKEN?: string;
}

export interface CronEnvFactoryResult {
  deps: Omit<CuratorDeps, 'webhook'>; // webhook supplied by route (already wired)
  storyBaseUrl: string;
}

/**
 * Build all curator deps from process.env values (passed in for testability).
 * Throws if hard-required env is missing (DATABASE_URL, ACE_API_KEY, and the
 * agent keypair for the x402 buy-side rail).
 */
export async function createCronAdaptersFromEnv(env: CronEnv): Promise<CronEnvFactoryResult> {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.ACE_API_KEY) throw new Error('ACE_API_KEY is required');

  // Lazy imports keep this module light when SSG'd into other routes.
  const { createDb } = await import('@/db');
  const { Connection, Keypair, PublicKey } = await import('@solana/web3.js');
  const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');

  const db = createDb(env.DATABASE_URL);

  const rpcUrl = env.SOLANA_RPC_URL || env.SYNAPSE_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  // Two write connections, deliberately separated (the agent is fee-payer for
  // both):
  //   settleConnection — the x402 USDC settlements (agent → AceData), the
  //     bounty-measured execution. Synapse-first so every settlement lands
  //     through Synapse RPC (compliance, Cat-2). Never honors SOLANA_SEND.
  //   memoConnection   — the SAP memo audit write. The generic send RPC is fine.
  const settleConnection = new Connection(
    resolveSettleRpcUrl(env.SYNAPSE_RPC_URL, env.SOLANA_RPC_URL),
    'confirmed',
  );
  const memoConnection = new Connection(resolveSendRpcUrl(env.SOLANA_RPC_URL), 'confirmed');

  // Decode the agent keypair ONCE (reused by the memo writer and the x402 rail).
  let agent: import('@solana/web3.js').Keypair | undefined;
  if (env.AGENT_SECRET_KEY_BASE58) {
    const bs58Mod = (await import('bs58')) as unknown as {
      default?: { decode(s: string): Uint8Array };
      decode?(s: string): Uint8Array;
    };
    const decode = bs58Mod.default?.decode ?? bs58Mod.decode;
    if (!decode) throw new Error('bs58 decode unavailable');
    agent = Keypair.fromSecretKey(decode(env.AGENT_SECRET_KEY_BASE58));
  }

  // ── Ace client: x402 (USDC) self-broadcast rail (ADR 0016 A/B) ──
  // The agent's x402 client is the ONLY buy-side rail: the SAME `ace` facade
  // settles EVERY paid call (chat / serp / image / video / audio) in USDC via the
  // facilitator — the only spend that counts for Cat-2. The agent is fee-payer and
  // self-broadcasts, so it ALSO needs a dust amount of SOL. The agent keypair is a
  // required app secret (ADR 0007); an unfunded wallet fails the call into the
  // funds-exhaustion → dormancy path (ADR 0016 D), there is no credit fallback.
  if (!agent) {
    throw new Error('AGENT_SECRET_KEY_BASE58 is required for the x402 buy-side rail');
  }
  // Synapse-first execution (compliance), with the generic send RPC as the
  // land-it fallback if Synapse can't confirm in time (same signed tx → no
  // double-spend). memoConnection is already the reliable send RPC.
  const ace = await buildAgentX402Ace(agent, settleConnection, undefined, {
    fallbackConnection: memoConnection,
  });

  // ── Memo writer (SAP Memo v2 audit; agent keypair guaranteed present above) ──
  const { createMemoSender, createSapMemoWriter } = await import('@/modules/sap-memo-writer');
  const writer = createSapMemoWriter(createMemoSender(memoConnection, agent));
  const memoWriter: MemoWriter = createMemoWriterAdapter({
    writer,
    resolveArgs: defaultCuratorMemoArgsResolver(),
  });

  // ── Heavy WRITE-step / Director chat model (ADR 0015 A2) ──
  // Optional: undefined keeps the cheap env-default model so the tick stays green
  // out-of-the-box; the operator sets ACE_CHAT_MODEL_HEAVY (e.g. gpt-5.5-pro)
  // after the Phase-0 probe confirms it settles on the facilitator.
  const heavyChatModel = env.ACE_CHAT_MODEL_HEAVY;

  // ── x402 media enrichment (ADR 0016 B — always built on the single x402 rail) ──
  // A media miss never fails a tick (the clients swallow errors → null); volume is
  // booked at the POST. Same builder the reactive media-attach job uses.
  const { video, audio, blobStore } = buildMediaClients(ace, env);
  // Dormancy state (treasury exhaustion): gates the tick + flipped on exhaustion.
  const agentState = createSqlAgentStateRepo(db);

  // ── Image client (ADR 0014) ──
  // The real image chain always runs: render on the shared nano-banana → seedream
  // → placeholder provider chain (the same one the reactive mint route uses),
  // replacing cron's old dall-e-3 (garbled text).
  const image: ImageClient = buildProviderChainImageClient(ace as unknown as AceImageGenerate, {
    providers: [...new Set([appEnv.IMAGE_PROVIDER, appEnv.IMAGE_FALLBACK_PROVIDER])],
    models: IMAGE_MODELS,
    size: HERO_IMAGE_SIZE,
    timeoutMs: appEnv.IMAGE_GEN_TIMEOUT_MS,
    placeholderUrl:
      appEnv.PLACEHOLDER_IMAGE_URL ?? 'https://chainbard.vercel.app/chainbard-mark.svg',
  });

  // ── Token enrichment + render deps (ADR 0014) ──
  // Shared Dexscreener-primary token source; the renderer serp lets a news-seeded
  // Director serpQuery actually reach the search step (two-tier truth).
  const tokenSource: TokenSpotlightSource = buildTokenSpotlightSource(rpcUrl);
  const tokenRender: TxRenderDeps = {
    chat: createAceRenderChatClient(ace, heavyChatModel),
    image,
    serp: createAceRendererSerpClient(ace),
  };

  return {
    deps: {
      aggregator: {
        serp: createAceAggregatorSerpClient(ace),
        chat: createAceAggregatorChatClient(ace),
        dex: createDexscreenerClient(),
        recentSubjects: createSqlRenderedSubjectStore(db),
      },
      rpc: createWeb3SpotlightRpc(
        connection as unknown as ConnectionLike,
        PublicKey,
        TOKEN_PROGRAM_ID,
      ),
      render: {
        chat: createAceRenderChatClient(ace, heavyChatModel),
        image,
        // Wallet renders multi-SERP too (ADR 0016 D — every kind). Briefless,
        // the renderer falls back to the pubkey facet so the wallet leg still
        // settles + receipts instead of silently skipping search.
        serp: createAceRendererSerpClient(ace),
      },
      tokenSource,
      tokenRender,
      storyRepo: createSqlCuratorStoryRepo(db),
      memoWriter,
      tickLogRepo: createSqlTickLogRepo(db),
      storyBaseUrl: env.STORY_BASE_URL ?? 'https://chainbard.vercel.app',
      // ── ADR 0015/0016 wiring ──
      // Raw Ace facade for the Director (steers tone/angle; settles via the x402
      // rail) + the SoTA heavy model. Media + dormancy are consumed by runCuratorTick.
      ace: ace as unknown as AceChatLike,
      heavyChatModel,
      video,
      audio,
      blobStore,
      agentState,
    },
    storyBaseUrl: env.STORY_BASE_URL ?? 'https://chainbard.vercel.app',
  };
}
