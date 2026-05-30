# 0003 — Reactive mint primary; autonomous loop as daily seed tick

Date: 2026-05-27

## Status

Accepted.

## Context

The original PRD framed two coexisting paths with the autonomous loop as the primary volume engine:

- Hourly (or 6-hourly) cron tick × 3 picks per tick × full render pipeline → tens of dollars of Ace volume per day.
- Reactive path = nice-to-have virality kernel, not the volume engine.

Two facts forced a reframing mid-session:

1. **`settle_calls_v2` is unreachable upstream (Session 3 diagnostics).** Reactive paid renders through the AceData facilitator are the reliable, testable path forward; autonomous volume as the primary driver adds disproportionate operating cost for uncertain throughput.
2. **Operating-cost pressure.** Running the autonomous tick at high cadence (hourly × 3 picks) costs significantly more per day than daily × 1 pick, yet marginal quality improvement is low once the 5-step signal brain is factored in. A leaner autonomous loop that seeds the gallery and proves autonomy is sufficient — real throughput should come from paid user renders.

Combined, this inverts the original architecture:

- Autonomous tick = **gallery seed + autonomy proof + compliance tick**, not the primary volume engine.
- Reactive path = **primary volume engine**.

Three knock-on questions:

- **Cadence.** Hourly burns operating budget for low marginal throughput contribution. Daily is enough to (a) prove autonomy, (b) seed the gallery, (c) accrue the Sentinel deposit.
- **Per-tick budget.** Original spec was 3 picks/tick. With a 5-step decision brain (SERP-news → chat-decide → SERP-enrich → RPC-enrich → render), 1 pick/tick already exercises 4–5 distinct Ace services per tick. No need for more picks.
- **Tweet bot.** Original spec auto-tweets every published curator story. Auto-tweet needs X API access, X dev approval — admin work that is deprioritized. Replace with webhook-poster (Discord/Telegram) for v1; manual sharing covers distribution.

## Decision

1. **Reframe priorities.** Reactive paid render is the primary path. Autonomous tick is a low-cost daily seed/compliance tick.
2. **Autonomous cadence = daily, 1 pick/tick.** Estimated cost ~$0.50/tick. Cost-guard cap $2/day soft-stop with headroom to bump.
3. **Autonomous tick = 5-step signal brain.** SERP/news → structured chat `{ kind, identifier, rationale }` → SERP enrich → Synapse RPC enrich → render. Plus 1 Sentinel `das_getAsset` call (~0.01 SOL via sap-x402 escrow) + 1 SAP Memo v2 audit entry per tick. Exercises the autonomy + Sentinel-call path + on-chain real-activity evidence.
4. **Reactive path = primary volume engine.** Paid render at flat $0.30 USDC. Volume stacks on buyer payment (sell-side via AceData facilitator) + downstream Ace spend (buy-side). See ADR 0001 for the payment plane decision.
5. **Tweet bot → webhook poster.** Module #17 renamed; auto-tweet deferred to v1.1. Distribution for v1 is webhook (Discord/Telegram) + manual sharing.
6. **All 4 kinds in scope.** Day 1–2 ships wallet; day 5 adds tx; day 6 adds NFT + token. Multi-step signal brain picks kind dynamically on autonomous side; reactive side auto-detects via `kind-detector`.

## Consequences

**Positive.**
- Autonomous tick operating cost drops from ~$23/day (hourly × 3 picks) to ~$0.50/day (daily × 1 pick). Running cost is negligible.
- No-self-dealing guarantee unchanged: autonomous tick consumes third-party services (Ace, Sentinel), never pays self.
- Submission story sharpens: "real buyer pays $0.30, real story renders, real on-chain receipt." Easier to explain than a hybrid where the autonomous loop carries most of the volume.
- 5-step signal brain demonstrates real judgment on autonomous side — narrower than 3 picks/tick but deeper, easier to defend against "spam/wash" external scrutiny.
- Auto-tweet removed → no X API dependency, no X dev account blocker for Day 7.

**Negative.**
- Autonomous volume contribution is small by design. If reactive volume doesn't materialize (no buyer mints), total Ace throughput will be low. Mitigation: pre-seed 5–10 famous fixtures (PRD US #28) so day-0 gallery looks alive.
- Gallery can look sparse on launch if reactive adoption is slow. Autonomous daily seed is a floor, not a ceiling.
- Sentinel deposit volume from autonomous tick is real but small (~$20 SOL equivalent over the operating window). Acknowledged.

## Related

- ADR `0001-payment-plane-acedata-facilitator.md` — payment plane that makes reactive viable.
- ADR `0002-content-policy.md` — content fence applies to both paths uniformly.
- PRD §"Hybrid model — two paths, one gallery" — implementation surface.
