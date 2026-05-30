import Link from 'next/link';

/**
 * The interactive leg of the paywall (ADR 0006): the "Mint · 0.30 USDC" CTA. It
 * links to the homepage Mint widget with the input prefilled, where the paid
 * x402 flow lives. Tone is no longer chosen here — the Director derives it from
 * the on-chain facts plus the optional patron brief entered at the widget. No
 * live AI render on this surface.
 */
export function PaywallMintButton({ input }: { input: string }) {
  const href = `/?input=${encodeURIComponent(input)}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={href}
        className="mt-2 rounded-[3px] border border-amber bg-amber/10 px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-amber transition-colors hover:bg-amber/20"
      >
        Mint · 0.30 USDC
      </Link>
    </div>
  );
}
