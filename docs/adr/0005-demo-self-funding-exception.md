# 0005 — Demo data is tagged and excluded from real metrics

Date: 2026-05-29

## Status

Accepted.

## Context

The `--demo` mode provides a CLI showcase of the reactive-mint and cron flows, running the
full loop — including the funding leg — without requiring the operator to manually transfer
SOL/USDC into a buyer wallet before each run. To automate the funding step, the demo uses a
dedicated keypair funded from the agent treasury.

Without explicit data isolation, demo-generated mints would appear in the public gallery feed
and be counted alongside real-volume data. The mechanism below ensures demo data stays
separated at the database and API layers.

## Decision

The demo loop uses a dedicated buyer keypair and tags all output with `provenance='demo'`,
enforced through a gated header. Demo data is excluded from the public gallery and from
real-volume accounting as a data-integrity measure:

- The demo buyer uses a distinct keypair (`keys/demo-buyer.json`), never the real-buyer key.
- Demo mints persist with `provenance='demo'` (a value added to the
  `wallet_stories_provenance_check` constraint), excluded from the public gallery feed and
  from real-volume accounting.
- The demo signal reaches the mint route only via a gated `x-demo-key` header matching env
  `DEMO_SECRET`; without it the route behaves exactly as the production buyer path.
- Default mode is **simulate** (no on-chain writes, no spend); real mainnet writes require an
  explicit `--send`.
- Demo cron ticks force the no-op Sentinel via `DEMO_SKIP_SENTINEL` so demo runs never spend
  the escrow deposit.

## Why

- **Operator ergonomics.** Requiring manual Phantom funding before every demo run makes the
  showcase fragile and slow. A gated, labelled path provides a one-command demo while keeping
  demo data clearly separated from real data.
- **Isolation preserves data integrity.** Because demo mints carry `provenance='demo'` and are
  excluded from accounting, the demo round-trip is invisible to any real-volume metric. The tag
  is enforced at the DB constraint level, not just in application logic.
- **Shows the real agent.** Using a throwaway demo *agent* identity would avoid demo writes on
  the scored wallet, but the demo would then show a different agent. Tagging at the data layer
  preserves the real agent in the demo while keeping metrics clean.

## Consequences

- The `wallet_stories` provenance constraint and the `Provenance` type / page unions must
  include `'demo'`; the public gallery query must exclude it.
- The mint route gains a gated `x-demo-key` branch (provenance override + `--placeholder`
  image skip). This is new attack surface, but it only ever **downgrades the caller's own
  render** — no cross-user effect — and the destructive-looking bits (provenance tag) require
  the secret.
- Demo runs with `--send` produce on-chain transactions on the agent wallet; keep these
  infrequent and prefer `--target local` for rehearsals.

## How to apply

- Never reuse `keys/demo-buyer.json` for real-buyer testing, and never set `provenance='demo'`
  from any path other than the gated demo header.
- Production cron and real reactive buyers must never carry `DEMO_SECRET`; treat it like any
  other server secret.
- When the real Sentinel escrow adapter lands (today it is `createNoopSentinel`), the demo path
  forces the no-op via `DEMO_SKIP_SENTINEL` so demo cron ticks never spend the 0.01 SOL
  deposit. Real daily cron keeps the deposit enabled.
