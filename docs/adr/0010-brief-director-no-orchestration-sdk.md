# 0010 — Buyer "Brief" steers a fixed pipeline via a Director step; no orchestration SDK

Status: Accepted
Date: 2026-05-30

## Context

We want a buyer to supply free-form text at mint time to steer their story, and we
want the result to be "decided by on-chain" data. The original framing asked "what
SDK should we use for orchestrating when to call which tools?" — implying a dynamic,
tool-calling agent.

Two facts from the existing code reframe the question:

1. **The render path is already a fixed, resumable pipeline.** `mint-orchestrator.ts`
   is a step state machine (verify → settle → confirm → facts → [search] → write →
   paint → save → memo); `story-renderer.ts` runs the creative seams. The pipeline
   *shape* does not need to change per input — only the *content* fed through it.
2. **We already built the exact primitive a planner needs.** `aceChatJson<T>()`
   (`src/lib/ace-chat-json.ts`) takes a zod schema, converts it to a strict JSON
   Schema, mirrors it into the system prompt (a workaround for proxies that drop
   `response_format`), validates with zod, and retries on a stronger model. It is
   already wired as `ChatClient.complete<T>` in the reactive route and the cron path.

So the real need is one **structured planner call**, not an agent that decides which
tools to run.

We considered three options:

- **(a) Director on the existing `aceChatJson` primitive** — one structured call
  emits a typed plan; the fixed pipeline consumes it. Zero new deps.
- **(b) Vercel AI SDK** (`ai` + `@ai-sdk/openai-compatible`, `generateObject`) —
  AceData's chat is OpenAI-wire-compatible, so this is technically pluggable.
- **(c) An agent framework** (Mastra / LangGraph) for true dynamic tool-calling.

## Decision

Adopt **(a)**. Add a single **Director** step that calls the existing
`aceChatJson` path with a `planSchema` and the `(spotlights + brief)` pair, emitting
a typed **Plan** `{ tone, serpQuery, imageStyle, emphasis }`. Feed the plan into the
unchanged pipeline: it replaces `resolveTone()` and the mechanical `serpQuery`, and
augments the image prompt. No new dependency; no agent framework.

Supporting decisions (resolved in the 2026-05-30 grill-with-docs session):

- **Grounding:** chain wins, brief steers. On-chain **spotlights** are immutable
  truth; the brief only bends voice/angle/emphasis. The bard never asserts a fact the
  chain contradicts.
- **Safety:** the **Director is the chokepoint.** The raw, untrusted brief reaches
  *only* the Director. Downstream steps (`search`/`write`/`paint`) consume the typed
  plan, never the raw brief — so an injection in the brief cannot reach the image
  model. The Director **always sanitizes and never hard-rejects**: worst case it
  drops the brief entirely and renders the plain spotlights story, so a brief can
  never strand a paid buyer (no new refund/retry branch).
- **Provenance:** Memo v2 gains a `briefHash` (sha256). The raw brief is stored in
  the `wallet_stories` row and shown on the story page; only the hash goes on-chain
  (matches the existing hash-on-chain / content-in-DB pattern; avoids permanent
  arbitrary text on a size-capped memo).
- **Surface:** a new `direct` NDJSON step shows in the mint console after `confirm`,
  only when a brief was supplied.
- **Optionality:** the brief is optional; an empty brief skips the Director entirely
  (today's exact behavior + cost; tone falls back to `resolveTone`). The tone picker
  is retired from the UI.
- **SERP scope:** a brief unlocks SERP for any kind (`wallet`/`nft` included), via
  the plan's `serpQuery`. Briefless mints keep the per-kind SERP rules.
- **Cron:** the autonomous tick's existing `rationale` becomes its brief, unifying
  both paths on the Director and giving the tick's memo a `briefHash` too.

## Consequences

- **Cat 2 stays clean.** The Director is just another `client.openai.chat…` call to
  `api.acedata.cloud`, billed on the same x402 path as `write`/`paint`. It is **not**
  a 4th distinct service (it reuses Chat), so it adds x402 *volume* but not a new
  service type. Option (b)/(c)'s central risk — pointing a generic provider/gateway
  at OpenAI-direct and bypassing the AceData facilitator — is avoided by construction.
- **Cost rises on briefed mints.** A briefed mint can make up to four paid Ace calls
  (director + serp + write + paint) vs. two–three today. `RENDER_COST_USDC` and the
  $2/day cost-guard (ADR 0004) must be re-tuned.
- **Console contract grows** by one `direct` step id, mirrored in the client `StepId`
  union and the route's server `StepId` (kept in sync by hand, as today).
- **Reversible-ish.** The plan is our own typed object; dropping the Director later is
  a localized change. Re-opening the SDK question is only warranted if the pipeline
  ever becomes genuinely dynamic (a real agent choosing *which* steps to run) — and
  even then, `createX402PaymentHandler` must be threaded through the SDK's `fetch`
  override so billing still flows through AceData.

## Alternatives rejected

- **Vercel AI SDK (b):** buys provider-agnostic structured output + future
  tool-loop/streaming we don't need for a fixed pipeline; costs re-porting the proven
  proxy/retry workarounds, v6-beta churn, and a real x402-bypass temptation.
- **Mastra / LangGraph (c):** heavy abstraction over a flow that is fixed by design;
  violates "Simplicity First / no abstractions for single-use code" and amplifies the
  x402-bypass audit risk.
