/**
 * truncateId — collapse a long on-chain identifier to first-N…last-N so it never
 * breaks a layout. Pure + server-safe (no 'use client'), so server components can
 * call it directly; the client CopyAddress chip reuses it for its display text.
 *
 * Lengths differ by kind: addresses/mints (44 chars) show 4…4; tx signatures
 * (88 chars) show 8…6 since more context helps when scanning a forensic page.
 */

export type IdKind = 'address' | 'tx';

const HEAD_TAIL: Record<IdKind, [number, number]> = {
  address: [4, 4],
  tx: [8, 6],
};

export function truncateId(value: string, kind: IdKind = 'address'): string {
  const [head, tail] = HEAD_TAIL[kind];
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

// Base58 run of pubkey/signature length. The LLM bakes raw identifiers into the
// generated title/subtitle/body ("The Silent Ledger of ExQwQeD7…"), so any text
// rendered to the page is swept for these runs and each is collapsed in place —
// 8…6 for signature-length (≥64), 4…4 for address-length. Leaves normal prose
// untouched (no English word is 32+ chars of the base58 alphabet).
const BASE58_RUN = /[1-9A-HJ-NP-Za-km-z]{32,}/g;

export function shortenIds(text: string): string {
  return text.replace(BASE58_RUN, (m) => truncateId(m, m.length >= 64 ? 'tx' : 'address'));
}
