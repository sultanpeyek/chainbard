/**
 * SiteHeader — the shared top chrome. The cap-mark + "chainbard" wordmark lock
 * up on the left and link home; the Activity / Judge nav sits on the right. Set
 * `active` to mark the current section; the brand always links home.
 */
import Link from 'next/link';
import { BrandLockup } from './brand-lockup';

export function SiteHeader({ active }: { active?: 'activity' | 'judge' }) {
  return (
    <header className="border-b border-ink-line">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <BrandLockup size="lg" />
        <nav className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.18em]">
          <Link
            href="/activity"
            aria-current={active === 'activity' ? 'page' : undefined}
            className={`transition-colors hover:text-amber ${active === 'activity' ? 'text-amber' : 'text-bone-dim'}`}
          >
            activity
          </Link>
          {active === 'judge' ? (
            <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-amber px-2.5 py-1.5 text-amber">
              <span aria-hidden className="h-1 w-1 rounded-full bg-amber" />
              judge mode
            </span>
          ) : (
            <Link
              href="/judge"
              className="inline-flex items-center gap-1.5 rounded-[2px] border border-ink-line px-2.5 py-1.5 text-bone-dim transition-colors hover:border-amber hover:text-amber"
            >
              <span aria-hidden className="h-1 w-1 rounded-full bg-amber" />
              judge mode
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
