/**
 * Shared provider-chain `ImageClient` (ADR 0014) — extracted verbatim from the
 * reactive mint route's inline `realImage` so the route AND the cron tick render
 * on the SAME nano-banana → seedream → placeholder chain (replacing cron's
 * `dall-e-3`, which garbles infographic text).
 *
 * Behaviour preserved exactly from `src/app/api/mint/story/route.ts`:
 * - de-duped `[provider, fallbackProvider]` order;
 * - per-provider opts: nano-banana sizes by aspect (no `size`, no `wait`);
 *   seedream/flux take an explicit landscape `size` (no `wait`); midjourney goes
 *   through `wait:true` polling with `--ar` + `split_images`;
 * - each provider call bounded by `timeoutMs`;
 * - `extractImageUrl` parsing, `console.warn` on no-url / failure;
 * - deterministic `placeholderUrl` fallback so the render always completes.
 *
 * `ace` is the AceData image surface (`images.generate(opts)`); duck-typed so
 * this file takes no hard dependency on the SDK.
 */

import { extractImageUrl } from '@/lib/ace-image';
import type { ImageClient } from '@/story-renderer';

export interface AceImageGenerate {
  images: { generate(opts: Record<string, unknown>): Promise<unknown> };
}

export interface ProviderChainImageOpts {
  /** De-duped, ordered provider list (e.g. [IMAGE_PROVIDER, IMAGE_FALLBACK_PROVIDER]). */
  providers: string[];
  /** Concrete model per provider name (seedream/nano-banana require one). */
  models: Record<string, string>;
  /** Explicit landscape size for seedream/flux (e.g. '1344x768'). */
  size: string;
  /** Per-provider timeout budget in ms. */
  timeoutMs: number;
  /** Deterministic fallback when every provider fails. */
  placeholderUrl: string;
  /** Midjourney tuning (only used when 'midjourney' is in `providers`). */
  midjourney?: { mode: string; quality: string; aspect: string };
}

export function buildProviderChainImageClient(
  ace: AceImageGenerate,
  opts: ProviderChainImageOpts,
): ImageClient {
  const mj = opts.midjourney ?? { mode: 'fast', quality: '.25', aspect: '16:9' };

  return {
    async generate(prompt) {
      // Inline image gen (wait:true) can take a while and was resetting the
      // connection mid-render. Bound each provider call with a timeout. Try the
      // primary provider first; if it fails/times out, fall back to the next;
      // only then fall back to a deterministic placeholder so the render still
      // completes instead of dying.
      const tryProvider = async (provider: string): Promise<string | undefined> => {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('image-gen timeout')), opts.timeoutMs),
        );
        const params =
          provider === 'midjourney'
            ? {
                prompt: `${prompt} --ar ${mj.aspect}`,
                provider,
                mode: mj.mode,
                quality: mj.quality,
                split_images: true,
                wait: true,
              }
            : provider === 'nano-banana'
              ? // nano-banana sizes by aspect, not an explicit `size` string.
                // No `wait`: the inline response already carries `data`; passing
                // wait:true makes the SDK discard it and poll a task that never
                // reports `succeeded` → hangs until our timeout (see images.ts).
                { prompt, provider, model: opts.models[provider] }
              : // seedream + flux take an explicit landscape `size`. No `wait` —
                // same inline-vs-poll reason as nano-banana above.
                { prompt, provider, model: opts.models[provider], size: opts.size };
        const task = await Promise.race([ace.images.generate(params), timeout]);
        const url = extractImageUrl(task as Record<string, unknown>);
        // Provider call succeeded but no URL parsed — log the raw shape so a
        // missed response variant doesn't silently fall through to placeholder.
        if (!url) {
          console.warn(`[image] ${provider} returned no parseable url`, JSON.stringify(task));
        }
        return url;
      };

      for (const provider of opts.providers) {
        try {
          const url = await tryProvider(provider);
          if (url) return { url, model: provider };
        } catch (err) {
          console.warn(`[image] ${provider} failed:`, (err as Error).message);
          // try next provider, then placeholder
        }
      }
      return { url: opts.placeholderUrl, model: 'placeholder' };
    },
  };
}
