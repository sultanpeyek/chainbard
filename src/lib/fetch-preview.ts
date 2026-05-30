/**
 * fetch-preview — client-side helper for the homepage Mint widget's free
 * Preview. POSTs the pasted input to /api/preview and normalises the result
 * into a discriminated union so the widget renders either facts or a clear
 * reason. Boundary (`fetch`) is injectable for unit tests.
 */
import type { PreviewResult } from '@/modules/preview-facts';

export type PreviewOutcome = { ok: true; result: PreviewResult } | { ok: false; reason: string };

export async function fetchPreview(
  input: string,
  doFetch: typeof fetch = fetch,
): Promise<PreviewOutcome> {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Paste an address, signature, or mint.' };

  let res: Response;
  try {
    res = await doFetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: trimmed }),
    });
  } catch {
    return { ok: false, reason: 'Network error — check your connection.' };
  }

  if (!res.ok) {
    return {
      ok: false,
      reason:
        res.status === 400
          ? "That doesn't look like a Solana identifier."
          : 'Preview unavailable right now.',
    };
  }

  try {
    const result = (await res.json()) as PreviewResult;
    if (!result || typeof result.kind !== 'string' || !Array.isArray(result.facts)) {
      return { ok: false, reason: 'Preview unavailable right now.' };
    }
    return { ok: true, result };
  } catch {
    return { ok: false, reason: 'Preview unavailable right now.' };
  }
}
