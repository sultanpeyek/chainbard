# Synapse RPC — operator notes

> Distilled from `@oobe-protocol-labs/synapse-client-sdk` v2.0.6. Authoritative
> source: https://github.com/OOBE-PROTOCOL/synapse-client-sdk

## What it is

OOBE Protocol's Solana RPC gateway. Mandatory for SAP interactions (program ID
detection depends on the connection's cluster).

## Signup

- URL: https://synapse.oobeprotocol.ai/signup
- Free tier issues an API key (`sk_live_...` or `sk_...`)
- Ask in https://t.me/+ndz4wdTyPOE4Y2U0 for the **participant discount**
  (mention you're competing in the OOBE × Ace Data Cloud participant)

## Endpoint format

```
https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY
```

Also exists as:

- `https://staging.oobeprotocol.ai:8080/rpc?api_key=...` (staging)
- Region/network resolved via
  `SynapseClient.fromEndpoint({ network, region, apiKey })`

## Client init (when we need direct RPC, not via SAP)

```ts
import {SynapseClient, Pubkey} from '@oobe-protocol-labs/synapse-client-sdk'

const client = new SynapseClient({
  endpoint: process.env.SYNAPSE_RPC_URL!,
  apiKey: process.env.SYNAPSE_API_KEY!,
})

const balance = await client.rpc.getBalance(Pubkey('...'))
client.destroy() // tear down all subclients
```

Lazy sub-clients: `.rpc` (53 JSON-RPC methods), `.das` (11 Metaplex), `.ws`
(PubSub), `.grpc`.

DAS reads (when calling JSON-RPC directly, not via the SDK sub-client):

- `getAsset` (DAS read; ~free) — params `{ id: <mint> }`. Note: this endpoint
  has no `das_getAsset` method (returns `Method not found`); use `getAsset`.

## For SAP usage

Don't initialize `SynapseClient` directly. Just pass the endpoint URL to
`SapConnection.fromKeypair` — it builds the underlying `@solana/web3.js`
`Connection` internally:

```ts
import {SapConnection} from '@oobe-protocol-labs/synapse-sap-sdk'

const {client} = SapConnection.fromKeypair(
  process.env.SYNAPSE_RPC_URL!,
  keypair,
)
```

## x402 buyer / paywall classes

`@oobe-protocol-labs/synapse-client-sdk` ships:

- `X402BuyerClient` (`src/ai/gateway/x402/client.ts`) — buyer-side payment
  header builder
- `X402Paywall` (`src/ai/gateway/x402/paywall.ts`) — seller-side HTTP 402
  middleware
- `FacilitatorClient` + `FACILITATOR_REGISTRY` (PayAI, Dexter, RelAI, CDP)

These target the **PayAI facilitator family**, not Ace Data's facilitator. Use
them when building our own x402 **sell-side** endpoint (Days 6–8 per plan).

## Free-tier limits (unknown)

Not published on the landing page. Confirm via signup or Telegram.

## Known limitations / gotchas ⚠️

Synapse is a **DAS/read-oriented gateway**, not a drop-in full Solana RPC. It is
mandatory for SAP + DAS (bounty Cat 2), but treat it as read-only. Because of the
footguns below, `resolveRpcUrl` keeps Synapse **fallback-only** (`SOLANA_RPC_URL
→ SYNAPSE_RPC_URL → public`); it never fronts the default path. This table is the
canonical list — `src/env/rpc.ts` (`resolveRpcUrl` doc) points here.

| # | Limitation | Symptom | What we do |
|---|------------|---------|------------|
| 1 | **Raw tx submission unreliable.** `sendRawTransaction` is accepted (returns a sig) but often never propagated to a leader. | Memo/tx "saved" but never lands → dead explorer link ("Sorry, we're unable to locate this tx hash"). | Broadcast ALL writes on a real send RPC. `SEND_RPC_URL` in `app/api/mint/story/route.ts` (prefers `SOLANA_RPC_URL` → public mainnet, never Synapse); memo sender in `modules/sap-memo-writer.ts`. ADR 0001 records the same for the facilitator. **x402 EXCEPTION (reads only):** the x402-verifier on the paid-mint path reads settlement on-chain SYNAPSE-PRIMARY via `resolveRpcUrl(SYNAPSE_RPC_URL, SOLANA_RPC_URL)`. This is read-only confirmation of an already-settled payment; broadcasts (facilitator settle, SAP memo) still must NOT go through Synapse. See ADR 0012. |
| 2 | **Preflight rejected.** Returns "running preflight check is not supported". | Sends fail if preflight runs. | `skipPreflight: true` on every send. |
| 3 | **Slow/flaky confirmations.** Can advance past `lastValidBlockHeight` before reporting a confirm. | Blockhash-window confirm throws spuriously even though the tx lands. | Poll `getSignatureStatus` (bounded, e.g. 20s), don't rely on `confirmTransaction`'s blockhash window. |
| 4 | **Plain JSON-RPC reads flaky.** Some non-DAS reads are unreliable. | Thin/empty/missing fact lookups. | All reads (plain + DAS) prefer `SOLANA_RPC_URL` first via `resolveRpcUrl` / `makeKindRpc`; Synapse is the fallback. DAS still works when `SOLANA_RPC_URL` is DAS-capable, else falls back to Synapse. |
| 5 | **No `das_getAsset`.** The `das_`-prefixed method 404s. | `Method not found`. | Use bare `getAsset` (params `{ id: <mint> }`). |

**Rule of thumb:** `SOLANA_RPC_URL` fronts everything (reads, DAS, broadcast);
Synapse is a fallback only. Transaction broadcasts skip Synapse entirely — even
as a fallback — and go on a real send RPC (`SOLANA_RPC_URL` → public mainnet-beta).
