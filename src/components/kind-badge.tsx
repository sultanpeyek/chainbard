/**
 * KindBadge — a small monospace tag for an on-chain `kind` (wallet / tx / nft /
 * token), tinted with the per-kind hue token. Server-safe (no client state);
 * shared by the Preview, Featured strip, and Recent feed for a consistent
 * almanac vocabulary.
 */

type Kind = 'wallet' | 'tx' | 'nft' | 'token';

const HUE: Record<Kind, string> = {
  wallet: 'var(--kind-wallet)',
  tx: 'var(--kind-tx)',
  nft: 'var(--kind-nft)',
  token: 'var(--kind-token)',
};

const LABEL: Record<Kind, string> = {
  wallet: 'Wallet',
  tx: 'Transaction',
  nft: 'NFT',
  token: 'Token',
};

export function KindBadge({ kind }: { kind: Kind }) {
  const hue = HUE[kind];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{
        color: hue,
        borderColor: `color-mix(in oklab, ${hue} 40%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${hue} 8%, transparent)`,
      }}
    >
      <span aria-hidden className="h-1 w-1 rounded-full" style={{ backgroundColor: hue }} />
      {LABEL[kind]}
    </span>
  );
}
