/**
 * Demo provenance gate for the reactive mint route.
 *
 * A request carrying `x-demo-key` that matches the server-only `DEMO_SECRET`
 * is tagged `provenance='demo'` (isolated from real buyer/curator volume and
 * hidden from the public gallery) and may force the placeholder image via
 * `skipImage` to avoid a Midjourney call.
 *
 * Without a valid key the request behaves exactly as a buyer mint: provenance
 * stays `'buyer'` and any `skipImage` signal is ignored. The gate only ever
 * downgrades the caller's own render and tags their own row.
 */

import type { Provenance } from '@/story-repo';

export interface DemoGateInput {
  demoKey: string | null | undefined;
  skipImage: boolean;
  demoSecret: string | undefined;
}

export interface DemoGate {
  provenance: Provenance;
  skipImage: boolean;
}

export function resolveDemoGate({ demoKey, skipImage, demoSecret }: DemoGateInput): DemoGate {
  // An unset/empty DEMO_SECRET must never grant demo access, even to an empty
  // key — otherwise a missing secret in production would open the gate.
  const isDemo = Boolean(demoSecret) && demoKey === demoSecret;
  return {
    provenance: isDemo ? 'demo' : 'buyer',
    skipImage: isDemo && skipImage,
  };
}

export interface ImageGenClient {
  generate(prompt: string): Promise<{ url: string; model: string }>;
}

/**
 * Image client for demo/skipImage runs: returns the placeholder URL and never
 * calls Midjourney. Keeps demos fast and free of image-generation cost.
 */
export function placeholderImageClient(url: string): ImageGenClient {
  return {
    async generate(_prompt: string) {
      return { url, model: 'placeholder' };
    },
  };
}

/**
 * The image client the mint route uses for a given gate decision: when
 * `skipImage` is set (gated demo run) it returns a placeholder client that
 * never calls Midjourney; otherwise it returns the real image client.
 */
export function selectImageClient(
  skipImage: boolean,
  opts: { realImage: ImageGenClient; placeholderUrl: string },
): ImageGenClient {
  return skipImage ? placeholderImageClient(opts.placeholderUrl) : opts.realImage;
}
