// Error taxonomy for the paid mint stream. Mirrors MintErrorKind in
// @/hooks/use-mint (kept in sync by hand — the backend has no runtime dep on the
// client hook). Lives in its own env-free module so the classification is unit
// testable without importing the route's env/RPC module init.
export type MintErrorKind =
  | 'rejected'
  | 'insufficient-usdc'
  | 'blockhash-expired'
  | 'facilitator-refundable'
  | 'generic';

// Map a failure reason string to a MintErrorKind. `refundable` is passed
// explicitly: when the buyer was charged (facilitator settle failed, or the
// orchestrator flagged a refundable render failure) → facilitator-refundable;
// otherwise the reason text disambiguates.
export function kindFromReason(reason: string, refundable: boolean): MintErrorKind {
  if (refundable) return 'facilitator-refundable';
  const r = reason.toLowerCase();
  if (r.includes('blockhash')) return 'blockhash-expired';
  if (r.includes('insufficient')) return 'insufficient-usdc';
  return 'generic';
}

// A pre-settle /verify failure: the buyer's signed transfer was never broadcast,
// so nothing was charged. Such a failure is NEVER refundable — classify by reason
// text so the UI offers "Try again" rather than the misleading "Payment sent…
// Resume" copy. The TokenLedger / feePayer / RPC-state verify rejections all land
// here.
export function verifyFailureKind(reason: string): MintErrorKind {
  return kindFromReason(reason, false);
}
