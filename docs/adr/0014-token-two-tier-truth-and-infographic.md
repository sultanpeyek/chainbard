# 0014 — Token stories: two-tier truth (numbers asserted, news attributed) + data-faithful infographic hero

Status: Accepted
Date: 2026-06-01

## Context

The autonomous **daily curator tick** (ADR 0010, CONTEXT "Daily curator tick")
resolves a trending **token** mint, then *renders it as a wallet*: `runCuratorTick`
hardcoded `fetchWalletSpotlights` + `renderStory('wallet')` + `runDirector('wallet')`,
so a token mint was probed with `getBalance` / `getSignaturesForAddress` and produced
near-empty, low-level data. The token-aware path (`fetchTokenSpotlights`,
`renderTokenStory`, `runDirector('token')`) already existed but was never reached by
the tick, and cron never wired a `TokenSpotlightSource`. Three things compounded the
"data too low-level, image is random art" symptom:

1. **Thin token data.** The `TokenSpotlightSource` modelled only RPC mint info + DAS
   `getAsset` (ticker / name / spot price). DAS price is flaky on our fallback RPC
   (CONTEXT "Effective RPC": Synapse is read/DAS-only, flaky). No liquidity, volume,
   24h change, or mcap — the market narrative that makes a token story land.
2. **Chain-only grounding (ADR 0010).** The **Director**/**Brief** contract makes
   on-chain **spotlights** the *only* truth and the brief tone-only. That rule was
   built to defend against an **untrusted buyer brief**. Applied to a token whose
   on-chain facts are genuinely sparse, it muted the *one* thing that explains the
   move — the trending news that surfaced it.
3. **Cinematic, data-blind hero.** The hero image was an LLM "cinematic image prompt"
   — pretty but unrelated to the token's data. Cron also hardcoded `dall-e-3`
   (poor at legible text), diverging from the reactive nano-banana→seedream chain.

## Decision

Route `kind:'token'` through the token path end-to-end, and make three bounded
upgrades. **Scope: all token stories** (autonomous tick + reactive buyer mint) — the
changes land in shared core (`renderTokenStory`, the token spotlight source), not FE.

1. **Enrich token spotlights, Dexscreener-primary + DAS fallback.** One shared
   `TokenSpotlightSource` (used by both paths) sources RPC trust signals (decimals,
   supply, mint/freeze renounced, launch proxy) **plus keyless Dexscreener**
   `/latest/dex/tokens/{mint}` market data (price, liquidity, 24h volume, 24h change,
   mcap), falling back to DAS `getAsset` when Dexscreener is empty for a mint.
   `TokenSpotlights` gains nullable market fields. No paid market-data dependency.

2. **Two-tier truth for token kind.** On-chain + Dexscreener **numbers are asserted
   facts** (verified spine); the **trending news / curator rationale is foregrounded
   but attributed** ("recent coverage links the move to…"), never asserted as a chain
   fact. The autonomous steering text is the **curator rationale** — SERP-grounded, a
   different trust class from a buyer brief — so the **Director may emit a news-seeded
   `serpQuery` for `token`** (previously `wallet`/`nft` only), the rationale becomes
   `emphasis`, and the **source headline** (`sourceHitText`) threads
   aggregator → pick → render and is persisted on `tick_log` (`pick_source_hit`) for
   #2 provenance.

3. **Data-faithful infographic hero (baoyu-adapted).** The token hero is a
   **data-locked, LLM-authored infographic**: the renderer hands the write step the
   verified fact strings + a content-policy-safe baoyu layout/style allowlist
   (bento-grid / dashboard / dense-modules × technical-schematic / bold-graphic /
   knolling / aged-academia) and instructs it to **embed the numbers verbatim** while
   composing the card. Rendered on the shared **nano-banana→seedream→placeholder**
   chain (extracted to `src/lib/ace-image-client.ts`, replacing cron's `dall-e-3`).
   Pure data-viz / typography / geometric is permitted by the **content policy**; the
   token's mascot/logo (often an animal) is forbidden, so the card is abstract data.

## Consequences

- **Deliberate deviation from ADR 0010 for the news layer, bounded to token.** The
  buyer-brief injection defense is unchanged: the Director stays the chokepoint, the
  raw brief still reaches only the Director, and the loosening is *attribution*, not
  *assertion* — a non-chain claim must be hedged, never stated as on-chain truth. A
  hype/scam snippet can colour the arc but cannot move a verified number.
- **New free dependency on Dexscreener** for the market layer (already a dependency
  for resolution). Fail-soft: empty market data → DAS fallback → null fields render as
  "unknown", never a crash.
- **Schema migration**: `tick_log.pick_source_hit` (nullable text). Drizzle migration
  required.
- **Reversible-ish.** Two-tier truth is enforced in `buildTokenUserPrompt` + the
  Director's token gate; the infographic is one prompt-builder + a shared image
  client. Reverting any one upgrade is localized.

## Alternatives rejected

- **Deterministic infographic prompt** (template fills cells, no LLM): maximal data
  fidelity but no compositional variety across the gallery. Rejected in favour of
  **data-locked LLM-authored** — verbatim facts handed in, LLM composes — which keeps
  variety without letting the model paraphrase numbers.
- **Vendoring the full baoyu skill** (21 layouts × 22 styles, EXTEND.md, confirmation
  gate, multi-file disk output): built for interactive use, an impedance mismatch with
  a headless cron tick. We adapt the layout×style *vocabulary* and the data-fidelity
  rule instead.
- **DAS-only enrichment**: keeps the thin interface and the flaky-RPC dependency;
  doesn't fix "too low-level".
- **Keeping `dall-e-3` in cron**: garbled infographic text defeats the goal.
