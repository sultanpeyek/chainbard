# 0012 — Synapse RPC primary on x402 paid-leg settlement verification

Date: 2026-06-01

## Status

Accepted.

## Context

Bounty Category 2 ("Ace Data Cloud Usage") requires Synapse RPC to genuinely sit in the x402 **execution** path — not merely a homepage heartbeat (`SynapseHeartbeat`, see `docs/synapse.md`). The honest reading is that a paid x402 mint must actually depend on Synapse for something on the wire.

The obvious move — broadcasting the x402 settlement *through* Synapse — is impossible here:

- The AceData facilitator broadcasts `/settle` **server-side** on its own RPC; the buyer/server never hands it a Synapse send endpoint.
- `synapse.md` gotcha #1: Synapse raw-tx submission is unreliable (`sendRawTransaction` returns a sig but often never propagates). All broadcasts must stay on a real send RPC.

The buyer side also offers no safe lever to force Synapse for blockhash/construction: the AceData x402 client SDK (`@acedatacloud/x402-client`) reads `requirements.extra.rpcUrl` (seller-controlled) and exposes no `rpcUrl`/`connection` option on `X402PaymentHandlerOptions`. Overriding it means forking the SDK or re-signing with a Synapse blockhash — both risk payment failure (stale blockhash) and violate the no-fork / no-payment-failure constraint.

What *is* safe and load-bearing is the **read** leg: the post-settle on-chain re-verification (`x402-verifier`) that gates whether a paid buyer's story renders (ADR 0001 — "we verify the settlement tx via x402-verifier"; ADR 0006 — payment gates the live render).

## Decision

**The x402-verifier on the paid-mint path reads SYNAPSE-PRIMARY.** In `POST /api/mint/story`, a dedicated verifier connection is built from `resolveRpcUrl(env.SYNAPSE_RPC_URL, env.SOLANA_RPC_URL)` (args swapped vs the general `RPC_URL`, so Synapse is primary and SOLANA is the fallback) and wrapped by `createWeb3VerifierRpc(...) → createX402Verifier(...)`. That verifier issues the on-chain reads (`getTransaction`/`getSlot`) confirming the AceData-facilitator-settled USDC payment before the buyer's story is rendered. Synapse is therefore the primary read endpoint that gates whether a paid x402 mint proceeds.

**Synapse is deliberately kept off every write/broadcast leg:**

- Payment construction / blockhash (the buyer's envelope) — reliable chain.
- The facilitator `/verify` + `/settle` calls and their `extra.rpcUrl` advisory (= `RPC_URL`) — reliable chain.
- The SAP memo broadcast (`SEND_RPC_URL`) — reliable send RPC, never Synapse.

The general `connection` (`RPC_URL`) still fronts spotlight/tx/nft/token reads; only the verifier's connection is Synapse-primary.

## Considered alternatives

- **Broadcast x402 settlement through Synapse.** Rejected: facilitator broadcasts server-side; Synapse raw-tx submission is unreliable (gotcha #1).
- **Force Synapse as the buyer's construction/blockhash RPC.** Rejected: not safely reachable by the buyer (SDK reads seller-controlled `requirements.extra.rpcUrl`; no client option). The only overrides are forking the SDK or re-signing — both risk payment failure.
- **Route `requirements.extra.rpcUrl` to Synapse** so the facilitator uses it. Rejected: the facilitator uses that URL for its own server-side verify *and* broadcast — steering it to Synapse risks routing the settlement broadcast through Synapse (gotcha #1).
- **Flip the general `RPC_URL` to Synapse-primary.** Rejected as scope creep: it would also affect the facilitator advisory rpcUrl, send-RPC fallback, and every spotlight/tx/nft read. The verifier-only Synapse-primary const is the surgical, intent-matching change.

## Consequences

- Synapse is load-bearing for paid x402 confirmation reads (bounty intent satisfied) but never on a write/broadcast leg.
- If Synapse degrades, confirmation is delayed but the payment is already settled server-side by the AceData facilitator on its own reliable RPC — no double-charge, no payment failure introduced. A slow/failed re-verify is recoverable via the existing on-chain scan (resume/recovery path).

## Related

- ADR `0001-payment-plane-acedata-facilitator.md` — AceData facilitator on the reactive sell-side; this ADR refines its "verify via x402-verifier" leg. Supersedes nothing.
- `docs/synapse.md` — gotcha #1 (no raw-tx via Synapse) and the x402 reads-only carve-out.
