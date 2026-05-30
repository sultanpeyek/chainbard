# 0016 — Always-on pipeline, Cat-2-only (drop escrow), x402 buy-side everywhere, redacted public surfaces

Status: Accepted

Date: 2026-06-05

Supersedes / amends: ADR 0015 (removes its env-gates and the bearer fallback),
ADR 0004 (cost-guard now always-on with a hardcoded cap, not opt-in),
ADR 0001 + ADR 0006 + ADR 0009 (the reactive flow gains the rich media pipeline).

## Context

ADR 0015 shipped the rich autonomous pipeline (x402 buy-side, multi-SERP, video,
audio, dormancy, durable QStash trigger) but made **every** new behaviour
`default-OFF` behind six boolean env toggles — `X402_CRON_ENABLED`,
`VIDEO_ENABLED`, `AUDIO_ENABLED`, `COST_GUARD_ENABLED`, `WEB_EXTRACT_ENABLED`,
`DEMO_SKIP_SENTINEL` — and kept the credit-paid **Bearer-token** client as the
fallback path. The operator was expected to fund a wallet, run a Phase-0 probe,
and flip flags per service.

In practice that left the project carrying two of everything (a bearer path and
an x402 path, an off-branch and an on-branch for each media leg) plus a wall of
toggles the operator does not want to maintain. Three forces drive this ADR:

1. **The toggles are dead weight.** The agent keypair (`AGENT_SECRET_KEY_BASE58`)
   is already a *required* app secret (ADR 0007), so the x402 client is always
   constructible. The "off" branches (bearer client, `video=undefined`,
   `audio=undefined`, no-op sentinel) exist only to be never taken. The operator
   wants the rich pipeline to be the **only** pipeline.

2. **Only AceData x402 volume (Cat 2) matters; the escrow floor (Cat 1) does
   not.** The Sentinel `das_getAsset` / `sap-x402` escrow-deposit (~0.01 SOL) was
   the project's lone Cat-1 contribution, and it is **already a no-op in the
   running code** (`createNoopSentinel` is always used; the real escrow adapter
   was never wired). The operator is aiming the submission at Cat 2 only and does
   not want any SOL escrow path.

3. **The agent's spend reasoning leaks.** The autonomous tick persists and renders
   its decision rationale, per-tick ACE receipts with implied cost, full error
   text, and — worst — the literal treasury balance vs floor
   (`agent_state.reason = "treasury below floor: 12.34 < 50.00 USDC"`) and a public
   `/activity` note that spells out the budget-recovery mechanism. That is the
   agent's private operating posture exposed on a public page.

One hard platform constraint shapes the payment design: the AceData x402 client
(`@acedatacloud/x402-client`, `createX402PaymentHandler`) exposes **only a
wallet-as-fee-payer (self-broadcast) mode** for the *buy-side* (verified against
`node_modules/@acedatacloud/x402-client/dist/sdkAdapter.d.ts` — no `feePayer` /
`broadcastMode` / `facilitatorUrl` option). The reactive facilitator-as-fee-payer
shape is structurally **buyer-only** (it co-signs a *buyer's* partial-signed tx).
So an agent paying for its own calls must self-broadcast and therefore needs a
*dust* amount of SOL for tx fees (~0.000005 SOL/call). This is unavoidable and is
**not** the escrow — it is ordinary network fee.

## Decision

### A. The rich pipeline is always-on; delete the toggles and the bearer path

Remove all six boolean toggles and the `envFlag` reads behind them. The buy-side
rail is **x402 only** — the bearer/`apiToken` client and every "off" branch are
deleted. The agent keypair is always present (ADR 0007), so the x402 client is
always built. Genuinely-external config stays as env (`QSTASH_*`, `WORKFLOW_URL`,
`BLOB_READ_WRITE_TOKEN`, `AGENT_SECRET_KEY_BASE58`, the `VIDEO_*`/`AUDIO_*`/
`IMAGE_*`/`ACE_CHAT_MODEL*` provider+model strings, `MEDIA_COLLECT_TIMEOUT_MS`).
`WEB_EXTRACT_ENABLED` was an unused stub → removed outright.

If the wallet is unfunded, the rail itself fails the call and the existing
funds-exhaustion → dormancy path handles it (D below). "Force-on, require
funding": there is no degraded credit fallback.

### B. x402 buy-side **everywhere** (Cat-2 maximised)

Both the autonomous tick **and** the reactive mint settle their buy-side AceData
spend (chat, multi-SERP, image, video, audio) through the agent's x402
self-broadcast client. All of it is AceData x402 (Cat-2) volume. The reactive
**sell-side** is unchanged (buyer pays 0.30 USDC via the facilitator). The 0.30
no longer necessarily covers a media-rich render — the agent subsidises the
difference on purpose, because more buy-side spend *is* the Cat-2 metric.

### C. Drop the Cat-1 escrow / Sentinel path entirely

Delete the Sentinel `das_getAsset` / `sap-x402` escrow scaffolding: the
`sentinel` step in `runCuratorTick`, `createSentinelAdapter`, the
`sentinel-pinger` escrow code, the `sentinelCallSig` field on `TickLog` /
`CuratorResult`, its `tick_log.sentinel_call_sig` column (drop-column migration),
and its `/activity` proof link. The agent still self-broadcasts its x402 USDC
payments (dust SOL fee) and the trimmed SAP memo (E); no escrow deposit is ever
made.

### D. Rich media on **every kind** and on the reactive flow; reactive media via a durable QStash job

Multi-SERP + video + audio now run for **all kinds** (`wallet`/`tx`/`nft`/
`token`), not just the autonomous token path. For a **wallet** with no Director
brief the renderer falls back to the pubkey itself as the single SERP facet (the
only web-searchable handle a wallet has), so the search leg still settles + emits
a receipt instead of being silently dropped from the ACE receipt (E) — wallet
SERP fires whenever a serp client is wired (reactive mint + curator render), and
is skipped only on pure-core renders / unit tests. The reactive mint stays
synchronous for the story itself (chat + multi-SERP + image inline, published
immediately) and then **enqueues a durable QStash media-attach job** that
generates + collects video/audio out-of-band and patches
`story.videoUrl`/`story.audioUrl`; the share page late-hydrates them. Media stays
pure enrichment / fail-soft on both flows — a media failure never fails the
render. Dormancy is kept (silent no-op when funds run out) but its reason is
redacted (F); the numeric `MIN_TREASURY_USDC` pre-flight is removed (it leaked
balance/floor and duplicated the runtime `isFundsExhausted` detection).

### E. The ACE receipt is accurate on every path, standardised, and never public

"ACE receipt" = **service provenance only** — which services ran, their
providers, task ids, and on-chain sigs — **no dollar figures**. It is fixed to be
complete on every path (today the media legs are missing on the reactive and
non-token paths). It appears only in non-public / proof surfaces: the trimmed
on-chain SAP memo, the `ace:debug` CLI, and `/judge`. The SAP Memo v2 write is
**kept but trimmed** to a standard, non-sensitive form (render id + kind + the
public identifier + the service-provenance receipt); the brief-hash and the
source-hit headline are dropped from it.

### F. Redact all spend/treasury internals from public surfaces

Public surfaces (`/activity` feed and the share page `/[input]`) show only the
finished story, a neutral status, and the link. Removed from public view:
`pickRationale`, the ACE receipt breakdown, full error text, the source-hit
headline, and any curator brief. The `/activity` dormancy note becomes a neutral
"Curator is currently offline." (no budget/floor/recovery wording). The cron /
workflow route returns a minimal `{ tickLogId, storyUrl }` (or `{ dormant:true }`),
never the full `CuratorResult`. Everywhere the spend posture is *persisted or
logged*, it is redacted: `agent_state.reason` stores an opaque code (e.g.
`"dormant"`), never balance/floor numbers; cost-guard log lines carry no dollar
amounts. **Judge mode** (`/judge`) keeps the on-chain-public proof links (memo /
settlement sigs — already public on Solscan) and the service provenance — its
whole purpose is letting a reviewer verify real Cat-2 settlement — but drops
model names, costs, budget, and rationale.

### G. Cost-guard is a hardcoded runaway breaker, not a toggle

The in-memory daily cap stays *always-on* with a **hardcoded** daily ceiling as a
cheap circuit-breaker against a runaway loop (the wallet balance remains the real
ceiling, per ADR 0015). It is no longer env-toggled and its breach log carries no
dollar amount on any public path.

### H. One verbose debug CLI for the whole ACE flow

A single `bun run ace:debug <input>` (dual-mode: simulate by default, `--live`
for real x402 spend) walks every stage — detect → spotlights → director →
multi-SERP → render → image → video → audio → persist → memo — and prints, per
stage: the **provider + model** in use, the **output/link**, and on failure the
**error + root cause**. In `--live` it also taps the agent x402 wallet adapter to
print, per paid stage and as a final tally, the **on-chain USDC settlement tx**
(Solscan link) for every successful paid call — so the operator can see exactly
which calls moved USDC and where (a failed/reverted transfer is not in the tally;
its sig surfaces in that stage's error line). It is local/operator-only, so
verbose cost estimates, the full provenance receipt, and settlement sigs are
allowed here (never shipped to a public surface — the memo carries only its own
sig + service provenance, E).

## Consequences

**Positive.**
- One pipeline, no toggles, no bearer path — far less code and no "did I flip the
  right flag?" operator surface.
- Maximum Cat-2 (AceData x402) volume: every buy-side call on both flows settles
  USDC on-chain; reactive renders now contribute buy-side volume too.
- The x402 USDC settlement (agent → AceData) is routed through Synapse RPC
  (`resolveSettleRpcUrl`: `SYNAPSE_RPC_URL → SOLANA_RPC_URL`), satisfying Cat-2's
  "x402 ... with Synapse RPC in execution". This is deliberately separated from
  the SAP memo broadcast, which is an audit write and stays on the generic send
  RPC (`resolveSendRpcUrl`: `SOLANA_SEND_RPC_URL → SOLANA_RPC_URL`) — a send
  override can't divert settlements off Synapse. (Requires `SYNAPSE_RPC_URL` to be
  set; unset falls back to the read RPC and the compliance benefit is lost.)
- RPC URLs are never logged — they embed provider API keys. Every operator log
  prints `rpcHost()` (host only, no scheme/path/query) instead.
- No Cat-1 / SOL escrow path to fund or reason about.
- The agent's spend posture (rationale, costs, treasury balance, recovery floor)
  is no longer leaked on any public surface, while reviewers retain on-chain proof
  of real settlement via `/judge`.
- A single, honest end-to-end debug command with per-stage provider/model and
  precise error causes.

**Negative.**
- "Require funding" is now load-bearing: an unfunded wallet means the reactive
  mint and the tick both fail into dormancy with no credit fallback. Acceptable —
  the operator runs this deliberately (prod FE is operator/localhost-driven).
- The reactive flow subsidises media spend beyond the 0.30 sell-side price.
  Intended (volume > margin for this submission), but the old "self-funding loop"
  framing no longer holds for media-rich renders.
- A dropped DB column (`tick_log.sentinel_call_sig`) is a one-way migration;
  historical rows lose the field from the schema (data preserved until dropped).
- Reactive media is eventually-consistent: the share page hydrates video/audio
  after the QStash job lands, so a freshly minted page briefly has no media.
- Less public transparency than CONTEXT.md originally promised for `/activity`;
  this ADR deliberately reframes that surface as a neutral story feed.

## Alternatives rejected

- **Keep the toggles + bearer fallback (ADR 0015 as-is).** The operator
  explicitly does not want to maintain on/off envs, and the off-branches are never
  taken given the always-present agent key. Carrying two payment paths is pure
  cost.
- **Route the agent's buy-side through the facilitator so it needs zero SOL.** Not
  supported by `@acedatacloud/x402-client` (no facilitator-as-fee-payer for
  agent-initiated calls); would require spoofing a buyer signature or a new SDK
  mode. The dust tx fee is negligible and unavoidable.
- **Keep the Cat-1 Sentinel escrow path.** Already a no-op; aiming Cat-2-only, it
  is dead weight and the only SOL escrow the operator wants gone.
- **Block the reactive mint until video/audio finish (~120s).** Punishes the
  buyer for an enrichment; the durable QStash attach keeps the mint fast and the
  media eventually-consistent.
- **Keep public rationale/receipts/errors for transparency.** The operator's call
  is opacity on spend; the on-chain proof in `/judge` covers the reviewer's
  verification need without exposing operating posture.

## Related

- ADR `0015-x402-cron-conversion.md` — introduced this pipeline behind env-gates;
  this ADR removes the gates, deletes the bearer fallback, drops the escrow path,
  and extends the media pipeline to all kinds + the reactive flow.
- ADR `0001-payment-plane-acedata-facilitator.md` — reactive sell-side facilitator
  (unchanged); this ADR adds the reactive buy-side x402 spend.
- ADR `0004-cost-guard-in-memory-v1.md` — cost-guard, here made always-on with a
  hardcoded cap (was opt-in in ADR 0015).
- ADR `0006-payment-gates-live-render.md` + `0009-streaming-verbose-mint-console.md`
  — the reactive mint these extend with a post-publish durable media-attach job.
- ADR `0013-durable-payment-intent-idempotency.md` — the durable-job pattern the
  reactive media-attach reuses (and the per-paid-call hazard ADR 0015 noted).
- CONTEXT.md — `Payment model`, `x402-cron`, `Daily curator tick`, `Dormant
  state`, `Reactive flow`, `Video service`, `Audio service`, `Activity log`,
  `Judge mode`, `Sentinel`, `No self-dealing`, `ACE receipt`, `ace:debug`.
