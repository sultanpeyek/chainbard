/**
 * Provider-chain `VideoClient` (ADR 0015) — optional, async media enrichment
 * for the cron tick. Mirrors the defensive shape of `ace-image-client.ts`:
 * `ace` is duck-typed (no hard SDK dependency), every provider call is wrapped
 * in try/catch with a `console.warn` on failure, and NOTHING throws out — video
 * is optional enrichment, so `generate`/`collect` return `null` rather than
 * failing the tick.
 *
 * Unlike images (which resolve inline), video providers (veo/kling/sora/...) run
 * as ASYNC tasks: `generate({ ..., wait:false })` returns a TaskHandle whose id
 * we extract, then `collect` polls `tasks.get(id, { service })` until a media URL
 * appears or the timeout elapses. Response shapes vary across providers, so id +
 * url extraction is delegated to the shared `ace-media` parsers.
 */

import { extractMediaUrl, extractTaskId } from '@/lib/ace-media';

export interface AceVideoGenerate {
  video: { generate(opts: Record<string, unknown>): Promise<unknown> };
}

export interface AceTasksGet {
  tasks: { get(id: string, opts?: { service?: string }): Promise<Record<string, unknown>> };
}

export interface MediaResult {
  taskId: string;
  service: string;
}

export interface VideoClient {
  /** Fire the provider chain (wait:false). Returns the task handle or null. */
  generate(prompt: string): Promise<MediaResult | null>;
  /** Poll the async task until a media URL appears or the timeout elapses. */
  collect(taskId: string, service: string): Promise<string | null>;
}

/** Poll cadence for async media tasks. */
const POLL_INTERVAL_MS = 5000;

export function buildProviderChainVideoClient(
  ace: AceVideoGenerate & AceTasksGet,
  opts: { chain: Array<{ provider: string; model?: string }>; timeoutMs: number },
): VideoClient {
  return {
    async generate(prompt) {
      // Try each provider in the chain; the first to hand back a task id wins.
      // A failing provider is logged and skipped — only after the whole chain
      // fails do we return null (the tick proceeds without video).
      for (const { provider, model } of opts.chain) {
        try {
          const resp = await ace.video.generate({
            provider,
            model,
            prompt,
            action: 'text2video',
            wait: false,
          });
          const taskId = extractTaskId(resp);
          if (taskId) return { taskId, service: provider };
          // Provider accepted the call but we couldn't parse a task id — log the
          // raw shape so a missed response variant doesn't silently fall through.
          console.warn(`[video] ${provider} returned no parseable task id`, JSON.stringify(resp));
        } catch (err) {
          console.warn(`[video] ${provider} failed:`, (err as Error).message);
          // try next provider in the chain
        }
      }
      return null;
    },

    async collect(taskId, service) {
      // Bounded poll: re-fetch the task until a media URL is parseable or we run
      // out of time. Any error is swallowed to null — video never fails the tick.
      const deadline = Date.now() + opts.timeoutMs;
      try {
        while (Date.now() < deadline) {
          const task = await ace.tasks.get(taskId, { service });
          const url = extractMediaUrl(task);
          if (url) return url;
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      } catch (err) {
        console.warn(`[video] collect ${service}/${taskId} failed:`, (err as Error).message);
        return null;
      }
      return null;
    },
  };
}
