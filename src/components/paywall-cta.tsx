import { CopyAddress } from '@/components/copy-address';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { makePreviewDeps } from '@/lib/preview-deps';
import { type PreviewResult, previewFacts } from '@/modules/preview-facts';
import { KindBadge } from './kind-badge';
import { PaywallMintButton } from './paywall-mint-button';

/**
 * PaywallCta — the cache-miss surface for a never-rendered input (ADR 0006).
 *
 * Shows the input, a free Preview (detected kind + cheap on-chain facts from
 * free RPC only, no Ace spend), a tone picker, and a "Mint · 0.30 USDC" CTA that
 * drives the homepage Mint widget. The paid AI render happens exclusively in
 * POST /api/mint/story — never here.
 */
export async function PaywallCta({ input }: { input: string }) {
  let preview: PreviewResult | null = null;
  try {
    preview = await previewFacts(input, makePreviewDeps());
  } catch {
    preview = null;
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-12 sm:px-8">
        <div className="flex w-full flex-col gap-8 cb-rise">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="cb-display text-3xl tracking-tight text-bone">
              No <span className="text-amber">story</span> yet
            </h1>
            <p className="text-sm text-bone-dim">
              This input hasn’t been minted. Preview it free, then mint to render the story.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-[5px] border border-ink-line bg-ink-raised/40 p-6 backdrop-blur shadow-[0_0_60px_-20px_rgba(232,161,58,0.25)]">
            <div className="flex flex-col gap-1">
              <span className="cb-eyebrow text-bone-faint">input</span>
              <CopyAddress value={input} />
            </div>

            {preview ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="cb-eyebrow text-bone-faint">preview</span>
                  <KindBadge kind={preview.kind} />
                </div>
                <dl className="flex flex-col gap-1.5">
                  {preview.facts.map((fact) => (
                    <div key={fact.label} className="flex justify-between gap-4 text-sm">
                      <dt className="text-bone-dim">{fact.label}</dt>
                      <dd className="break-all text-right font-mono text-bone">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <p className="text-sm text-bone-faint">Preview unavailable for this input.</p>
            )}
          </div>

          <PaywallMintButton input={input} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
