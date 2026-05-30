# 0009 — Streaming verbose Mint console (NDJSON from the settle POST)

Date: 2026-05-30

## Status

Accepted.

## Context

ADR 0006 made the paid mint *be* the render: `POST /api/mint/story` runs the
whole pipeline — verify the x402 envelope, settle through the facilitator,
confirm, pull on-chain facts, (for `tx`) search, write the story, paint the
image, save, write the SAP memo — under `maxDuration=300`. Until now that POST
was a black box: the buyer clicked **Mint** and stared at a spinner for tens of
seconds while nine real backend steps ran invisibly, then got one JSON blob.

That is bad for two audiences at once. The **buyer** can't tell a slow render
from a hung one, and a post-payment stall reads as "it ate my money." A
**hackathon judge** can't see that the steps are real — settle, confirm, memo
are genuine mainnet activity, but a spinner proves nothing. We want every real
step visible live: the **Mint console** (CONTEXT.md).

The question is the transport. Three shapes were considered:

- **(a) One JSON at the end.** What we have. Zero observability during the 10–60s
  the render takes; the judge sees a spinner and the buyer sees a stall.
- **(b) A separate poll-a-status endpoint.** Start the mint, then `GET
  /api/mint/status?id=…` on an interval. Requires a **shared, durable store**
  (`mintStore`, Redis-backed) so a second request can read progress written by
  the first — across serverless invocations there is no shared memory. Adds an
  endpoint, a store, an id-handoff handshake, and a polling cadence to tune.
- **(c) Stream the progress out of the settle POST itself.** The single existing
  request already runs every step in order under one `maxDuration=300`
  invocation; emit one line per step as it completes, on the *same* response the
  `X-Payment` POST already opened.

## Decision

**Adopt (c): the settle POST responds as an NDJSON stream.** A `POST
/api/mint/story` **with** an `X-Payment` header returns **HTTP 200**,
`Content-Type: application/x-ndjson`, body = newline-delimited JSON objects, one
per line, flushed as each step finishes. The pre-payment branch is untouched: a
POST **without** `X-Payment` still returns the `402 { x402Version, accepts[] }`
JSON. The event contract is canonical:

```
{ "t":"step", "id":<StepId>, "status":"active" }
{ "t":"step", "id":<StepId>, "status":"done", "sig"?:<base58> }   // sig only for settle, memo
{ "t":"done",  "shareUrl":string, "paymentSig":string, "memoSig":string }     // terminal success
{ "t":"error", "id":<StepId>, "kind":<MintErrorKind>, "reason":string, "paymentSig"?:string } // terminal failure
```

Server-emitted `StepId`, in order: `verify → settle → confirm → facts →
search`(only when `kind==="tx"`)` → write → paint → save → memo`. The client
synthesizes three more *before* the stream opens — `build`, `dry-run`, `sign` —
so the full UI order is `build, dry-run, sign, verify, settle, confirm, facts,
[search], write, paint, save, memo, done`.

Four non-obvious points this records:

1. **Why stream from the settle POST, not poll.** The chosen path needs **no
   shared or durable store** and **no extra endpoint** — the one POST that
   already does all the work is the one that reports it, and it works straight
   through the `X-Payment` request the buyer already has open. Poll (b) would
   force a Redis-backed `mintStore` purely to ferry progress between two HTTP
   calls. The transport is **RPC-agnostic**: it narrates whatever the pipeline
   does and is indifferent to which Solana node settle/confirm hit.

2. **Why HTTP 200 is committed before the body.** A streaming response writes its
   status line *first*; it **cannot change status mid-body**. So we commit `200`
   the moment the stream opens and report every failure as an **in-stream
   terminal `{t:"error"}` event** — never as a `402`/`503`/`500` status. The
   status code stops carrying success/failure meaning the instant the first byte
   ships; the `t:"error"` line is the source of truth.

3. **Why two retry affordances + a locally-derived `paymentSig`.** The client
   derives `paymentSig = base58(tx.signatures[0])` from the signed transaction
   **locally**, before sending. That makes the retry boundary explicit and settle
   **idempotent**: an `error` event carrying `paymentSig` means the buyer
   **already paid** → UI offers **Resume** (replay the *same* `X-Payment`
   envelope, no re-sign, no second charge). An `error` event **without**
   `paymentSig` means **uncharged** → UI offers **Try again** (fresh envelope).
   This is the **pre-payment vs post-payment failure** boundary (CONTEXT.md): it
   guarantees a post-payment transient never double-charges a buyer.

4. **Why a `simulateTransaction` dry-run before the wallet signature.** The
   client runs a `dry-run` step (a `simulateTransaction`) *before* asking the
   wallet to sign — this is solana-dev **W009** and it catches **insufficient
   USDC** (and any other build-time failure) **before the user approves**, so a
   doomed mint is rejected at a free simulation instead of after a signed,
   broadcast, fee-spending attempt.

## Consequences

**Positive.**
- The Mint console makes the render legible: buyer sees live progress, judge sees
  every real backend step (settle/confirm/memo are real mainnet sigs surfaced as
  they land). The spinner-as-theater problem from ADR 0006 is closed.
- No new endpoint, no durable/shared store, no polling cadence — the existing POST
  is the whole mechanism.
- Idempotent settle: `paymentSig` makes "already paid" unambiguous, so a
  post-payment transient is **Resume**, not a re-charge.
- `dry-run` moves insufficient-USDC (and build errors) to *before* the signature,
  saving the buyer a wasted approval.

**Negative.**
- **HTTP status no longer signals mint outcome.** A failed mint is still `200`;
  any client or proxy that infers success from the status code is wrong here.
  Callers MUST parse the terminal `t:"done"`/`t:"error"` line. This is a sharp
  edge documented as the contract.
- **Two response shapes for one route.** `/api/mint/story` returns `402` JSON
  without `X-Payment` and an NDJSON stream with it — a fork a future reader can
  trip over. The pre-payment 402 branch is explicitly off-limits.
- **Client/server `StepId` split.** `build`/`dry-run`/`sign` are client-only and
  never appear on the wire; the ordered union lives in two places
  (`use-mint.ts` + the route) and must stay in sync by hand.

## Related

- ADR `0006-payment-gates-live-render.md` — the paid mint *is* the render; this
  ADR narrates that render live.
- ADR `0001-payment-plane-acedata-facilitator.md` — the x402 payment plane whose
  settle/verify steps the stream reports.
- CONTEXT.md — `Mint console`, `Mint widget`, `Pre-payment vs post-payment
  failure`.
- `src/hooks/use-mint.ts` — `MintErrorKind` union, client-synthesized steps,
  Resume/Try-again branch.
