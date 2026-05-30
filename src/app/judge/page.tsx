/**
 * /judge — the Judge mode dashboard (CONTEXT "Judge mode", ADR 0006).
 *
 * Reviewer-facing, OPEN (no auth). Surfaces technical proof a grader can verify:
 *   - a LIVE 402 probe of the paid mint endpoint (client island, no payment),
 *   - the agent-discover endpoint, the autonomous /activity log,
 *   - the SAP memo trail (agent wallet on Solscan), and the source repo,
 *   - a short note on the payment-gated render architecture.
 *
 * HARD EXCLUSION: never renders DEMO_SECRET, keypairs, _recon, or operator
 * strategy. Everything here is on-chain-public or non-sensitive metadata.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CopyAddress } from '@/components/copy-address';
import { JudgeProbe } from '@/components/judge-probe';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { env } from '@/env';
import { truncateId } from '@/lib/truncate-id';

export const metadata: Metadata = {
  title: 'judge mode — chainbard',
  description: 'Open, reviewer-facing proof surface: live 402 probe, agent discovery, memo trail.',
};

const REPO_URL = 'https://github.com/sultanpeyek/chainbard';

// Agent wallet that receives payment and signs the SAP Memo v2 audit trail.
// Public mainnet pubkey — its Solscan account page is the memo trail. Same
// default as the mint route's AGENT_WALLET; a NEXT_PUBLIC_ override keeps this
// server/client-safe without exposing the secret key.
const AGENT_WALLET = env.NEXT_PUBLIC_AGENT_WALLET;
const MEMO_TRAIL_URL = `https://solscan.io/account/${AGENT_WALLET}`;

// Internal test-loop wallet. It drives the continuous mint/settle smoke test, so
// its transactions inflate the memo trail with synthetic volume. Exclude it when
// counting real, judge-relevant volume.
const TEST_LOOP_WALLET = '4HtB4QCubGYpqUnY6DDiZY8WvtyAXbNveRagVSVNuYUf';

interface ProofLink {
  href: string;
  label: string;
  detail: string;
  external: boolean;
}

const PROOF_LINKS: ProofLink[] = [
  {
    href: '/api/agents/discover',
    label: 'Agent discovery',
    detail: 'GET /api/agents/discover — every AgentAccount PDA on the SAP program',
    external: true,
  },
  {
    href: '/activity',
    label: 'Curator history',
    detail: '/activity — autonomous daily tick log with on-chain proof',
    external: false,
  },
  {
    href: MEMO_TRAIL_URL,
    label: 'SAP memo trail',
    detail: `Solscan account ${truncateId(AGENT_WALLET)} — the SAP Memo v2 audit entries`,
    external: true,
  },
  {
    href: REPO_URL,
    label: 'Source repo',
    detail: 'github.com/sultanpeyek/chainbard',
    external: true,
  },
];

const ARCHITECTURE_NOTES: { term: string; body: ReactNode }[] = [
  {
    term: 'Payment gates the render',
    body: (
      <>
        A never-seen input renders only after a paid mint (
        <a
          href="https://github.com/sultanpeyek/chainbard/blob/main/docs/adr/0006-payment-gates-live-render.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber underline decoration-dotted underline-offset-2 transition-colors hover:text-bone"
        >
          ADR 0006
        </a>
        ). The 402 probe below is the gate every wallet must satisfy before /api/mint/story runs the
        AI pipeline.
      </>
    ),
  },
  {
    term: 'x402 over AceData',
    body: 'The buyer signs a partial USDC transfer in their own wallet; the server settles it through AceData’s own facilitator (/verify then /settle), then re-verifies the settled tx on-chain.',
  },
  {
    term: 'Free to view forever',
    body: 'Once minted, the story is a pure cache read at /[input] — no further spend. Provenance and paymentSig/memoSig receipts prove who paid.',
  },
  {
    term: 'Exclude the test-loop wallet',
    body: (
      <>
        Wallet{' '}
        <CopyAddress value={TEST_LOOP_WALLET} className="text-[13px] text-bone align-baseline" />{' '}
        drives the continuous mint/settle smoke test — its transactions are synthetic. Exclude it
        from the memo trail to read the actual judge-relevant volume.
      </>
    ),
  },
];

export default function JudgePage() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <SiteHeader active="judge" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
        {/* ── title ──────────────────────────────────────────────────────── */}
        <section className="cb-rise flex flex-col gap-5 py-12 sm:py-16">
          <span className="cb-eyebrow">Reviewer surface · open, no auth</span>
          <h1 className="cb-display text-5xl text-bone sm:text-6xl">
            Judge <span className="text-amber">mode</span>.
          </h1>
          <p className="max-w-2xl font-mono text-sm leading-relaxed text-bone-dim">
            Everything a reviewer can verify without a wallet: a live 402 payment-required
            handshake, the on-chain agent discovery surface, the autonomous curator history, and the
            SAP memo trail. No secrets — only on-chain-public and non-sensitive data.
          </p>
        </section>

        <div className="cb-rule my-4" />

        {/* ── live 402 probe ─────────────────────────────────────────────── */}
        <section className="cb-rise flex flex-col gap-6 py-16">
          <div className="flex flex-col gap-3">
            <span className="cb-eyebrow">Live proof · 01</span>
            <h2 className="cb-display text-3xl text-bone sm:text-4xl">
              The <span className="text-amber">402</span> handshake
            </h2>
            <p className="max-w-2xl font-mono text-sm leading-relaxed text-bone-dim">
              Hit the paid mint endpoint with no payment. It answers{' '}
              <span className="text-bone">402 Payment Required</span> and the raw{' '}
              <span className="text-bone">accepts[]</span> below — the exact USDC scheme, network,
              asset, payTo, and price a wallet must satisfy. Proven without paying.
            </p>
          </div>
          <div className="rounded-[5px] border border-ink-line bg-ink-raised/40 p-6 sm:p-8">
            <JudgeProbe />
          </div>
        </section>

        <div className="cb-rule my-4" />

        {/* ── proof links ────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-6 py-16">
          <div className="flex flex-col gap-3">
            <span className="cb-eyebrow">Live proof · 02</span>
            <h2 className="cb-display text-3xl text-bone sm:text-4xl">
              Inspect the <span className="text-amber">trail</span>
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-[4px] border border-ink-line bg-ink-line sm:grid-cols-2">
            {PROOF_LINKS.map((link) => {
              const inner = (
                <div
                  key={link.label}
                  className="group flex h-full flex-col gap-2 bg-ink p-6 transition-colors hover:bg-ink-raised/60"
                >
                  <span className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.14em] text-bone transition-colors group-hover:text-amber">
                    <span aria-hidden className="text-bone-faint group-hover:text-amber">
                      ✦
                    </span>
                    {link.label}
                    <span
                      aria-hidden
                      className="transition-transform duration-140 group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </span>
                  <span className="break-all font-mono text-[12px] leading-relaxed text-bone-faint">
                    {link.detail}
                  </span>
                </div>
              );
              return link.external ? (
                <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              ) : (
                <Link key={link.label} href={link.href}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>

        <div className="cb-rule my-4" />

        {/* ── architecture notes ─────────────────────────────────────────── */}
        <section className="flex flex-col gap-6 py-16">
          <div className="flex flex-col gap-3">
            <span className="cb-eyebrow">Architecture</span>
            <h2 className="cb-display text-3xl text-bone sm:text-4xl">
              Payment-gated <span className="text-amber">render</span>
            </h2>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-[4px] border border-ink-line bg-ink lg:grid-cols-3">
            {ARCHITECTURE_NOTES.map((note) => (
              <div key={note.term} className="flex flex-col gap-3 bg-ink p-6">
                <dt className="font-mono text-sm uppercase tracking-[0.14em] text-amber">
                  {note.term}
                </dt>
                <dd className="font-mono text-[13px] leading-relaxed text-bone-dim">{note.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
