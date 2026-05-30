/**
 * Vercel Blob mirror for generated media (ADR 0015). The autonomous tick fires
 * video/audio at Ace and gets back a remote URL; we copy that asset into our own
 * Blob store so the share page never hot-links a provider URL that may expire.
 *
 * Fail-soft by design: Blob is a MIRROR, not a gate. Anything that goes wrong —
 * no token, a fetch error, an upload error — falls back to the original Ace URL
 * so a Blob hiccup NEVER fails the tick. We only warn.
 */

import { put } from '@vercel/blob';
import { env } from '@/env';

export async function storeRemoteAsset(sourceUrl: string, key: string): Promise<string> {
  // No token -> embed the Ace URL directly (fail-soft, no mirror).
  if (!env.BLOB_READ_WRITE_TOKEN) return sourceUrl;

  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.warn(`[blob] fetch ${sourceUrl} -> ${res.status}; using source url`);
      return sourceUrl;
    }
    const blob = await res.blob();
    const result = await put(key, blob, {
      access: 'public',
      token: env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
      contentType: blob.type || undefined,
    });
    return result.url;
  } catch (err) {
    console.warn(`[blob] store ${key} failed; using source url`, err);
    return sourceUrl;
  }
}
