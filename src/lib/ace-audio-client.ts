/**
 * Async audio `AudioClient` — mirrors the provider-chain video client shape but
 * for a single audio provider (default `fish`). Like video, audio is OPTIONAL
 * enrichment: `generate`/`collect` return `null` on failure and NEVER throw out,
 * so a media miss can't fail the tick.
 *
 * `ace` is the AceData audio surface (`audio.generate(opts)`) plus the shared
 * `tasks.get` poller; both are duck-typed so this file takes no hard dependency
 * on the SDK. `MediaResult` + `AceTasksGet` come from the video client so the two
 * media paths share one task shape; response parsing comes from `ace-media`.
 */

import { extractMediaUrl, extractTaskId } from '@/lib/ace-media';
import type { AceTasksGet, MediaResult } from '@/lib/ace-video-client';

export interface AceAudioGenerate {
  audio: { generate(opts: Record<string, unknown>): Promise<unknown> };
}

export interface AudioClient {
  generate(narration: string): Promise<MediaResult | null>;
  collect(taskId: string, service: string): Promise<string | null>;
}

const POLL_INTERVAL_MS = 5000;

// AceData's fish TTS requires a `voice_id` for speech synthesis — omitting it
// errors "voice_id is required when action is speech". 'default' is the mainstream
// built-in voice from AceData's own fish-audio skill docs (no /fish/voices
// registration needed). Hardcoded — no env knob (ADR 0016 always-on).
const FISH_VOICE_ID = 'default';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildFishAudioClient(
  ace: AceAudioGenerate & AceTasksGet,
  opts: { provider: string; timeoutMs: number },
): AudioClient {
  return {
    async generate(narration) {
      try {
        const resp = await ace.audio.generate({
          provider: opts.provider,
          // Fish TTS rejects `model` outright ("model is invalid if action is
          // speech") and defaults action to 'speech' — so we send NEITHER, only the
          // prompt + voice_id. AUDIO_MODEL is intentionally NOT forwarded here (it
          // would re-trigger the error whenever the operator sets it).
          prompt: narration,
          voice_id: FISH_VOICE_ID,
          wait: false,
        });
        const taskId = extractTaskId(resp);
        if (taskId) return { taskId, service: opts.provider };
        console.warn(`[audio] ${opts.provider} returned no task id`, JSON.stringify(resp));
        return null;
      } catch (err) {
        console.warn(`[audio] ${opts.provider} generate failed:`, (err as Error).message);
        return null;
      }
    },

    async collect(taskId, service) {
      // Poll the task until a media URL appears or the timeout budget elapses.
      // Swallow all errors -> null: a stalled/erroring poll must not fail the tick.
      const deadline = Date.now() + opts.timeoutMs;
      while (Date.now() < deadline) {
        try {
          const task = await ace.tasks.get(taskId, { service });
          const url = extractMediaUrl(task);
          if (url) return url;
        } catch {
          // transient poll error — keep polling until the deadline
        }
        await sleep(POLL_INTERVAL_MS);
      }
      return null;
    },
  };
}
