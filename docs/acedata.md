# Ace Data Cloud — operator notes

> Distilled from `@acedatacloud/x402-client` v2026.507.2 + `@acedatacloud/sdk`
> v2026.504.2. Authoritative source: https://github.com/AceDataCloud/X402Client

## Two payment paths

| Path               | Credential                                           | Counts as AceData x402 volume? |
| ------------------ | ---------------------------------------------------- | ------------------------ |
| **Bearer API key** | `ACE_API_KEY` (account credits, free signup credits) | ❌ No                    |
| **x402 (USDC)**    | Signed `X-Payment` header per request                | ✅ Yes                   |

Only the **x402 path** counts as AceData x402 volume. Free credits don't count.

## x402 Solana flow (canonical, from official `test-solana-e2e.ts`)

1. POST `https://api.acedata.cloud/<endpoint>` with no auth →
   `402 Payment Required`
2. Response body:
   `{ accepts: [{ scheme, network, maxAmountRequired, payTo, asset, ... }] }`
3. Find `accepts.find(a => a.network === 'solana')`
4. Build SPL `TransferChecked` tx:
   - Fee payer = **facilitator pubkey** (default
     `3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq`)
   - ComputeBudget set unit limit 100_000 + price 5000 microLamports/CU (spec
     max)
   - `createAssociatedTokenAccountIdempotentInstruction` for payTo ATA
   - `createTransferCheckedInstruction(payerAta, mint, payToAta, payer, amount, 6)`
5. Partial-sign with payer only (facilitator co-signs as fee payer)
6. Envelope:
   `{ x402Version: 2, scheme: 'exact', network: 'solana', payload: { serializedTransaction: base64 } }`
7. Base64 envelope → `X-Payment` header
8. Re-POST with header → `200 OK` (settlement tx hash in response headers)

## SDK convenience path

```ts
import { AceDataCloud } from '@acedatacloud/sdk';
import { createX402PaymentHandler } from '@acedatacloud/x402-client';

const client = new AceDataCloud({
  paymentHandler: createX402PaymentHandler({
    network: 'solana',
    solanaSigner: /* see SDK typescript/src for exact shape */,
  }),
});

await client.openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hi' }],
});
```

The SDK handles the 402→sign→retry loop transparently. For the hello-world we
use the raw HTTP path (clearer + matches official e2e test).

## Endpoints (verify in Ace Data console)

| Service                 | Path                           
| ----------------------- | -------------------------------
| OpenAI chat completions | `POST /openai/chat/completions`
| Google SERP             | `POST /serp/google` (verify)   
| Translation             | (verify)                       
| JSON localization       | (verify)                       
| Midjourney imagine      | `POST /midjourney/imagine`     
| Veo videos              | (verify)                       
| Suno songs              | (verify)                       

We only consume the ✅ services per halal constraint.

## Verified Solana x402 costs (from official test scripts, 2026-04-25)

- `/openai/chat/completions` (3-word reply, gpt-4o-mini): **0.095215 USDC**
- `/midjourney/imagine` (turbo): 0.115215 USDC

Solana x402 is **more expensive** than Base x402 (chat: 0.020568 USDC on Base) —
likely facilitator overhead pricing. Plan for ~0.1 USDC per call when budgeting.

## Facilitator

- URL: `https://facilitator.acedata.cloud`
- Solana fee-payer pubkey: `3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq`
- Source: https://github.com/AceDataCloud/FacilitatorX402

## Platform Token

- Get from: `https://platform.acedata.cloud/console/platform-tokens`
- Format: `platform-v1-...`
- Used for: console operations, NOT for x402-paid requests (those need no token)
