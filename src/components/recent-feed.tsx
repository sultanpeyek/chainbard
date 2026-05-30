/**
 * RecentFeed — the live homepage feed of the most-recently-minted real stories
 * (CONTEXT "Recent"). Server component: fetches `listRecent` directly from the
 * DB (excludes `provenance='demo'`, newest-first — ADR 0005). On a fresh deploy
 * with no real mints it shows a "be the first" empty state (ADR 0006).
 */
import Link from 'next/link';
import { featuredLabel } from '@/config/featured';
import { env } from '@/env';
import { shortenIds } from '@/lib/truncate-id';
import type { WalletStoryRow } from '@/story-repo';
import { computeInputHash, createSqlRepo } from '@/story-repo';
import { CopyAddress } from './copy-address';
import { KindBadge } from './kind-badge';

const RECENT_LIMIT = 6;

async function loadRecent(): Promise<WalletStoryRow[]> {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(env.DATABASE_URL);
    const repo = createSqlRepo(sql as Parameters<typeof createSqlRepo>[0]);
    return await repo.listRecent(RECENT_LIMIT);
  } catch (e) {
    console.error('[recent] failed to load wallet_stories:', e);
    return [];
  }
}

export async function RecentFeed() {
  const rows = await loadRecent();

  return (
    <section aria-labelledby="recent-heading" className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="cb-eyebrow">Live</span>
          <h2 id="recent-heading" className="cb-display text-3xl text-bone sm:text-4xl">
            Recently minted
          </h2>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[4px] border border-dashed border-ink-line bg-ink-raised/40 px-6 py-16 text-center">
          <span aria-hidden className="cb-lantern text-2xl text-amber">
            ✦
          </span>
          <p className="cb-display text-xl text-bone">No stories minted yet.</p>
          <p className="max-w-sm font-mono text-[13px] text-bone-faint">
            Be the first. Paste an identifier above, preview it free, and mint the story.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 overflow-hidden rounded-[4px] border border-ink-line sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const href = `/${encodeURIComponent(row.input)}`;
            const title = featuredLabel(row.input) ?? row.story.title;
            return (
              <li
                key={computeInputHash(row.input)}
                className="-mr-px -mb-px border-r border-b border-ink-line"
              >
                <Link
                  href={href}
                  className="group flex h-full min-w-0 flex-col gap-3 p-5 transition-colors hover:bg-ink-raised"
                >
                  <div className="flex items-center justify-between">
                    <KindBadge kind={row.story.kind} />
                    <span
                      aria-hidden
                      className="font-mono text-bone-faint transition-transform group-hover:translate-x-0.5 group-hover:text-amber"
                    >
                      →
                    </span>
                  </div>
                  <span className="cb-display wrap-break-word text-lg leading-tight text-bone">
                    {shortenIds(title)}
                  </span>
                  <p className="line-clamp-2 wrap-break-word font-mono text-[12px] leading-relaxed text-bone-dim">
                    {shortenIds(row.story.subtitle)}
                  </p>
                  <CopyAddress
                    value={row.input}
                    kind={row.story.kind === 'tx' ? 'tx' : 'address'}
                    className="mt-auto self-start text-[11px] text-bone-faint"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
