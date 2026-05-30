import Link from 'next/link';
import type { ActivityTick } from '@/activity-repo';
import { KindBadge } from '@/components/kind-badge';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { truncateId } from '@/lib/truncate-id';

const KNOWN_KINDS = ['wallet', 'tx', 'nft', 'token'] as const;
type KnownKind = (typeof KNOWN_KINDS)[number];

function isKnownKind(kind: string): kind is KnownKind {
  return (KNOWN_KINDS as readonly string[]).includes(kind);
}

// Neutral story feed (ADR 0016 F): each row shows only the timestamp and the pick
// linked to its story. No rationale, no ACE receipt breakdown, no error text, no
// budget/treasury wording — the spend posture never leaks on this public surface.
// On-chain proof + the ACE receipt live in Judge mode, not here.
function TickRow({ tick }: { tick: ActivityTick }) {
  return (
    <article className="border-ink-line border-b py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <time className="font-mono text-bone-faint text-xs" dateTime={tick.startedAt.toISOString()}>
          {tick.startedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
        </time>
        {isKnownKind(tick.pickKind) ? (
          <KindBadge kind={tick.pickKind} />
        ) : (
          <span className="rounded-[2px] border border-ink-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-dim">
            {tick.pickKind}
          </span>
        )}
      </div>

      <div className="mt-2">
        <Link
          href={`/${encodeURIComponent(tick.pickIdentifier)}`}
          className="break-all font-mono text-amber text-sm transition-colors hover:underline"
        >
          {truncateId(tick.pickIdentifier)}
        </Link>
      </div>
    </article>
  );
}

export function ActivityFeed({ ticks, note }: { ticks: ActivityTick[]; note?: string }) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <SiteHeader active="activity" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 sm:px-8 py-12">
        <header className="cb-rise border-ink-line border-b pb-6">
          <p className="cb-eyebrow text-bone-faint">Curator log</p>
          <h1 className="cb-display mt-2 text-3xl tracking-tight text-bone">
            <span className="text-amber">Activity</span>
          </h1>
          <p className="mt-2 text-bone-dim text-sm">
            Autonomous curator tick history — every pick, linked to its story.
          </p>
          {note && (
            <p className="mt-3 rounded-[2px] border border-ink-line px-3 py-2 font-mono text-[11px] text-bone-faint">
              {note}
            </p>
          )}
        </header>

        {ticks.length === 0 ? (
          <p className="py-16 text-center text-bone-faint text-sm">
            No curator ticks recorded yet. Check back after the next daily run.
          </p>
        ) : (
          <div>
            {ticks.map((tick) => (
              <TickRow key={tick.id} tick={tick} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
