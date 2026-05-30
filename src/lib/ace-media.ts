/**
 * Async-task response parsing for video/audio, shared by the provider-chain
 * video client and the fish audio client. Pure (no env), mirroring the
 * response-shape idioms in `ace-image.ts`.
 *
 * Unlike inline images, video/audio run as async tasks: `generate({ wait:false })`
 * returns either a `TaskHandle` (with an `.id`) or a record carrying the task id,
 * and the result URL only appears once the task completes and is polled via
 * `tasks.get`. Provider/poll shapes vary, so both extractors probe several nesting
 * levels (top level, `response`, `data` as object OR array first element).
 */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/** First element of an array-or-object payload, as a record. */
function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function pickId(obj: Record<string, unknown> | undefined): string | undefined {
  if (!obj) return undefined;
  const id = (obj.task_id as unknown) ?? (obj.id as unknown);
  return typeof id === 'string' ? id : undefined;
}

/**
 * Pull the task id out of a `generate({ wait:false })` response. Accepts a
 * `TaskHandle` (reads `.id`) and records with `id`/`task_id` at the top level,
 * nested under `data` (object or array first element), or under `response`.
 */
export function extractTaskId(result: unknown): string | undefined {
  const obj = asRecord(result);
  if (!obj) return undefined;

  // TaskHandle / top-level record.
  return (
    pickId(obj) ?? pickId(firstRecord(obj.data)) ?? pickId(firstRecord(obj.response)) ?? undefined
  );
}

/** First http(s) URL among the media url keys on a record. */
function pickMediaUrl(obj: Record<string, unknown> | undefined): string | undefined {
  if (!obj) return undefined;
  const candidate =
    (obj.video_url as unknown) ?? (obj.audio_url as unknown) ?? (obj.url as unknown);
  return typeof candidate === 'string' && /^https?:\/\//i.test(candidate) ? candidate : undefined;
}

/**
 * Pull the finished media URL (`video_url`/`audio_url`/`url`) out of a polled
 * task result. Searches the top level, `response`, and `data` (object OR array
 * first element) plus `response.data`. Returns the first http(s) string.
 */
export function extractMediaUrl(result: unknown): string | undefined {
  const obj = asRecord(result);
  if (!obj) return undefined;

  const response = asRecord(obj.response);
  return (
    pickMediaUrl(obj) ??
    pickMediaUrl(response) ??
    pickMediaUrl(firstRecord(obj.data)) ??
    pickMediaUrl(firstRecord(response?.data)) ??
    undefined
  );
}
