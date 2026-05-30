'use client';

/**
 * CopyAddress — a click-to-copy chip for any on-chain identifier. Truncates to
 * first-N…last-N so a 44-char pubkey or 88-char tx signature never breaks the
 * layout, and copies the FULL value to the clipboard on click (sonner toast cue).
 *
 * Lengths differ by kind: addresses/mints (44 chars) show 4…4; tx signatures
 * (88 chars) show 8…6 since more context helps when scanning a forensic page.
 */

import type { MouseEvent } from 'react';
import { toast } from 'sonner';
import { type IdKind, truncateId } from '@/lib/truncate-id';

export function CopyAddress({
  value,
  kind = 'address',
  label,
  className,
}: {
  value: string;
  kind?: IdKind;
  /** Override the displayed text (e.g. a human label); the full value is still copied. */
  label?: string;
  className?: string;
}) {
  const shown = label ?? truncateId(value, kind);

  async function copy(e: MouseEvent) {
    // Cards wrap this chip in a <Link> (an <a href>). stopPropagation alone
    // won't help: the anchor's navigation is the click's *default action*, not a
    // bubbling listener, so it fires regardless. preventDefault cancels the nav;
    // stopPropagation also keeps Link's own onClick from running.
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard', { description: truncateId(value, kind) });
    } catch {
      toast.error('Copy failed — clipboard unavailable');
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`${value} · click to copy`}
      className={`group inline-flex max-w-full items-center gap-1.5 font-mono transition-colors hover:text-amber ${className ?? ''}`}
    >
      <span className="truncate">{shown}</span>
      <span
        aria-hidden
        className="shrink-0 text-bone-faint opacity-60 transition-all group-hover:text-amber group-hover:opacity-100"
      >
        ⧉
      </span>
    </button>
  );
}
