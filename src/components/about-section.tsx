/**
 * AboutSection — the pitch + provenance row. Source repo (UI label only), the
 * maker's links (new tab), and a link to the public /activity tick log.
 * Server-safe.
 */
import Link from 'next/link';
import { Wordmark } from './wordmark';

const REPO_URL = 'https://github.com/sultanpeyek/chainbard';
const MAKER_GH = 'https://github.com/sultanpeyek';
const MAKER_X = 'https://x.com/sultanpeyek';

const SAP_URL = 'https://synapse.oobeprotocol.ai';
const ACE_URL = 'https://platform.acedata.cloud';
const FACILITATOR_URL = 'https://facilitator.acedata.cloud';

function ProviderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-bone underline-offset-4 transition-colors hover:text-amber hover:underline"
    >
      {children}
    </a>
  );
}

export function AboutSection() {
  return (
    <section
      aria-labelledby="about-heading"
      className="grid gap-10 rounded-[4px] border border-ink-line bg-ink-raised/50 p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr]"
    >
      <div className="flex flex-col gap-5">
        <span className="cb-eyebrow">About</span>
        <h2 id="about-heading" className="cb-display text-3xl text-bone sm:text-4xl">
          The ledger remembers. <Wordmark /> retells it.
        </h2>
        <p className="max-w-xl font-mono text-sm leading-relaxed text-bone-dim">
          Paste a wallet, a transaction, an NFT, or a token mint. chainbard discovers tools on the{' '}
          <ProviderLink href={SAP_URL}>Synapse Agent Protocol</ProviderLink>, pulls live context
          from <ProviderLink href={ACE_URL}>Ace Data Cloud</ProviderLink> and{' '}
          <ProviderLink href={SAP_URL}>Synapse RPC</ProviderLink>, and renders a permanent,
          shareable story page — every Ace call paid through the{' '}
          <ProviderLink href={ACE_URL}>Ace Data Cloud</ProviderLink>{' '}
          <ProviderLink href={FACILITATOR_URL}>x402 facilitator</ProviderLink>. A daily curator tick
          publishes on its own, no human in the loop.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:border-l sm:border-ink-line sm:pl-10">
        <span className="cb-eyebrow">Colophon</span>
        <ul className="flex flex-col gap-3 font-mono text-sm">
          <li>
            <Link
              href="/activity"
              className="group inline-flex items-center gap-2 text-bone transition-colors hover:text-amber"
            >
              <span aria-hidden className="text-bone-faint group-hover:text-amber">
                ✦
              </span>
              Curator tick log → /activity
            </Link>
          </li>
          <li>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 text-bone transition-colors hover:text-amber"
            >
              <span aria-hidden className="text-bone-faint group-hover:text-amber">
                ✦
              </span>
              Source — github.com/sultanpeyek/chainbard
            </a>
          </li>
        </ul>

        <div className="cb-rule" />

        <p className="font-mono text-[13px] text-bone-faint">
          made by{' '}
          <a
            href={MAKER_GH}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bone underline-offset-4 transition-colors hover:text-amber hover:underline"
          >
            @sultanpeyek
          </a>{' '}
          ·{' '}
          <a
            href={MAKER_X}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bone underline-offset-4 transition-colors hover:text-amber hover:underline"
          >
            x.com/sultanpeyek
          </a>
        </p>
      </div>
    </section>
  );
}
