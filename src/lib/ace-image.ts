/**
 * Single-image response parsing, shared by the reactive mint route and the
 * on-demand `[input]` page. Pure (no env): provider selection lives in the
 * route via `env.IMAGE_PROVIDER` / `env.IMAGE_FALLBACK_PROVIDER`.
 *
 * Provider response shapes differ:
 * - flux / nano-banana / seedream return ONE image inline: `{ data: { image_url } }`.
 * - midjourney goes through `wait:true` polling, so the SDK returns the whole
 *   poll state with the payload nested under `response`. With `split_images:true`
 *   the 2x2 grid is split into 4 single panels under `sub_image_urls` — we take
 *   panel 0 so the hero is one clean image, not a collage.
 */

function pickUrl(obj: Record<string, unknown>): string | undefined {
  // Prefer a split single panel (midjourney + split_images) over the grid image.
  const split = obj.sub_image_urls as unknown;
  if (Array.isArray(split) && split.length) return split[0] as string;
  const single = (obj.image_url as string) ?? (obj.url as string) ?? (obj.raw_image_url as string);
  if (single) return single;
  const arr = obj.image_urls as unknown;
  return Array.isArray(arr) ? (arr[0] as string) : undefined;
}

/**
 * Pull the single image URL out of an Ace image response. Unwraps the polled
 * task `response` wrapper, accepts `data` as either an object (inline single
 * image) or an array (midjourney grid — first element wins), and falls back to
 * the top level.
 */
export function extractImageUrl(result: Record<string, unknown>): string | undefined {
  // Polled tasks (midjourney) nest the payload under `response`; inline
  // providers (flux) don't. Try the wrapper first, then the raw result.
  const base = (result.response as Record<string, unknown>) ?? result;

  const rawData = base.data ?? result.data;
  const dataObj = Array.isArray(rawData)
    ? (rawData[0] as Record<string, unknown> | undefined)
    : (rawData as Record<string, unknown> | undefined);

  return (dataObj && pickUrl(dataObj)) ?? pickUrl(base) ?? pickUrl(result);
}
