const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaPubkey(str: unknown): str is string {
  return typeof str === 'string' && BASE58_RE.test(str);
}
