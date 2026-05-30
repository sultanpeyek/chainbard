import { inferToneFromKind } from '@/infer-tone';
import { TONES, type Tone } from '@/story-renderer';

/**
 * Resolve the tone to use for a story render.
 *
 * - If `explicit` is a valid Tone, use it.
 * - Otherwise fall back to `inferToneFromKind(kind)`.
 *
 * Cache-first means tone is baked only on the first render; revisiting a
 * cached story with `?tone=X` does NOT re-render.
 */
export function resolveTone(
  explicit: string | undefined,
  kind: 'wallet' | 'tx' | 'nft' | 'token',
): Tone {
  if (explicit && (TONES as readonly string[]).includes(explicit)) {
    return explicit as Tone;
  }
  return inferToneFromKind(kind);
}
