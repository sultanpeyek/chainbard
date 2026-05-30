# Spike S2 — Sentinel das_getAsset via sap-x402

**Issue:** #4  
**Branch:** `afk/issue-4-spike-s2-sentinel-das`  
**Date:** 2026-05-27  
**Status:** BLOCKED (network restricted in execution environment)

---

## Objective

Land 1 settled `das_getAsset` call against `https://agent.sentinel.oobeprotocol.ai/tools/das_getAsset`
paid in SOL via SAP escrow. Confirm escrow-deposit eligibility path fires. Capture deposit tx signature +
Sentinel response.

---

## Execution result

Network access to `agent.sentinel.oobeprotocol.ai` is **blocked** in the AFK agent cloud
execution environment:

```
curl -s "https://agent.sentinel.oobeprotocol.ai/tools"
Host not in allowlist
```

The spike harness (`scripts/spikes/S2-sentinel-das.ts`) is complete and ready to run in any
environment with outbound HTTPS access. Creds needed: `SYNAPSE_RPC_URL` + `AGENT_SECRET_KEY_BASE58`.

---

## Protocol shape (from prior work)

The following is known from `scripts/ping-sentinel.ts` and `CONTEXT.md` (prior probes run locally):

### Endpoint

```
Base URL: https://agent.sentinel.oobeprotocol.ai
Tool:     POST /tools/das_getAsset
Catalog:  GET  /tools
Quote:    POST /payment/quote
```

### Step 1 — GET /tools response shape

```json
{
  "count": 110,
  "total": 110,
  "tools": [
    {
      "name": "das_getAsset",
      "plugin": "das",
      "category": "...",
      "protocol": "sap-x402",
      "description": "...",
      "pricePerCall": <lamports>,
      "currency": "SOL"
    }
  ]
}
```

### Step 2 — POST /tools/das_getAsset (unauthenticated) → 402 response

**Request:**
```http
POST /tools/das_getAsset
Content-Type: application/json

{ "id": "So11111111111111111111111111111111111111112" }
```

**Response (from prior probe):**
```json
{
  "error": "Payment required",
  "protocol": "sap-x402",
  "tool": "das_getAsset",
  "pricePerCall": <lamports>,
  "currency": "SOL",
  "acceptedTokens": ["SOL"],
  "network": "mainnet-beta",
  "minEscrowDeposit": 10000000,
  "hint": "..."
}
```

- `minEscrowDeposit`: 10,000,000 lamports = 0.01 SOL
- `protocol`: `sap-x402` (not standard x402 USDC — this uses SAP on-chain escrow)
- All Sentinel tools priced in **SOL (lamports)**, not USDC

### Step 3 — POST /payment/quote

**Request:**
```http
POST /payment/quote
Content-Type: application/json

{ "depositor": "<depositor_pubkey>" }
```

Expected response shape (unknown — not probed; to be captured on first real run):
```json
{
  "depositor": "<pubkey>",
  "agentPda": "<sentinel_agent_pda>",
  "nonce": <n>,
  "depositLamports": 10000000,
  "expiresAt": <unix_ts_or_0>
}
```

### Step 4 — create_escrow_v2 on-chain

Target: **Sentinel's agent PDA** (not our own agent).

```
Sentinel wallet:  Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph
Sentinel agentPDA: PDA(['sap_agent', SENTINEL_PUBKEY])
Escrow PDA:       PDA(['sap_escrow_v2', sentinelAgentPDA, depositorPubkey, nonce])
```

IDL method: `create_escrow_v2` — same as in `scripts/self-pay-roundtrip.ts` / `scripts/escrow-roundtrip.ts`, but with Sentinel's agentPDA as `agent` account and our keypair as `depositor`.

Settlement mode: **SelfReport (0)** — Sentinel's server settles its own calls against the escrow.
We do NOT call `settle_calls_v2`; Sentinel does.

### Step 5 — Retry with payment header

**Request:**
```http
POST /tools/das_getAsset
Content-Type: application/json
x-sap-depositor: <depositor_pubkey>
x-sap-escrow: <escrow_pda>    (may or may not be required — to be confirmed)

{ "id": "So11111111111111111111111111111111111111112" }
```

If Sentinel returns 402 again despite the escrow existing, likely causes:
- Wrong header name (try `X-Payment` or a JSON envelope instead)
- Wrong escrow params (price_per_call mismatch, settlement_security mismatch)
- Escrow not yet finalized on-chain (wait a block)

Expected success response shape (DAS standard):
```json
{
  "result": {
    "interface": "V1_NFT",
    "id": "So11111111111111111111111111111111111111112",
    "content": { ... },
    "authorities": [ ... ],
    "compression": { ... },
    "grouping": [ ... ],
    "royalty": { ... },
    "creators": [ ... ],
    "ownership": { ... },
    "supply": { ... },
    "mutable": true,
    "burnt": false
  }
}
```

---

## Payment path

```
Our agent keypair (depositor)
    │
    │  create_escrow_v2 on SAP program
    │  → escrow holds 0.01 SOL
    ▼
SAP escrow PDA (vs Sentinel agent PDA)
    │
    │  retry POST /tools/das_getAsset
    │  with x-sap-depositor header
    ▼
Sentinel server
    │  verifies escrow exists + funded
    │  executes DAS RPC call
    │  calls settle_calls_v2 (server-side, SelfReport mode)
    ▼
das_getAsset JSON response
```

**No `settle_calls_v2` called by us.** Sentinel settles its own escrow (SelfReport).
This is correct per ADR 0001 — `settle_calls_v2` broken upstream for external callers.

---

## Open questions (to answer on first real run)

1. **Exact `/payment/quote` response shape** — full field set unknown.
2. **Exact retry header format** — is `x-sap-depositor` sufficient, or does Sentinel expect
   a base64-encoded `X-Payment` payload similar to standard x402?
3. **Escrow `settlement_security` param** — SelfReport assumed; confirm Sentinel enforces it.
4. **`price_per_call` in escrow** — must match Sentinel's declared price exactly? Or is min fine?
5. **Idempotency** — can the same escrow be used for multiple `das_getAsset` calls? Script uses
   nonce scanning to find a free slot, so subsequent runs will create a fresh escrow. Future
   `sentinel-pinger` module (#19) should reuse the active escrow if balance remains.

---

## How to run

```bash
# Probe only (no SOL spent):
SYNAPSE_RPC_URL=https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=<key> \
AGENT_SECRET_KEY_BASE58=<base58> \
bun run scripts/spikes/S2-sentinel-das.ts

# Full round-trip (~0.01 SOL deposit + fees):
SYNAPSE_RPC_URL=... \
AGENT_SECRET_KEY_BASE58=... \
bun run scripts/spikes/S2-sentinel-das.ts --send
```

Optional: `DAS_ASSET_ID=<mint>` to look up a different asset (default: SOL wrapped token mint).

---

## Acceptance criteria status

| Criterion | Status |
|-----------|--------|
| Script lands 1 settled `das_getAsset` call via sap-x402 escrow | ⏳ needs real run |
| Deposit tx signature captured | ⏳ needs real run |
| Sentinel response (asset metadata) captured | ⏳ needs real run |
| Script re-runnable / idempotent | ✓ nonce scan + --send guard |
| Script header documents required env vars and expected output | ✓ |

---

## Next steps

1. Run script in an environment with outbound HTTPS + credentials (local or CI with network policy).
2. Fill in actual tx sig, Sentinel response, and `/payment/quote` response shape above.
3. Confirm retry header format (update script if `x-sap-depositor` alone is insufficient).
4. Hand off findings to `sentinel-pinger` module (#19).
