'use client';

import Link from 'next/link';
import { useState } from 'react';

type Variant = 'nft' | 'token' | 'tx';

const PILL: Record<Variant, string> = {
  nft: 'flex items-center gap-2 rounded-full border border-ink-line bg-ink-raised/40 px-4 py-2 text-sm font-medium text-bone-dim backdrop-blur transition-colors hover:border-amber hover:text-amber',
  token:
    'flex items-center gap-2 rounded-full border border-ink-line px-4 py-2 text-sm text-bone-dim transition-colors hover:border-amber hover:text-amber',
  tx: 'flex items-center gap-2 rounded-[2px] border border-ink-line bg-ink-raised/40 px-4 py-2 text-sm font-medium text-bone transition-colors hover:border-amber hover:text-amber',
};

const MINT: Partial<Record<Variant, string>> = {
  nft: 'flex items-center gap-2 rounded-full border border-amber bg-amber/10 px-4 py-2 text-sm font-semibold text-amber transition-colors hover:bg-amber/20',
  token:
    'flex items-center gap-2 rounded-full bg-amber px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-amber/90',
};

export function ShareActions({ title, variant }: { title: string; variant: Variant }) {
  const [copied, setCopied] = useState(false);
  const mintClass = MINT[variant];

  function copyLink() {
    const url = window.location.href;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  function tweet() {
    const url = window.location.href;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      title,
    )}&url=${encodeURIComponent(url)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <button type="button" onClick={copyLink} className={PILL[variant]}>
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      <button type="button" onClick={tweet} className={PILL[variant]}>
        Tweet
      </button>
      {mintClass ? (
        <Link href="/" className={mintClass}>
          ✦ Mint your own — 0.30 USDC
        </Link>
      ) : null}
    </>
  );
}
