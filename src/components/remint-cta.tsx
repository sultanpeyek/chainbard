'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * RemintCta — the "Re-mint" affordance on a cache-HIT share page (/[input]).
 *
 * A cached story is shown for free with no way to refresh it. This adds a plain
 * Re-mint CTA: any visitor can pay 0.30 USDC to overwrite the story with a fresh
 * render (latest-paid-wins; identity is the input alone). It reuses the exact
 * paid flow as a first mint — a Link to `/?input=…` seeds the homepage Mint
 * widget, which auto-runs the free preview and drives the same x402 → sign →
 * settle handshake (a NEW payment intent). No new payment path is built here.
 *
 * Re-minting overwrites a paid artifact, so the button confirms once before it
 * hands off, rather than firing on the first click.
 */
export function RemintCta({ input }: { input: string }) {
  const [confirming, setConfirming] = useState(false);
  const href = `/?input=${encodeURIComponent(input)}`;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {confirming ? (
        <div className="flex flex-col items-center gap-2">
          <Link
            href={href}
            className="flex items-center gap-2 rounded-[3px] border border-amber bg-amber/10 px-5 py-2.5 font-mono text-sm uppercase tracking-[0.18em] text-amber transition-colors hover:bg-amber hover:text-ink"
          >
            <span aria-hidden className="cb-lantern">
              ✦
            </span>
            Confirm re-mint · 0.30 USDC
          </Link>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-faint underline-offset-4 hover:text-amber hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 rounded-full border border-ink-line bg-ink-raised/40 px-4 py-2 text-sm font-medium text-bone-dim backdrop-blur transition-colors hover:border-amber hover:text-amber"
        >
          <span aria-hidden>✦</span>
          Re-mint
        </button>
      )}
      <p className="font-mono text-[10px] text-bone-faint">
        Renders a fresh story over this one — newest paid render wins.
      </p>
    </div>
  );
}
