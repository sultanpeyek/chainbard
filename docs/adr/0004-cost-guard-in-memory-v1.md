# 0004 — Cost-guard v1 is in-memory, not DB-backed

Date: 2026-05-28

## Status

Accepted (provisional). Supersede when durable backend lands.

## Context

Issue #10 specified a "DB-backed shared daily counter" so the autonomous loop and reactive
renders share a single $2/day Ace spend cap that survives process restarts.

The implementation in PR #25 ships an in-memory `CostGuard` instead. On Vercel Functions
(Fluid Compute) the counter is shared across concurrent requests within one instance but
**not across instances or restarts**. On the autonomous tick (single-shot cron) the counter
resets every invocation.

## Decision

Ship the in-memory cap for v1. Document the soft-cap drift here. Track durable persistence
as a follow-up.

## Why

- Deadline forcing. The render pipeline (#24 / #29 / #31) blocks behind shipping
  *something* — wiring a DB-backed counter requires DB scaffolding (Bun's built-in `SQL`
  shipping with #24) plus a `cost_guard` table, atomic `INSERT…ON CONFLICT` increment,
  and a factory that selects the SQL backend when `DATABASE_URL` is set. ~80 extra lines.
- Real-world blast radius is small. The cap is `$2/day`, render cost is `~$0.05` per story,
  worst case `~40 renders` of drift per restart. We pay at most a few dollars over the
  intended cap if the process restarts mid-day or instances scale wider than one.
- Reactive renders dominate volume (per [[adr-0003-virality-first-autonomous-deprio]]).
  Reactive renders front-load on the same instance; the in-memory cap protects the common
  path. The autonomous tick is single-shot per fire, so its drift is bounded by `picks-per-tick`.

## Consequences

- A process restart resets the daily counter. We may exceed the documented `$2/day` cap
  by `<1×` cap per restart in the worst case.
- Multi-instance scale-out (when reactive load grows) multiplies the cap by instance count.
- Operator monitors actual Ace spend via AceData console as the durable source of truth.
- Follow-up issue (created with this ADR) tracks durable persistence via Bun `SQL`
  + Postgres `cost_guard` table with atomic increment.

## How to apply

- New code wires `costGuard?` through `RenderDeps` — keep the optional dep so v2 can
  swap the backend without changing callers.
- The default singleton (`defaultCostGuard`) is the in-memory instance until the
  follow-up lands.
- Do not assume the counter is durable in tests or runtime code.

## Amendment (ADR 0015)

Date: 2026-06-04

The `$2/day` in-memory cap is now **opt-in** via `COST_GUARD_ENABLED` (default **off**).
The `CostGuard` class still defaults `enabled=true` so existing unit tests keep guarding,
but the shared singleton is constructed with `envFlag(env.COST_GUARD_ENABLED)`, so by
default it does not enforce a daily ceiling.

The real spend ceiling is now the **agent wallet USDC balance**. Under the x402 payment
rail (ADR 0012) every paid leg debits the agent wallet directly, so the wallet balance is
the authoritative cap: when funds are exhausted the rail itself fails the call (handled via
`isFundsExhausted` → dormancy in the autonomous tick). The arbitrary `$2/day` figure was a
soft proxy for "don't run away with spend" that the wallet balance now enforces for real.

**Shared-singleton caveat (intended):** `defaultCostGuard` is the *same* singleton used by
both the autonomous loop and the reactive-mint path. Disabling the cap therefore also lifts
the reactive-mint daily cap, not just the autonomous one — this is intended. With the wallet
balance as the true ceiling, a single per-process soft cap across both paths is redundant.
Re-enable `COST_GUARD_ENABLED=1` to restore the in-memory soft cap on both paths
simultaneously.
