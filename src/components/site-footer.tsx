/**
 * SiteFooter — the shared bottom chrome. Same link set on every page (Home /
 * Activity / Judge / Source) so a reader can always navigate back out of a deep
 * story page.
 */
import Link from 'next/link';
import { BrandLockup } from './brand-lockup';

const REPO_URL = 'https://github.com/sultanpeyek/chainbard';

const PROVIDERS = [
  { label: 'Synapse Agent Protocol', href: 'https://synapse.oobeprotocol.ai' },
  { label: 'Synapse RPC', href: 'https://synapse.oobeprotocol.ai' },
  { label: 'Ace Data Cloud', href: 'https://platform.acedata.cloud' },
  { label: 'x402 facilitator', href: 'https://facilitator.acedata.cloud' },
] as const;

export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 border-t border-ink-line px-5 py-10 text-center sm:px-8">
      <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:justify-between sm:text-left">
        <BrandLockup size="sm" />
        <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.18em] text-bone-faint">
          <Link href="/" className="transition-colors hover:text-amber">
            Home
          </Link>
          <Link href="/activity" className="transition-colors hover:text-amber">
            Activity
          </Link>
          <Link href="/judge" className="transition-colors hover:text-amber">
            Judge mode
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-amber"
          >
            Source
          </a>
        </div>
      </div>
      <div className="flex w-full flex-col items-center gap-3 border-t border-ink-line pt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-bone-faint sm:flex-row sm:flex-wrap sm:justify-center">
        <span className="text-bone-faint/70">Built on</span>
        {PROVIDERS.map((p) => (
          <a
            key={p.label}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-amber"
          >
            {p.label}
          </a>
        ))}
      </div>
    </footer>
  );
}
