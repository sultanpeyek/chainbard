/**
 * FeaturedStrip — the operator-curated showcase (CONTEXT "Featured"). Static
 * list of real mainnet inputs; each card links to its `/[input]` share page.
 * Server-safe (no client state). Distinct from the deferred organic Gallery.
 */
import Link from 'next/link';
import { FEATURED } from '@/config/featured';
import { truncateId } from '@/lib/truncate-id';
import { CopyAddress } from './copy-address';
import { KindBadge } from './kind-badge';

export function FeaturedStrip() {
  return (
    <section aria-labelledby="featured-heading" className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="cb-eyebrow">Curated</span>
          <h2 id="featured-heading" className="cb-display text-3xl text-bone sm:text-4xl">
            Featured stories
          </h2>
        </div>
      </div>

      <ul className="grid grid-cols-1 overflow-hidden rounded-[4px] border border-ink-line sm:grid-cols-2 lg:grid-cols-3">
        {FEATURED.map((entry) => (
          <li key={entry.input} className="-mr-px -mb-px border-r border-b border-ink-line">
            <Link
              href={`/${encodeURIComponent(entry.input)}`}
              className="group flex h-full flex-col gap-4 p-5 transition-colors hover:bg-ink-raised"
            >
              <div className="flex items-center justify-between">
                {entry.kind ? (
                  <KindBadge kind={entry.kind} />
                ) : (
                  <span className="cb-eyebrow">Story</span>
                )}
                <span
                  aria-hidden
                  className="font-mono text-bone-faint transition-transform group-hover:translate-x-0.5 group-hover:text-amber"
                >
                  →
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="cb-display text-xl leading-tight text-bone">
                  {entry.label ?? truncateId(entry.input)}
                </span>
                <CopyAddress
                  value={entry.input}
                  kind={entry.kind === 'tx' ? 'tx' : 'address'}
                  className="self-start text-[11px] text-bone-faint"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
