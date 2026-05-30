# 0006 — Payment gates the live render

Date: 2026-05-30

## Status

Accepted.

## Context

`/[input]` currently renders **any** never-seen Solana input live and for free:
on a DB cache miss it runs the full AI/spotlight pipeline (Ace chat + image),
persists the result with `provenance='seed'`, and serves it — no payment check.
The `/render` form routes straight into this free path. Payment is enforced
**only** in `POST /api/mint/story`, where the sole observable difference between
a paid mint and a free view is the `provenance='buyer'` tag plus the
`memoSig`/`paymentSig` receipt signatures.

Consequence: a buyer who pays 0.30 USDC gets a provenance badge for a story
anyone could have rendered for free by visiting `/<input>`. With the new
homepage goal — **real end-user mint volume via the frontend** (Wallet
Standard connect → x402 USDC payment) — that mint button is theater. There is
no reason for a stranger to pay.

ADR 0003 already designates the reactive paid render as the primary volume
engine. For that to be true, the paid action must *be* the render, not a label
on a render the visitor could get free.

Alternatives considered:

- **Keep free render; mint = permanence/badge upgrade.** Rejected — nobody pays
  0.30 USDC for a provenance tag on otherwise-identical output.
- **Freemium: free text teaser, pay unlocks image.** Rejected — multiplies
  render paths (two renderers, partial-render state) and muddies the model right
  before the deadline.

## Decision

1. **Payment gates the live AI render.** `/[input]` serves only stories already
   in the store (cache hit — any provenance). A cache miss for a never-rendered
   input no longer renders on demand; it shows a **paywall CTA**.
2. **The paid mint *is* the render.** `POST /api/mint/story` remains the only
   path that runs the Ace render pipeline for buyer input, persists
   `provenance='buyer'`, and attaches receipts. After a successful mint the
   client redirects to `/[input]`, which now cache-hits and renders free
   forever.
3. **Free Preview before payment.** Before paying, the hero shows a free
   **Preview** — detected `kind` + cheap on-chain facts (balance / tx count /
   asset name) from **free RPC only, no Ace spend** — plus a tone picker and the
   "Mint · 0.30 USDC" CTA. De-risks the blind purchase without giving the AI
   render away.
4. **Free-view surfaces unchanged.** Already-minted stories (`buyer`,
   `curator`, `seed`, `demo`) stay free to view at `/[input]`. The autonomous
   daily curator tick and operator-seeded **Featured** stories render through
   their own pipelines (agent treasury / one-time seed script), not the
   on-demand `/[input]` path, so they keep producing free-to-view cache entries.
5. **`/render` retired as a free-render entry.** It redirects to `/`; the
   homepage hero **Mint widget** is the single mint entry.

## Consequences

**Positive.**
- "Actual user volume" becomes meaningful: paying is the only way to render a
  new input, so each paid mint is genuine x402 sell-side volume (ADR 0001/0003).
- Submission story sharpens: "paste → free preview → pay 0.30 USDC → your story
  renders," with on-chain receipts proving the payment.
- No new render paths; the existing mint pipeline is the paid action. Free view
  is a pure cache read.

**Negative.**
- **Removes a free capability** that exists today — anyone could previously
  render any input gratis. Direct `/<new-input>` links now hit a paywall instead
  of rendering. Acceptable: that free path was the bug this ADR closes.
- **`Recent` can look sparse** on a fresh mainnet deploy until real strangers
  mint. Mitigation: operator-seeded **Featured** strip is always populated;
  `Recent` falls back to a "be the first" empty state.
- Buyers must hold mainnet USDC and a Wallet-Standard wallet — real friction,
  accepted (no subsidy; see homepage grill 2026-05-30).

## Related

- ADR `0001-payment-plane-acedata-facilitator.md` — the x402 payment plane.
- ADR `0003-virality-first-autonomous-deprio.md` — reactive render as primary
  volume engine; this ADR makes that literally true.
- ADR `0005-demo-self-funding-exception.md` — `provenance='demo'` excluded from
  `Recent` and real-volume accounting.
- CONTEXT.md — `Reactive flow`, `Mint widget`, `Preview`, `Featured`, `Recent`,
  `Judge mode`.
