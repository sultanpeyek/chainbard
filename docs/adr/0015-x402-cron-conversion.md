# 0015 — Autonomous tick on the x402 buy-side rail: self-broadcast USDC settlement, six services, wallet-balance ceiling

Status: Accepted

Date: 2026-06-04

## Context

The autonomous **daily curator tick** (ADR 0003, CONTEXT "Daily curator tick")
has always paid AceData on the **credit-paid Bearer-token** client:
`new AceDataCloud({ apiToken: env.ACE_API_KEY })`. That spend lands on an AceData
account topped up off-chain — it is real consumption but it is **not AceData x402
volume**. The reactive sell-side already routes through the AceData x402
facilitator (ADR 0001), so the buy-side x402 story for Category 2 ("Ace Data
Cloud Usage") was carried entirely by the reactive path; the autonomous loop —
the part that runs with no human in the loop — paid off a credit balance.

Three things made the credit path the limiting factor:

1. **No on-wire x402 on the autonomous side.** Bearer billing is a private ledger
   on AceData's side. The autonomous tick — the cleanest "agent pays for its own
   inputs" narrative — never settled USDC on-chain for its inputs.
2. **A thin service footprint.** The tick exercised three Cat-2 services: chat
   (Director + write step), a single SERP query pair, and one image. AceData also
   exposes `ace.video.generate`, `ace.audio.generate`, and multi-query
   `ace.search.google` — async media surfaces that the credit tick never touched.
3. **A fictional spend ceiling.** The only spend guard was the in-memory
   `$2/day` `CostGuard` (ADR 0004), which resets every cron invocation and drifts
   across Fluid Compute instances. It was a soft proxy for "don't run away with
   spend" that never bound the autonomous single-shot tick in practice.

The AceData x402 client (`@acedatacloud/x402-client`,
`createX402PaymentHandler({ network:"solana", solanaWallet })`) settles each paid
leg differently from the reactive sell-side. It builds an SPL `TransferChecked`
tx, sets `feePayer` = the supplied wallet + a recent blockhash (+ an optional
compute-unit ix), then calls `wallet.signAndSendTransaction(tx)`. **The wallet —
the agent — broadcasts and is the fee-payer.** That is the inverse of the
reactive buyer envelope (ADR 0001), where the buyer signs as token authority and
the *facilitator* co-signs as fee-payer and broadcasts server-side. On the
autonomous rail there is no facilitator co-signer: the agent funds its own fees.

## Decision

**Convert the autonomous tick's buy-side from credit/Bearer to x402 USDC
settlement, env-gated and default-OFF.** When `X402_CRON_ENABLED` is on, the
tick's AceData client is built with `createX402PaymentHandler` wrapping a wallet
adapter over the **agent keypair**; when off (default), it stays on the existing
`apiToken` client. The operator opts in only after a **Phase-0 probe** confirms
each service settles end-to-end (`scripts/spikes/x402-probe.ts`).

1. **Self-broadcast model — the agent is fee-payer, so it needs SOL.**
   `buildAgentSolanaWalletAdapter(agent, sendConnection)` is a structural
   `SolanaWalletAdapter`. Its `signAndSendTransaction` **mirrors the SAP memo
   sender** (`createMemoSender` + `estimatePriorityFee` in
   `src/modules/sap-memo-writer.ts`): the x402 client has already set
   feePayer/blockhash, so the adapter only `agent.sign(tx)`s, broadcasts via
   `sendRawTransaction({ skipPreflight:true, maxRetries:3 })` on the send RPC,
   and confirms via a ~20s `getSignatureStatus` loop. It does **not** re-set
   blockhash/feePayer. The agent treasury therefore needs **both USDC** (the
   spend) **and SOL** (the broadcast fee) — distinct from the reactive buyer,
   who needs no SOL because the facilitator pays the fee.

2. **Three → six+ services.** With the rail live, the tick fans out across:
   **chat** (Director decide + the write step, the write step on a heavy model
   `ACE_CHAT_MODEL_HEAVY`), **multi-SERP** (up to five deterministic queries —
   events / origin / price-analysis / sentiment / listing — replacing the old
   two-query block; events query stays first, one SERP receipt per query),
   **image** (the ADR 0014 infographic chain), **video** (abstract data-motion,
   `VIDEO_PROVIDER`=veo → `VIDEO_FALLBACK_PROVIDER`=kling), and **audio**
   (spoken-word narration, `AUDIO_PROVIDER`=fish). Video/audio fire async
   (`wait:false` → `TaskHandle`), are collected by a bounded
   `MEDIA_COLLECT_TIMEOUT_MS` poll of `ace.tasks.get`, mirrored into Vercel Blob
   (`storeRemoteAsset`, fail-soft to the Ace URL when `BLOB_READ_WRITE_TOKEN` is
   unset), and stored as `story.videoUrl`/`story.audioUrl`. Both are **pure
   enrichment**: a media failure returns `null` and never fails the tick. Each
   emits a `video`/`audio` **receipt**. Media only burns when its own flag **and**
   `X402_CRON_ENABLED` are on (no point firing a paid leg with no rail under it).

3. **Drain-to-zero wallet ceiling — cost guard now opt-in.** Under the x402 rail
   the **agent wallet USDC balance is the authoritative spend cap**: every paid
   leg debits the wallet directly, so the rail itself fails the call when funds
   run out. The in-memory `$2/day` `CostGuard` (ADR 0004) is therefore demoted to
   **opt-in** via `COST_GUARD_ENABLED` (default off); the `CostGuard` class still
   defaults `enabled=true` so existing unit tests keep guarding, but the shared
   `defaultCostGuard` singleton is constructed with
   `envFlag(env.COST_GUARD_ENABLED)`. The arbitrary `$2` figure was a soft proxy
   the wallet balance now enforces for real, down to zero.

4. **Silent dormant on funds exhaustion.** When the wallet is drained, the tick
   goes **dormant** rather than erroring loudly every cadence. `isFundsExhausted`
   (`src/treasury.ts`) walks the error + `cause` chain for the funds signatures
   (insufficient USDC/SOL/lamports/balance, SPL custom error `0x1`,
   debit-with-no-prior-credit, `InsufficientFundsForRent`). On a match, the tick
   `setDormant(reason)` on the durable `agent_state` row
   (`createSqlAgentStateRepo`) and returns `{ ok:false, step:"dormant" }`
   **without booking a `tick_log` row and without posting the operator webhook**.
   A `dormant` gate at the top of `runCuratorTick` short-circuits subsequent
   ticks the same way; an optional pre-flight `MIN_TREASURY_USDC` balance check
   (`readUsdcBalanceUi`) sets dormant *before* spending when the balance is below
   the floor. The cron route answers `200 { dormant:true }` (not a `500`) on this
   path. A funded operator clears the flag (`clearDormant`). This is distinct
   from a normal tick error, which still books a `tick_log` row + returns `500`.

5. **Durable Upstash Workflow + QStash hourly trigger.** The tick is fired by a
   QStash schedule (`scripts/setup-qstash-schedule.ts`, cadence
   `CRON_CADENCE_CRON`, default `0 * * * *`) hitting a durable
   `@upstash/workflow` route (`/api/workflow/autonomous-tick`, `serve(...)` with
   a defensive `failureFunction` that sets dormant). The workflow runs a
   `dormant-check` step, returns early if dormant, then runs the tick. The
   simpler `CRON_SECRET`-gated `GET /api/cron/autonomous-tick` route remains a
   valid target for operators who prefer it.

6. **Everything env-gated, default-OFF, operator-opt-in.** `X402_CRON_ENABLED`,
   `VIDEO_ENABLED`, `AUDIO_ENABLED`, `COST_GUARD_ENABLED`, `WEB_EXTRACT_ENABLED`,
   and `BLOB_READ_WRITE_TOKEN` are all off/unset by default. The default tick is
   byte-for-byte the prior credit-paid, three-service behaviour. The operator
   funds the agent wallet (USDC + SOL), runs the Phase-0 probe to confirm each
   service settles, then flips the flags.

## Consequences

**Positive.**
- Autonomous buy-side now generates **AceData x402 volume** on-chain (six+
  services), not a private credit ledger — the cleanest Cat-2 narrative ("the
  agent pays for its own inputs in USDC, no human, no credit balance").
- The real spend ceiling is the wallet balance, enforced down to zero by the rail
  itself — no fictional in-memory cap, no Fluid Compute drift.
- Funds exhaustion is graceful: silent dormancy, no `tick_log` noise, no webhook
  spam, recoverable by funding + `clearDormant`.
- The default-OFF gating means none of this changes behaviour until the operator
  has funded the wallet and verified each service on the probe.

**Negative.**
- The agent now needs **SOL** as well as USDC (it is the fee-payer/broadcaster),
  unlike the reactive buyer. Underfunding SOL — even with USDC present — drives
  the same dormancy path. Documented; the probe surfaces it early.
- The shared `defaultCostGuard` singleton fronts **both** the autonomous and
  reactive paths, so disabling `COST_GUARD_ENABLED` lifts the reactive daily soft
  cap too. Intended (the wallet balance is now the true ceiling), but called out:
  re-enable to restore the soft cap on both paths at once.
- Media legs add latency and spend. Bounded: `wait:false` keeps the tick short
  (collect is a poll), and a media failure never fails the tick.

## Follow-up — single durable step + per-paid-call idempotency

The v1 workflow runs the tick as **one durable step** (after the `dormant-check`
step). Because video/audio fire `wait:false`, the tick body is short, so a
mid-tick crash re-runs the whole tick rather than resuming mid-render. The cost
is bounded but real: a crash *after* one paid leg settles but *before* the tick
completes re-fires that paid leg on the retry — **the agent can be charged twice
for the same input on a resume**, analogous to the reactive Re-mint-vs-Resume
hazard (ADR 0013) but on the buy-side.

The durable fix is **per-paid-call step granularity**: wrap each paid leg
(each chat/SERP/image/video/audio fire) in its own `context.run` step keyed on a
stable per-call intent so a resume replays the recorded result instead of
re-paying. This mirrors ADR 0013's payment-intent idempotency, applied to the
agent's own outbound calls. Deferred: the v1 single-step tick keeps the change
surface small, and the wasted-spend window is narrow given the short
`wait:false` body.

## Alternatives rejected

- **Keep credit/Bearer billing on the autonomous side.** Real consumption but
  not on-wire x402 volume — defeats the conversion's whole point for Cat-2.
- **Route the autonomous buy-side through the reactive facilitator co-signer
  shape.** There is no third-party fee-payer for the agent's own outbound calls;
  the x402 client's self-broadcast model is the only shape on offer, and it is
  the correct one (the agent *is* the payer). Mirroring the SAP memo sender's
  broadcast/confirm path keeps one battle-tested send pattern.
- **Keep the `$2/day` in-memory cap as the spend ceiling.** It resets every cron
  invocation and drifts across instances (ADR 0004). The wallet balance is a real,
  durable, on-chain ceiling; the in-memory cap is now opt-in, not load-bearing.
- **Error loudly (`500` + `tick_log` row) on funds exhaustion.** Every cadence
  would book an error row and ping the operator webhook — noise, not signal.
  Silent dormancy records the state once on the `agent_state` row and stops.
- **Full per-step durable resume in v1.** Over-solves for the short `wait:false`
  tick body; tracked as the follow-up above rather than blocking the conversion.

## Related

- ADR `0001-payment-plane-acedata-facilitator.md` — the reactive sell-side x402
  facilitator (buyer = token authority, facilitator = fee-payer / broadcaster).
  This ADR adds the *buy-side* autonomous rail, where the **agent** is the
  fee-payer / broadcaster.
- ADR `0002-content-policy.md` — bounds the now-active video (abstract
  data-motion only) and audio (spoken-word only) paths (amended for this ADR).
- ADR `0003-virality-first-autonomous-deprio.md` — the autonomous tick this ADR
  rewires; reactive stays primary.
- ADR `0004-cost-guard-in-memory-v1.md` — the in-memory cap this ADR demotes to
  opt-in (amended for this ADR); the wallet balance is the new real ceiling.
- ADR `0012-synapse-primary-x402-paid-legs.md` — Synapse-primary on the reactive
  paid-leg *read* verification; this ADR's self-broadcast leg stays on a reliable
  send RPC (Synapse off the broadcast leg, per `synapse.md` gotcha #1).
- ADR `0013-durable-payment-intent-idempotency.md` — the reactive Re-mint /
  Resume idempotency this ADR's per-paid-call follow-up mirrors on the buy-side.
- ADR `0014-token-two-tier-truth-and-infographic.md` — the token render path
  (infographic hero, two-tier truth) that the media legs and multi-SERP extend.
- CONTEXT.md — `x402-cron`, `Dormant state`, `Daily → Hourly curator tick`,
  `Video service`, `Audio service`.
