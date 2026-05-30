import type { Metadata } from 'next';
import Image from 'next/image';
import { AboutSection } from '@/components/about-section';
import { FeaturedStrip } from '@/components/featured-strip';
import { MintWidget } from '@/components/mint-widget';
import { RecentFeed } from '@/components/recent-feed';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

// Recent feed reads live DB state; render the homepage fresh per request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'chainbard — on-chain stories',
  description:
    'Paste a Solana wallet, transaction, NFT, or token mint. chainbard renders a permanent, shareable story page — preview free, mint for 0.30 USDC.',
};

export default function Home() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
        {/* ── hero + mint widget ─────────────────────────────────────────── */}
        <section className="grid items-start gap-12 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="cb-rise flex flex-col gap-7">
            <span className="cb-eyebrow">An autonomous on-chain storyteller</span>
            <h1 className="cb-display text-5xl text-bone sm:text-6xl lg:text-7xl">
              Every address holds a&nbsp;
              <span className="text-amber">story</span>. Render it.
            </h1>
            <p className="max-w-md font-mono text-sm leading-relaxed text-bone-dim">
              Paste a Solana identifier — a wallet, a transaction signature, an NFT, or a token mint
              — and chainbard turns its on-chain life into a permanent, shareable page. Preview
              free, mint for 0.30 USDC over x402.
            </p>
            <dl className="grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-[3px] border border-ink-line bg-ink-line text-center">
              {[
                { k: '0.30', v: 'USDC / mint' },
                { k: 'x402', v: 'paid render' },
                { k: '∞', v: 'free to view' },
              ].map((s) => (
                <div key={s.v} className="flex flex-col gap-1 bg-ink px-2 py-4">
                  <dt className="cb-display text-2xl text-amber">{s.k}</dt>
                  <dd className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone-faint">
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="cb-rise flex flex-col gap-10">
            <div className="rounded-[5px] border border-ink-line bg-ink-raised/40 p-6 shadow-[0_0_60px_-20px_rgba(232,161,58,0.25)] backdrop-blur sm:p-8">
              <MintWidget />
            </div>

            {/* ── the crest — the autonomous bard, rendered large ─────────────
               Background-cut cutout (alpha PNG) so the gilt cap floats free over
               the ink ground; a soft amber dawn pools behind it. */}
            <figure className="relative hidden items-center justify-center pb-6 pt-2 lg:flex">
              <div
                aria-hidden
                className="absolute h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(232,161,58,0.20)_0%,transparent_68%)] blur-xl"
              />
              <Image
                src="/brand/logo-cap-1024.png"
                alt="chainbard — the plumed bard's cap, the maker's mark"
                width={1024}
                height={594}
                priority
                className="cb-crest relative w-80 select-none drop-shadow-[0_22px_45px_rgba(0,0,0,0.55)] xl:w-[22rem]"
              />
              <figcaption className="absolute -bottom-2 font-mono text-[10px] uppercase tracking-[0.22em] text-bone-faint">
                the bard sets a quill to your chain
              </figcaption>
            </figure>
          </div>
        </section>

        <div className="cb-rule my-4" />

        {/* ── featured ───────────────────────────────────────────────────── */}
        <div className="py-16">
          <FeaturedStrip />
        </div>

        <div className="cb-rule my-4" />

        {/* ── recent (server feed) ───────────────────────────────────────── */}
        <div className="py-16">
          <RecentFeed />
        </div>

        <div className="cb-rule my-4" />

        {/* ── about ──────────────────────────────────────────────────────── */}
        <div className="py-16">
          <AboutSection />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
