# 0013 — Durable payment-intent idempotency for the reactive mint

Date: 2026-06-01

## Status

Accepted. Supersedes the per-process idempotency role of the three in-memory
stores in `POST /api/mint/story` (`dedupeMem`, `settledSigMem`, `mintStoreMem`).

## Context

The reactive mint (ADR 0006: payment gates the live render) settles a buyer's
x402 USDC payment through the AceData facilitator (ADR 0001), then runs the Ace
render pipeline and persists the story. Two distinct buyer actions share the
endpoint and look almost identical on the wire:

- **Resume** — finish a single already-paid mint that failed *after* settle
  (confirm / write / paint / save / memo) by replaying the *same* `X-Payment`,
  so the buyer is never charged twice.
- **Re-mint** — pay 0.30 USDC *again* to overwrite an input's story with a fresh
  render (latest-paid-wins; any buyer, identity is the **input** alone).

Today these are decided by three per-process in-memory maps. That is wrong for
serverless. On Vercel Fluid Compute the maps are shared only within one warm
instance: they vanish on cold start and differ across concurrent instances, so
the same request is non-deterministic depending on which box answers it. The two
observed failure modes:

1. **Re-mint charges nothing.** A re-mint that reuses the prior `X-Payment`
   envelope hits the facilitator's "nonce already processed", the old settlement
   sig is recovered, and no new charge occurs — the buyer thinks they re-minted
   but never paid.
2. **Re-mint is swallowed.** When the in-memory dedupe keyed on
   `(inputHash, buyer)` *does* survive on a warm instance, a genuine fresh
   payment for an already-rendered input is treated as a no-op.

The granularity is also mismatched: idempotency must be keyed on the *payment*,
but `(inputHash, buyer)` is keyed on the subject. To paper over lost in-memory
state, `recoverSettledSig()` does a non-deterministic newest-first on-chain ATA
scan on the hot path to re-derive the settlement sig — slow, racy, and dependent
on RPC ordering.

The clean signal already exists: the buyer's partial-signed transaction
(`envelope.payload.transaction`) carries the buyer's signature and is replayed
**byte-identical** on a Resume, but is freshly signed (and so different) on a
Re-mint. Its digest is therefore a stable, pre-settle, instance-independent
identity — the **payment intent** — that tells the two actions apart with no
chain scan and no warm-instance memory.

Alternatives considered:

- **(B) Lean on `wallet_stories.paymentSig` + the facilitator nonce only.**
  Rejected — keeps the non-deterministic on-chain scan to recover the sig, and
  `wallet_stories` is keyed at `(inputHash, paymentSig)` granularity, which
  cannot distinguish a Resume from a Re-mint *before* settle (the moment the
  decision must be made). The nonce stops a double-charge but gives no durable
  per-intent state machine.
- **(C) Durable full `MintContext` store.** Persist every orchestrator step so a
  cold-start mid-render resumes exactly where it stopped. Rejected — over-solves.
  The render is cheap and idempotent (latest-paid-wins overwrite), so durable
  step-resume buys almost nothing; the only thing that must be durable is "was
  this intent charged, and what sig." That is one row, not a context store.

## Decision

1. **Idempotency is keyed on the payment intent, end to end.**
   `intentId = sha256(txB64)` over the buyer's partial-signed transaction. Stable
   across replays of the *same* envelope, unique per fresh signature — exactly
   the Re-mint-vs-Resume discriminator, independent of input, buyer, or instance.

2. **A new durable `mint_runs` table** keyed on `intentId` holds the per-intent
   state machine: `settling → settled → published`. This table — together with
   the facilitator's on-chain nonce — is the durable source of truth for
   charge-once. It replaces the *correctness* role of `dedupeMem` and
   `settledSigMem`.

3. **Write-ahead before charging.** On entry, `getByIntentId(intentId)`:
   - **null** (fresh mint or re-mint): `insertSettling({intentId, inputHash,
     buyer})` *before* calling `/settle`. On any pre-settle failure (verify or
     settle) `deleteRun(intentId)` so a fresh retry starts clean (buyer
     uncharged). On success `markSettled(intentId, settledSig)`, run the flow,
     then `markPublished(intentId)` once both `paymentSig` **and** `memoSig`
     exist.
   - **`published`**: treat as Resume — reuse `row.settled_sig`, skip
     verify+settle, run the (idempotent) flow.
   - **`settled`**: settled but render unfinished (crash after settle) — reuse
     `row.settled_sig`, skip verify+settle, resume the render.
   - **`settling`**: the one ambiguous crash window (charged, sig not yet
     recorded). Run `recoverSettledSig()` **once**; if a confirmed sig is found,
     `markSettled` and resume; if not, the settle never landed — `deleteRun` and
     fall through to a fresh verify+settle (write-ahead again).

4. **The on-chain scan is demoted to a narrow fallback**, gated strictly on
   `state === 'settling'`. Normal replays (`settled` / `published`) never scan.

5. **"Fully published" is gated on both sigs.** A memo broadcast can fail *after*
   the story row is persisted, so `published` requires `paymentSig` **and**
   `memoSig`; a row stuck at `settled` is a legitimate Resume target.

6. **Re-mint is reachable from the share page.** A plain "Re-mint" CTA on the
   cache-*hit* `/[input]` page (latest-paid-wins; URL unchanged), so a cache hit
   is no longer a dead end.

`mintStoreMem` (the orchestrator step store) **stays in-memory** as a
best-effort, same-process step-skip optimisation only — durable correctness now
lives in `mint_runs` + the nonce.

## Consequences

**Positive.**
- Deterministic across cold starts and multi-instance Fluid Compute: the
  Re-mint-vs-Resume decision is a single durable read, not warm-instance memory.
- Charge-once is enforced durably (write-ahead `mint_runs` row + facilitator
  nonce), closing both the "re-mint charges nothing" and "re-mint swallowed" bugs.
- The non-deterministic on-chain ATA scan leaves the hot path; it runs only in
  the narrow `settling` crash window.
- Re-mint (latest-paid-wins) is a first-class, reachable action from the share
  page.

**Negative.**
- **+1 DB write** on settle (`insertSettling` then `markSettled`/`markPublished`)
  and **+1 read** on entry (`getByIntentId`). Cheap relative to settle + render.
- A **mid-render cold-start crash re-renders** from the top: wasted Ace compute,
  but the buyer is **never recharged** (the settled sig is reused) and the
  overwrite is idempotent (latest-paid-wins). Accepted.
- `mintStoreMem` drift is now explicitly tolerated — it is an optimisation, not a
  correctness store. A cold start simply re-runs idempotent steps.

## Related

- ADR `0001-payment-plane-acedata-facilitator.md` — the x402 payment plane and
  the facilitator nonce this ADR leans on for charge-once.
- ADR `0006-payment-gates-live-render.md` — payment gates the render; this ADR
  makes that paid action durably idempotent across replays and re-mints.
- ADR `0004-cost-guard-in-memory-v1.md` — the same Fluid Compute cold-start /
  multi-instance hazard this ADR removes from the idempotency path.
- CONTEXT.md — `Payment intent`, `Re-mint`, `Resume`, `Pre-payment vs
  post-payment failure`, `Mint widget`, `Mint console`.
