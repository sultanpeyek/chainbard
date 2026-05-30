import { createHash } from 'node:crypto';
import type { AgentStateRepo } from '@/agent-state-repo';
import { CostCapExceededError } from '@/cost-guard';
import type { AudioClient } from '@/lib/ace-audio-client';
import type { AceChatLike } from '@/lib/ace-chat-json';
import type { VideoClient } from '@/lib/ace-video-client';
import { enrichStoryMedia, type MediaEnrichableStory } from '@/lib/media-enrich';
import { type Plan, runDirector, type Spotlights } from '@/modules/director';
import { isFundsExhausted } from '@/treasury';

export class StepError extends Error {
  readonly step: string;
  constructor(step: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'StepError';
    this.step = step;
  }
}

async function runStep<T>(step: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StepError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new StepError(step, msg, err);
  }
}

import type { AggregatorDeps } from '@/signal-aggregator';
import { aggregateSignals } from '@/signal-aggregator';
import type { SpotlightRpc, TokenSpotlightSource } from '@/spotlight-fetcher';
import { fetchTokenSpotlights, fetchWalletSpotlights } from '@/spotlight-fetcher';
import type { Receipt, RenderDeps, TxRenderDeps } from '@/story-renderer';
import { receiptToProvenance, renderStory, renderTokenStory } from '@/story-renderer';
import type { WebhookPosterDeps } from '@/webhook-poster';
import { postUrl } from '@/webhook-poster';

// ── Tick log ──────────────────────────────────────────────────────────────────

export interface TickLog {
  id: string;
  startedAt: Date;
  signalSource: string;
  candidatesConsidered: number;
  pickKind: string;
  pickIdentifier: string;
  pickRationale: string;
  /** The SERP headline that named the pick (two-tier truth provenance). Empty when absent. */
  pickSourceHit: string;
  /** sha256 of the rationale that steered the Director (empty rationale => sha256('')). */
  briefHash: string;
  aceReceipts: Receipt[];
  memoSig: string | null;
  webhookPosted: boolean;
  error: string | null;
}

export interface TickLogRepo {
  insert(log: TickLog): Promise<void>;
}

// ── Story repo (curator subset) ───────────────────────────────────────────────
// TODO(#24): replace with real story-repo once PR #24 merges; add tickLogId FK column.

export interface CuratorStoryRepo {
  upsertCurated(identifier: string, kind: string, story: unknown, tickLogId: string): Promise<void>;
  /**
   * Attach the SAP Memo tx signature onto the curated story row so the share
   * page's ReceiptLinks can surface it. Parallels the buyer flow's
   * `attachReceipts`; curator runs have no buyer paymentSig, so only memo_sig
   * is set. Called after the memo write, since the sig doesn't exist at upsert.
   */
  attachMemo(identifier: string, memoSig: string): Promise<void>;
}

// ── Memo writer ───────────────────────────────────────────────────────────────
// TODO(#8): implement memo-writer module (SAP Memo v2).

export interface MemoWriter {
  write(tickLogId: string, summary: string): Promise<{ sig: string | null }>;
}

// ── Curator deps ──────────────────────────────────────────────────────────────
// Cost-guard is enforced inside renderStory via the shared `defaultCostGuard`
// singleton in `@/cost-guard`. The curator catches `CostCapExceededError`
// thrown from the render call and aborts the tick cleanly.

export interface CuratorDeps {
  aggregator: AggregatorDeps;
  rpc: SpotlightRpc;
  render: RenderDeps;
  /** Shared token enrichment source (Dexscreener + RPC). Required for kind:'token' picks. */
  tokenSource: TokenSpotlightSource;
  /** Token render deps (chat + image + serp) — serp lets a news-seeded query reach search. */
  tokenRender: TxRenderDeps;
  storyRepo: CuratorStoryRepo;
  memoWriter: MemoWriter;
  webhook: WebhookPosterDeps;
  tickLogRepo: TickLogRepo;
  storyBaseUrl: string; // e.g. "https://chainbard.vercel.app"
  /**
   * Raw Ace facade for the Director. Optional + injected for testability;
   * passed straight through to `runDirector`. Only consulted when the pick
   * carries a non-empty rationale.
   */
  ace?: AceChatLike;
  /**
   * Heavy WRITE-step chat model for the Director (the same model the token
   * renderer's chat client uses). Optional — when unset the Director falls back
   * to the env default model.
   */
  heavyChatModel?: string;
  /**
   * Optional x402 media enrichment (ADR 0016 D). Both run as async tasks; a media
   * miss NEVER fails the tick. Consumed on EVERY kind (token + wallet).
   */
  video?: VideoClient;
  audio?: AudioClient;
  /**
   * Mirror a collected media URL to Vercel Blob (fail-soft passthrough when no
   * Blob token is configured). Stored URL is set on the story; absent when the
   * media rail is off.
   */
  blobStore?: (url: string, key: string) => Promise<string>;
  /**
   * Dormancy state (treasury exhaustion). When present it gates the tick at the
   * top and is flipped on funds exhaustion. Optional so existing tests omit it.
   */
  agentState?: AgentStateRepo;
}

// ── Result ────────────────────────────────────────────────────────────────────

export type CuratorResult =
  | {
      ok: true;
      tickLogId: string;
      storyUrl: string;
      /** The curator's pick for this tick — kind, identifier, and why. */
      pick: { kind: string; identifier: string; rationale: string };
      /** Rendered story title (falls back to the pick identifier server-side). */
      storyTitle: string;
      heroImagePrompt?: string;
      /** Ace Data service receipts the render consumed (llm/image/serp). */
      receipts: Receipt[];
      memoSig: string | null;
      webhookPosted: boolean;
    }
  | { ok: false; step: string; reason: string; tickLogId: string };

// ── Main export ───────────────────────────────────────────────────────────────

export async function runCuratorTick(deps: CuratorDeps): Promise<CuratorResult> {
  const tickLogId = crypto.randomUUID();
  const startedAt = new Date();

  // Dormant gate (treasury exhaustion): if the agent is dormant, bail before
  // doing any work — no tick_log row, no webhook. Dormancy is sticky and cleared
  // out-of-band (the wallet is refunded, then the dormant flag is reset). Optional
  // dep, so tests that omit `agentState` skip the gate. The persisted reason is an
  // opaque code (ADR 0016 F) — never a balance/floor string.
  if (deps.agentState && (await deps.agentState.isDormant())) {
    return { ok: false, step: 'dormant', reason: 'dormant', tickLogId };
  }

  try {
    // Step 1: signal-aggregation (5-step brain)
    const { candidates, pick } = await runStep('aggregate', () =>
      aggregateSignals(deps.aggregator),
    );

    // The rationale is the curator's own brief; it steers tone/angle/emphasis
    // exactly as a buyer brief does in the reactive flow. An empty rationale
    // skips the Director and keeps today's fixed 'Epic' fallback path.
    const briefHash = createHash('sha256')
      .update(pick.rationale ?? '')
      .digest('hex');

    // Steps 2–3 branch on the pick kind (ADR 0014). The autonomous aggregator
    // emits kind:'token' for a Dexscreener-resolved mint; only the legacy SERP
    // wallet resolver yields kind:'wallet'. Token picks route through the token
    // path end-to-end (enriched spotlights, news-seeded Director, infographic
    // hero); the wallet path is preserved exactly.
    let story: unknown;
    let receipts: Receipt[];

    if (pick.kind === 'token') {
      // Step 2: token spotlight enrichment (Dexscreener-primary + RPC trust).
      const spotlights = await runStep('spotlight', () =>
        fetchTokenSpotlights(pick.identifier, deps.tokenSource),
      );

      // Step 2.5: Director (token gate). The brief threads the curator rationale
      // + the sourceHitText-derived news query so the Director can news-seed a
      // token serpQuery (ADR 0014, two-tier truth); the rationale becomes emphasis.
      let plan: Plan | undefined;
      if ((pick.rationale ?? '').trim().length > 0 && deps.ace) {
        const brief = [pick.rationale, pick.newsQuery].filter((s) => s && s.length > 0).join('\n');
        const safeSpotlights = JSON.parse(
          JSON.stringify(spotlights, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        );
        plan = await runStep('direct', () =>
          runDirector(
            safeSpotlights as Spotlights,
            brief,
            'token',
            deps.ace as AceChatLike,
            deps.heavyChatModel,
          ),
        );
      }

      // Step 3: token story-renderer (chat + image + serp) — guardOrThrow inside.
      const rendered = await runStep('render', () =>
        renderTokenStory(spotlights, 'Epic', deps.tokenRender, plan),
      );
      story = rendered.story;
      receipts = rendered.receipts;

      // Step 3.5: x402 media enrichment (ADR 0016 D — every kind, fail-soft).
      // Video + audio run as async tasks (wait:false): fire → receipt → bounded
      // collect → mirror to Blob → stamp the story. A miss NEVER fails the tick —
      // the paid-call volume is booked at POST, not here.
      receipts.push(
        ...(await enrichStoryMedia(story as MediaEnrichableStory, tickLogId, {
          video: deps.video,
          audio: deps.audio,
          blobStore: deps.blobStore,
        })),
      );
    } else {
      // Step 2: wallet spotlight-fetcher (RPC enrichment).
      const spotlights = await runStep('spotlight', () =>
        fetchWalletSpotlights(pick.identifier, deps.rpc),
      );

      // Step 2.5: Director (only when the pick carries a non-empty rationale).
      let plan: Plan | undefined;
      if ((pick.rationale ?? '').trim().length > 0 && deps.ace) {
        // The Director JSON-stringifies the spotlights into its prompt; wallet
        // spotlights carry BigInt fields (balanceLamports) that JSON.stringify
        // rejects, so hand it a BigInt-safe view (BigInt -> decimal string).
        const safeSpotlights = JSON.parse(
          JSON.stringify(spotlights, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        );
        plan = await runStep('direct', () =>
          runDirector(
            safeSpotlights as Spotlights,
            pick.rationale,
            'wallet',
            deps.ace as AceChatLike,
            deps.heavyChatModel,
          ),
        );
      }

      // Step 3: story-renderer (chat + image) — calls defaultCostGuard.guardOrThrow()
      // internally; a CostCapExceededError propagates to the outer catch below.
      const rendered = await runStep('render', () =>
        renderStory(spotlights, 'wallet', 'Epic', deps.render, plan),
      );
      story = rendered.story;
      receipts = rendered.receipts;

      // Step 3.5: x402 media enrichment (ADR 0016 D — wallet kind too, fail-soft).
      receipts.push(
        ...(await enrichStoryMedia(story as MediaEnrichableStory, tickLogId, {
          video: deps.video,
          audio: deps.audio,
          blobStore: deps.blobStore,
        })),
      );
    }

    // Step 4: story-repo upsert with provenance = curator
    await runStep('upsert', () =>
      deps.storyRepo.upsertCurated(pick.identifier, pick.kind, story, tickLogId),
    );

    const storyUrl = `${deps.storyBaseUrl}/${pick.identifier}`;

    // Step 5: SAP Memo v2 audit entry. Trimmed, non-sensitive memo content (ADR
    // 0016 E/7): tick id + kind + the public identifier + the COMPLETE
    // service-provenance receipt (every leg, incl. video/audio when they ran).
    // The briefHash and the source-hit headline are deliberately dropped.
    const memoReceipts = receipts.map(receiptToProvenance).join(',');
    const { sig: memoSig } = await runStep('memo', () =>
      deps.memoWriter.write(
        tickLogId,
        `Curator tick ${tickLogId}: ${pick.kind} ${pick.identifier} ace:${memoReceipts}`,
      ),
    );

    // Step 5b: surface the audit memo on the curated story row so the share
    // page's ReceiptLinks renders it (parallels the buyer attachReceipts).
    // Best-effort: the memo is already on-chain and in tick_log, so a failed
    // attach must not fail the tick.
    if (memoSig) {
      try {
        await deps.storyRepo.attachMemo(pick.identifier, memoSig);
      } catch (err) {
        console.error('[curator-tick] attachMemo failed:', (err as Error).message);
      }
    }

    // Step 6: webhook-poster — a failed post must fail the tick so the cron
    // surfaces a non-2xx (review feedback on #27).
    const storyTitle = (story as { title?: string }).title ?? pick.identifier;
    const { ok: webhookPosted } = await runStep('webhook', () =>
      postUrl(storyUrl, pick.kind, storyTitle, deps.webhook),
    );

    if (!webhookPosted) {
      throw new StepError('webhook', `webhook post failed for ${storyUrl}`);
    }

    // Step 7: persist tick_log
    await deps.tickLogRepo.insert({
      id: tickLogId,
      startedAt,
      signalSource: [...new Set(candidates.map((c) => c.source))].join(','),
      candidatesConsidered: candidates.length,
      pickKind: pick.kind,
      pickIdentifier: pick.identifier,
      pickRationale: pick.rationale,
      pickSourceHit: pick.sourceHitText,
      briefHash,
      aceReceipts: receipts,
      memoSig,
      webhookPosted,
      error: null,
    });

    return {
      ok: true,
      tickLogId,
      storyUrl,
      pick: { kind: pick.kind, identifier: pick.identifier, rationale: pick.rationale },
      storyTitle,
      heroImagePrompt: (story as { heroImagePrompt?: string }).heroImagePrompt,
      receipts,
      memoSig,
      webhookPosted,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const step = err instanceof StepError ? err.step : 'unknown';
    const originalErr = err instanceof StepError ? err.cause : err;
    if (originalErr instanceof CostCapExceededError) {
      console.error(`[curator-tick] aborted: cost cap hit — ${error}`);
    }
    // Funds-exhaustion (D7): the x402 rail ran dry on USDC or SOL. Flip the agent
    // dormant and short-circuit cleanly — no error tick_log row, no webhook (the
    // webhook step is only reached on success) — so the cron sees a quiet dormant
    // result instead of looping on a doomed tick.
    if (isFundsExhausted(originalErr) && deps.agentState) {
      // Persist an OPAQUE dormancy code (ADR 0016 F) — never the balance/floor or
      // the underlying error text. The full error is logged below, not stored.
      await deps.agentState.setDormant('dormant');
      return { ok: false, step: 'dormant', reason: 'dormant', tickLogId };
    }
    await deps.tickLogRepo.insert({
      id: tickLogId,
      startedAt,
      signalSource: '',
      candidatesConsidered: 0,
      pickKind: '',
      pickIdentifier: '',
      pickRationale: '',
      pickSourceHit: '',
      briefHash: createHash('sha256').update('').digest('hex'),
      aceReceipts: [],
      memoSig: null,
      webhookPosted: false,
      error,
    });
    return { ok: false, step, reason: error, tickLogId };
  }
}
