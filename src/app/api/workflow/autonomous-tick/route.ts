/**
 * Durable Upstash Workflow trigger — autonomous curator tick (ADR 0015, Phase D).
 *
 * A QStash schedule (scripts/setup-qstash-schedule.ts) POSTs this route hourly.
 * `serve()` makes the run resumable across the 300s function limit and gives
 * at-least-once delivery with auto-retries. The tick runs inside a single durable
 * `context.run` step; its own dormant gate (treasury exhaustion) returns before
 * any paid call, and on funds-exhaustion it self-flips dormant and returns
 * step:"dormant" — which we deliberately do NOT rethrow, so QStash does not retry
 * a doomed tick (no retry storm). Any OTHER failure is rethrown so QStash retries.
 *
 * NOTE (follow-up, ADR 0015): for full resume idempotency each PAID call
 * (video/audio fire) would live in its OWN `context.run` step so a mid-tick
 * resume never re-bills. v1 runs the tick as one step — acceptable because
 * video/audio are fired with wait:false (no long inline wait), keeping the tick
 * short. The simpler alternative trigger is a QStash schedule pointed straight at
 * GET /api/cron/autonomous-tick with a Bearer CRON_SECRET header.
 */

import { serve } from '@upstash/workflow/nextjs';
import { runCuratorTick } from '@/autonomous-curator';
import { type CronEnv, createCronAdaptersFromEnv } from '@/cron-adapters';
import { env } from '@/env';
import { makeFetchHttpClient, makeInMemoryPostedStore } from '@/webhook-poster';

export const maxDuration = 300;

// Mirror of the GET cron route's env mapping (single source of the CronEnv shape).
function buildCronEnv(): CronEnv {
  return {
    DATABASE_URL: env.DATABASE_URL,
    ACE_API_KEY: env.ACE_API_KEY,
    SOLANA_RPC_URL: env.SOLANA_RPC_URL,
    SYNAPSE_RPC_URL: env.SYNAPSE_RPC_URL,
    AGENT_SECRET_KEY_BASE58: env.AGENT_SECRET_KEY_BASE58,
    AGENT_WALLET: env.NEXT_PUBLIC_AGENT_WALLET,
    WEBHOOK_URL: env.WEBHOOK_URL ?? '',
    STORY_BASE_URL: env.NEXT_PUBLIC_APP_URL,
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

export const { POST } = serve(
  async (context) => {
    if (!env.WEBHOOK_URL) return; // misconfigured — nothing to post; end cleanly.

    const factory = await createCronAdaptersFromEnv(buildCronEnv());

    return await context.run('curator-tick', async () => {
      const result = await runCuratorTick({
        ...factory.deps,
        webhook: {
          webhookUrl: env.WEBHOOK_URL as string,
          store: makeInMemoryPostedStore(),
          http: makeFetchHttpClient(),
        },
        storyBaseUrl: factory.storyBaseUrl,
      });
      // A dormant result is intentional (treasury exhausted) — return a minimal
      // body so QStash sees success and does NOT retry. Any other failure is
      // rethrown so the run is retried.
      if (!result.ok) {
        if (result.step !== 'dormant') {
          // Opaque message (ADR 0016 F) — step only, never result.reason (which can
          // carry provider/cost text). The in-tick D7 classifier already flips
          // dormant for funds-exhaustion, so a non-dormant step here is not a funds error.
          throw new Error(`curator tick failed at ${result.step}`);
        }
        return { dormant: true };
      }
      // Minimal success body (ADR 0016 F): never the full CuratorResult (no
      // rationale, receipts, or sigs leak through the route response).
      return { tickLogId: result.tickLogId, storyUrl: result.storyUrl };
    });
  },
  {
    // Defensive net: if a tick threw a funds-exhaustion-shaped error before the
    // in-tick D7 classifier could flip dormant, set dormant here so a dry wallet
    // never triggers a QStash retry storm.
    failureFunction: async ({ failResponse, failStack }) => {
      try {
        const { isFundsExhausted } = await import('@/treasury');
        if (!isFundsExhausted(failResponse) && !isFundsExhausted(failStack)) return;
        const { createDb } = await import('@/db');
        const { createSqlAgentStateRepo } = await import('@/agent-state-repo');
        // Persist an OPAQUE dormancy code (ADR 0016 F) — never the error text.
        await createSqlAgentStateRepo(createDb(env.DATABASE_URL)).setDormant('dormant');
      } catch (e) {
        console.error('[workflow] failureFunction setDormant failed:', e);
      }
    },
  },
);
