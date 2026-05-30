# 0001 — Payment plane: AceData x402 facilitator (with direct-USDC fallback)

Date: 2026-05-27

## Status

Accepted. Spike S1 confirmed `facilitator.acedata.cloud` co-signs arbitrary `payTo` end-to-end (two real mainnet `/settle` txns; see `scripts/spikes/S1-payto-probe.ts`). Fallback path not activated.

## Context

The original PRD framed the reactive (paid) path as:

> Buyer signs a SAP `create_escrow_v2` tx with the chainbard agent as recipient; agent calls `settle_calls_v2` on delivery; SAP Memo v2 written; escrow deposit + settle volume accrues.

Session-3 diagnostics proved `settle_calls_v2` is unreachable on deployed SAP v0.18 across every configuration tested (SelfReport / CoSigned / DisputeWindow / pending-flow / batch). `GlobalRegistry.totalEscrows = 0` — no v2 escrow has ever successfully settled on mainnet. Settle is broken upstream and we have no client-side workaround.

This invalidates the "buyer signs SAP escrow → agent settles" reactive flow. We need a replacement payment plane that:

- Lets a real third-party buyer pay USDC for a story render (preserves the paid-mint UX).
- Routes payment through AceData Cloud's own x402 facilitator.
- Does not depend on `settle_calls_v2`.
- Keeps the no-self-dealing guarantee (no agent-to-agent self-pay loop).

Three options were considered (PRD Q-OPEN-4):

1. **Free reactive views.** No payment. Loses the paid-mint UX entirely and the sell-side x402 volume.
2. **AceData x402 facilitator** on the buyer leg. Buyer signs USDC `TransferChecked` to the chainbard wallet; facilitator co-signs as fee-payer. Viable if the facilitator accepts an arbitrary `payTo`. Both sell-side and downstream buy-side x402 volume accrue through AceData.
3. **SAP escrow create only, never settle.** Buyer signs `create_escrow_v2`; funds locked; buyer self-`withdraw_escrow_v2` post-render. Escrow-deposit volume accrues from buyers. UX trust-fragile (buyer must believe in the refund path); on-chain footprint looks like "agent that takes deposits and never settles."

## Decision

**Adopt option 2: AceData x402 facilitator on the reactive sell-side.** Buyer pays USDC via the standard x402 protocol against `facilitator.acedata.cloud`. Server returns 402 with `accepts.payTo = chainbard wallet`. Facilitator co-signs as fee-payer; buyer signs as token authority. Settlement happens on the facilitator's side; we verify the settlement tx via `x402-verifier` (module #6 in PRD).

**Fallback (outage-only, not activated):** direct USDC `TransferChecked` from buyer to the chainbard wallet, with buyer as fee-payer. Buyer needs ~0.001 SOL in addition to USDC. All other modules (sell endpoint, verifier, orchestrator) remain unchanged. Kept in this ADR as the documented rejected alternative — the facilitator path is strictly better (buyer pays $0 SOL fees).

**SAP escrow is deleted from the buyer leg entirely.** Reactive escrow-deposit volume = 0 by design.

**SAP escrow-deposit volume accrues solely from the autonomous tick** via a daily Sentinel `das_getAsset` call paid through a sap-x402 escrow (~0.01 SOL/call). The depositor is the chainbard agent itself (legitimate consumption — Sentinel is a third-party service, not the agent itself). Settle is deferred indefinitely; funds are recoverable via `withdraw_escrow_v2`.

## Consequences

**Positive.**
- Paid-mint UX preserved → a real buyer signs and a real story renders.
- AceData x402 volume stacks on two legs (buyer-pay-us + we-pay-AceData), both through the AceData facilitator.
- No dependency on the broken `settle_calls_v2`.
- No self-dealing: the buyer is a real third party; the autonomous tick's Sentinel call pays a real third-party agent.
- `mint-orchestrator` state machine shrinks (no `settlingLegA`, no `mintingViaSentinel`).
- Module `sap-escrow-sellside` repurposed and renamed `x402-verifier`. Module `sentinel-mint-adapter` (#7) deleted from v1.

**Negative.**
- Reactive escrow-deposit volume = 0. Accepted: escrow-deposit activity is met instead via the autonomous Sentinel daily ping.
- We depend on AceData facilitator availability. Spike S1 verified behavior end-to-end; a runtime outage would force the direct-USDC fallback (degraded UX: buyer pays own SOL).
- Buyer must trust chainbard.vercel.app to actually render after payment (no on-chain escrow holding the funds). Mitigation: SAP Memo v2 written post-render is verifiable; refund is manual ops in the rare failure case.

## Related

- Spike S1 — `scripts/spikes/S1-payto-probe.ts`. Facilitator API shapes, pre-validation rules, RPC gotcha (broadcast via mainnet-beta, not Synapse staging).
- Spike S4 — 3 x402 endpoints verified reachable at the 402 layer (`/serp/google`, `/midjourney/imagine`, `/openai/chat/completions`).
- PRD Q-OPEN-3 (revised) — `settle_calls_v2` is unreachable upstream.
- PRD Q-OPEN-4 — original three-option enumeration; this ADR resolves it.
- Diagnostics Session 3 — settle dead-end matrix.
- ADR `0003-virality-first-autonomous-deprio.md` — explains why the reactive path is primary and the autonomous tick is a low-cost daily seed.
