import type { Metadata } from 'next';
import { JudgeOverlay } from '@/components/judge-overlay';
import { NftSharePage } from '@/components/nft-share-page';
import { PaywallCta } from '@/components/paywall-cta';
import { RemintCta } from '@/components/remint-cta';
import {
  FIXTURE_TX_SIG,
  FIXTURE_TX_STORY,
  FIXTURE_WALLET,
  FIXTURE_WALLET_STORY,
  NFT_FIXTURE,
  NFT_FIXTURE_MINT,
} from '@/components/share-fixtures';
import { TokenSharePage } from '@/components/token-share-page';
import { TxSharePage } from '@/components/tx-share-page';
import { WalletSharePage } from '@/components/wallet-share-page';
import { featuredLabel } from '@/config/featured';
import { env } from '@/env';
import type { WalletStory } from '@/story-renderer';
import { computeInputHash, createSqlRepo } from '@/story-repo';

function appBase(): string {
  return env.NEXT_PUBLIC_APP_URL;
}

// Trailing Re-mint affordance shared by every cache-HIT share page: a cached
// story renders free, this lets any visitor pay to overwrite it (latest-paid-wins).
function RemintSection({ input }: { input: string }) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-16 sm:px-8">
      <RemintCta input={input} />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ input: string }>;
}): Promise<Metadata> {
  const { input } = await params;
  const decoded = decodeURIComponent(input);
  const base = appBase();
  const ogImageUrl = `${base}/og/${encodeURIComponent(decoded)}`;

  const title =
    decoded === NFT_FIXTURE_MINT
      ? `${NFT_FIXTURE.title} | chainbard`
      : decoded === FIXTURE_WALLET
        ? `${FIXTURE_WALLET_STORY.title} | chainbard`
        : featuredLabel(decoded)
          ? `${featuredLabel(decoded)} | chainbard`
          : `${decoded.slice(0, 16)}... | chainbard`;
  const description =
    decoded === NFT_FIXTURE_MINT
      ? NFT_FIXTURE.subtitle
      : decoded === FIXTURE_WALLET
        ? FIXTURE_WALLET_STORY.subtitle
        : 'An on-chain story powered by chainbard.';

  return {
    title,
    description,
    metadataBase: new URL(base),
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function SharePage({ params }: { params: Promise<{ input: string }> }) {
  const { input } = await params;
  const decoded = decodeURIComponent(input);

  // ── Fixture short-circuits (no DB / no creds fallback) ──────────────────
  if (decoded === NFT_FIXTURE_MINT) {
    return <NftSharePage story={NFT_FIXTURE} provenance="seed" />;
  }

  // ── Cache-first: check DB before any RPC/DAS/detectKind call ─────────────
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(env.DATABASE_URL);
    const repo = createSqlRepo(sql as Parameters<typeof createSqlRepo>[0]);
    const inputHash = computeInputHash(decoded);
    const cached = await repo.getByInputHash(inputHash);

    if (cached) {
      // Operator-curated identity wins over the AI-generated title when this
      // asset is featured (e.g. "Mad Lads #7541" over "Crown of Transience").
      const label = featuredLabel(decoded);
      if (label) cached.story.title = label;

      // HIT: route by persisted story.kind — no re-render, no re-spend
      switch (cached.story.kind) {
        case 'wallet': {
          const s = cached.story;
          return (
            <>
              <WalletSharePage
                story={s}
                provenance={cached.provenance}
                memoSig={cached.memoSig}
                paymentSig={cached.paymentSig}
                brief={cached.brief}
              />
              <JudgeOverlay
                story={s}
                provenance={cached.provenance}
                memoSig={cached.memoSig}
                paymentSig={cached.paymentSig}
              />
              <RemintSection input={decoded} />
            </>
          );
        }
        case 'tx': {
          return (
            <>
              <TxSharePage
                story={cached.story}
                provenance={cached.provenance}
                memoSig={cached.memoSig}
                paymentSig={cached.paymentSig}
              />
              <RemintSection input={decoded} />
            </>
          );
        }
        case 'nft': {
          return (
            <>
              <NftSharePage
                story={cached.story}
                provenance={cached.provenance}
                memoSig={cached.memoSig}
                paymentSig={cached.paymentSig}
              />
              <RemintSection input={decoded} />
            </>
          );
        }
        case 'token': {
          const s = cached.story;
          return (
            <>
              <TokenSharePage
                story={s}
                provenance={cached.provenance}
                memoSig={cached.memoSig}
                paymentSig={cached.paymentSig}
                brief={cached.brief}
              />
              <JudgeOverlay
                story={s as unknown as WalletStory}
                provenance={cached.provenance}
                memoSig={cached.memoSig}
                paymentSig={cached.paymentSig}
              />
              <RemintSection input={decoded} />
            </>
          );
        }
      }
    }

    // ── Cache MISS: paywall (ADR 0006) ──────────────────────────────────
    // A never-rendered input no longer renders live for free; it shows the
    // paywall CTA. The paid render happens exclusively in POST /api/mint/story,
    // which persists provenance='buyer' and turns this into a free cache hit.
    return <PaywallCta input={decoded} />;
  } catch {
    // DB unavailable — fall through to no-DB path below
  }

  // ── No-DB fallback: fixtures stay free; everything else is a paywall ──────
  // With no DB cache to consult, the only free views are the seeded fixtures
  // (a cache-hit equivalent). Any other input is a never-rendered cache miss and
  // shows the paywall CTA rather than rendering live for free (ADR 0006).
  if (decoded === FIXTURE_TX_SIG) {
    return <TxSharePage story={{ ...FIXTURE_TX_STORY, input: decoded }} provenance="seed" />;
  }

  if (decoded === FIXTURE_WALLET) {
    return (
      <WalletSharePage
        story={FIXTURE_WALLET_STORY}
        provenance="seed"
        memoSig={null}
        paymentSig={null}
      />
    );
  }

  return <PaywallCta input={decoded} />;
}
