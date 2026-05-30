import { type SolscanKind, solscanUrl } from '@/lib/explorer';

/**
 * SolscanLink — a "view on Solscan" chip shared by every story kind view
 * (wallet / tx / nft / token). Opens the explorer in a new tab and speaks the
 * same wax-seal language as ProvenanceReceipt's proof links: mono micro-caps,
 * amber-on-ink, and the ↗ glyph that nudges right on hover.
 *
 * Server component on purpose — it's a plain anchor with no interactivity, so it
 * ships zero client JS and drops straight into the server-rendered share pages.
 */

const ENTITY: Record<SolscanKind, string> = {
  wallet: 'account',
  tx: 'transaction',
  nft: 'mint',
  token: 'mint',
};

export function SolscanLink({
  value,
  kind,
  className,
}: {
  value: string;
  kind: SolscanKind;
  className?: string;
}) {
  return (
    <a
      href={solscanUrl(value, kind)}
      target="_blank"
      rel="noreferrer"
      title={`View ${ENTITY[kind]} on Solscan`}
      className={`group inline-flex items-center gap-1.5 rounded-[2px] border border-ink-line bg-ink-raised/40 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-bone-dim backdrop-blur transition-colors hover:border-amber hover:text-amber ${className ?? ''}`}
    >
      <span className="text-bone-faint">solscan</span>
      <span>{ENTITY[kind]}</span>
      <span
        aria-hidden
        className="text-bone-faint transition-transform duration-140 group-hover:translate-x-0.5 group-hover:text-amber"
      >
        ↗
      </span>
    </a>
  );
}
