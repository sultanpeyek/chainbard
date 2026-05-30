/**
 * Shared x402 media enrichment (ADR 0016 B/D) — video + audio for ANY rendered
 * story, on EVERY kind (wallet/tx/nft/token) and on BOTH flows (the autonomous
 * tick inline, and the reactive durable media-attach job).
 *
 * Fail-soft by contract: every seam (generate / collect / blob) is wrapped so a
 * media miss NEVER fails the caller — the paid-call volume is booked at the
 * `generate` POST (wait:false), not at attach time. Each fired task pushes a
 * provenance Receipt (service + taskId, url filled once collected).
 *
 * Content policy (CONTENT_POLICY, ADR 0015): video is ABSTRACT data-motion only
 * (no living beings / logos / mascots); audio is TTS / spoken-word only (the
 * provider is pinned to a TTS provider upstream in cron-adapters).
 */

import type { AudioClient } from '@/lib/ace-audio-client';
import type { MediaResult, VideoClient } from '@/lib/ace-video-client';
import type { Receipt } from '@/story-renderer';

// Abstract DATA-MOTION prompt: kinetic typography / animated data card /
// geometric motion only — no beings, obeys CONTENT_POLICY.
const VIDEO_PROMPT =
  'Abstract data-motion: kinetic typography and an animated data card, ' +
  'geometric motion of charts and numeric labels, no living beings, no ' +
  'logos or mascots — pure data visualization in motion.';

/** The story fields the enrichment reads (narration source) and writes (urls). */
export interface MediaEnrichableStory {
  subtitle?: string;
  sections?: Array<{ body?: string }>;
  videoUrl?: string;
  videoProvider?: string;
  audioUrl?: string;
  audioProvider?: string;
}

export interface MediaEnrichDeps {
  video?: VideoClient;
  audio?: AudioClient;
  /** Mirror a collected media URL to Blob (fail-soft passthrough without a token). */
  blobStore?: (url: string, key: string) => Promise<string>;
}

/**
 * Generate + collect video/audio for `story`, mirror to Blob, and stamp the urls
 * onto `story` in place. `keyPrefix` namespaces the Blob keys (e.g. a tickLogId
 * or inputHash). Returns the provenance receipts for the fired tasks. Never
 * throws — a media failure is swallowed to a warn.
 */
export async function enrichStoryMedia(
  story: MediaEnrichableStory,
  keyPrefix: string,
  deps: MediaEnrichDeps,
): Promise<Receipt[]> {
  const receipts: Receipt[] = [];

  if (deps.video) {
    try {
      const handle: MediaResult | null = await deps.video.generate(VIDEO_PROMPT);
      if (handle) {
        const receipt: Receipt = {
          kind: 'video',
          provider: handle.service,
          taskId: handle.taskId,
          url: null,
        };
        receipts.push(receipt);
        const url = await deps.video.collect(handle.taskId, handle.service);
        if (url) {
          const stored = deps.blobStore ? await deps.blobStore(url, `video/${keyPrefix}.mp4`) : url;
          story.videoUrl = stored;
          story.videoProvider = handle.service;
          receipt.url = stored;
        }
      }
    } catch (err) {
      console.warn('[media-enrich] video enrichment failed:', (err as Error).message);
    }
  }

  if (deps.audio) {
    // Spoken-word reading of the story's subtitle + first section body — no
    // music, no instruments (obeys CONTENT_POLICY).
    const narration = [story.subtitle, story.sections?.[0]?.body]
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .join(' ');
    try {
      const handle: MediaResult | null = await deps.audio.generate(narration);
      if (handle) {
        const receipt: Receipt = {
          kind: 'audio',
          provider: handle.service,
          taskId: handle.taskId,
          url: null,
        };
        receipts.push(receipt);
        const url = await deps.audio.collect(handle.taskId, handle.service);
        if (url) {
          const stored = deps.blobStore ? await deps.blobStore(url, `audio/${keyPrefix}.mp3`) : url;
          story.audioUrl = stored;
          story.audioProvider = handle.service;
          receipt.url = stored;
        }
      }
    } catch (err) {
      console.warn('[media-enrich] audio enrichment failed:', (err as Error).message);
    }
  }

  return receipts;
}
