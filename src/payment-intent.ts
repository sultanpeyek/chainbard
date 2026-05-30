import { createHash } from 'node:crypto';

/**
 * The idempotency key for a mint is the buyer's partial-signed payment intent —
 * `envelope.payload.transaction` (base64). That blob already carries the buyer's
 * signature and is replayed byte-identical on a Resume, so its sha256 is stable
 * across envelope replays of the SAME payment yet unique per freshly-signed
 * payment. That's exactly what distinguishes a Re-mint (new intent) from a
 * Resume (same intent), independent of process/instance, before settle runs.
 */
export function computeIntentId(txB64: string): string {
  return createHash('sha256').update(txB64, 'utf8').digest('hex');
}
