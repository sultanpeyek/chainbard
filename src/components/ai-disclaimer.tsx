/**
 * AiDisclaimer — the "the bard can be wrong" note.
 *
 * chainbard's stories are AI-written and can misread, embellish, or invent.
 * This surfaces a plain caution so a reader treats the prose as interpretation,
 * not record — the on-chain facts stay the source of truth. Shown on every
 * AI-rendered share page and on the homepage mint form.
 *
 *   variant="page"   — boxed note for share pages (tx / wallet / token)
 *   variant="inline" — compact one-liner for the mint widget
 */

export function AiDisclaimer({ variant = 'page' }: { variant?: 'page' | 'inline' }) {
  if (variant === 'inline') {
    return (
      <p className="flex items-start gap-2 font-mono text-[10px] leading-relaxed text-bone-faint">
        <span aria-hidden className="mt-px shrink-0 text-amber/70">
          △
        </span>
        <span>
          The bard writes with AI and can be wrong — it may misread or invent. The chain is the
          source of truth.
        </span>
      </p>
    );
  }

  return (
    <div className="rounded-[3px] border border-ink-line bg-ink-raised/30 px-5 py-4">
      <p className="flex items-center gap-2">
        <span aria-hidden className="text-amber/80">
          △
        </span>
        <span className="cb-eyebrow text-bone-faint">AI-generated — may be wrong</span>
      </p>
      <p className="mt-2 wrap-break-word font-mono text-xs leading-relaxed text-bone-dim">
        chainbard&rsquo;s bard writes this story with AI. It can misread, embellish, or hallucinate
        details, so treat the prose as interpretation — not a record. The on-chain facts above are
        the source of truth; verify before relying on anything here.
      </p>
    </div>
  );
}
