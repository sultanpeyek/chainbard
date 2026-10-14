<p align="center"><img src="public/brand/logo-512.png" width="180" alt="chainbard" /></p>

# chainbard

An autonomous on-chain storyteller. Paste a Solana identifier (a wallet, a transaction signature, an NFT, or a token mint) and chainbard builds a permanent, shareable story page for it. It discovers tools on the Synapse Agent Protocol (SAP), pulls live context from Ace Data Cloud and Synapse RPC, and pays every Ace Data call through the Ace Data Cloud x402 facilitator.

It runs two ways with no manual step in between:

- **Reactive flow.** A buyer pays 0.30 USDC over x402 and gets a story.
- **Autonomous curator tick.** A scheduled agent picks a subject, researches it, and publishes it, funded from its own treasury.

Live: https://chainbard.vercel.app. Tick log: https://chainbard.vercel.app/activity.

This is a submission for the Superteam Earn bounty "Autonomous Agent Bounty: OOBE x Ace Data Cloud", in Category 2 (Ace Data Cloud usage through the x402 facilitator). There is no Category 1 escrow path. All buy-side Ace Data spend settles through the agent's own x402 self-broadcast rail on Synapse RPC ([ADR 0016](./docs/adr/0016-always-on-pipeline-cat2-only-redacted-surfaces.md)).

## Proof on mainnet

| What | Where |
| --- | --- |
| Deployed app | https://chainbard.vercel.app |
| On-chain proof page (settlement signatures, memo trail, service provenance) | https://chainbard.vercel.app/judge |
| Public tick log (timestamp, kind, story link only) | https://chainbard.vercel.app/activity |
| Registered agent (Synapse Explorer) | https://explorer.oobeprotocol.ai/agent/9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48 |
| Agent PDA (SAP `AgentAccount`) | `7WES6mSvsw3YnMBBvFQotK2GczLMgUCCiKxJFgRXUbYh` |

Settlement and memo proofs render fresh on `/judge`, so no signatures are pinned here. `/activity` never shows spend or receipt details ([ADR 0016 section F](./docs/adr/0016-always-on-pipeline-cat2-only-redacted-surfaces.md)).

## How it works

### Reactive flow

```
buyer pastes input -> POST /api/mint/story
   |- detectKind(input)           wallet | tx | nft | token
   |- 402 + accepts[]             server demands 0.30 USDC
   |- buyer signs X-Payment       Ace Data x402 facilitator settles the sell side
   |- x402-verifier               amount, destination ATA, mint, slot freshness, signature dedupe
   |- spotlight-fetcher           Synapse RPC + Ace SERP
   |- story-renderer              Ace Chat (structured) + multi-SERP + Ace Image
   |- persist                     story page at /[input], published immediately
   '- enqueue media-attach        QStash job generates video and audio, patches them in later
```

The story (chat, multi-SERP, image) publishes synchronously. The QStash job at `/api/workflow/media-attach` generates video and audio on the agent's own x402 rail, and the share page hydrates them when they arrive ([ADR 0016 section D](./docs/adr/0016-always-on-pipeline-cat2-only-redacted-surfaces.md)).

### Autonomous curator tick

The primary trigger is an hourly Upstash QStash schedule that POSTs the durable Workflow route `/api/workflow/autonomous-tick`. QStash signing keys gate it. A synchronous alternative is `GET /api/cron/autonomous-tick` (Bearer auth), which `vercel.json` schedules daily at 06:00 UTC. Both run the same five steps with no human and no buyer:

```
1. Ace SERP/news            gather the day's on-chain signals
2. Ace Chat (structured)    decide { kind, identifier, rationale }
3. Ace SERP                 research the chosen subject (multi-SERP)
4. Synapse RPC              read balances, asset data, history
5. story-renderer           Ace Chat + Image + Video + Audio, publish, post URL to operator webhook
```

Each tick writes one SAP Memo v2 audit entry holding the render id, kind, public identifier, and service-provenance receipt. The rationale and source headline are dropped on purpose. The agent consumes only third-party services (no self-dealing, see [`CONTEXT.md`](./CONTEXT.md)).

### Agent discovery

`GET /api/agents/discover` is a public, read-only endpoint. It lists every `AgentAccount` PDA on the SAP program with `getProgramAccounts`, decoded against the on-chain IDL, including capabilities, pricing, and x402 endpoints.

## Payment

- **Always x402.** Every Ace Data call, in both flows, goes through the agent's x402 self-broadcast rail on the Ace Data Cloud facilitator. There is no API-token fallback ([ADR 0016 section A](./docs/adr/0016-always-on-pipeline-cat2-only-redacted-surfaces.md), [ADR 0001](./docs/adr/0001-payment-plane-acedata-facilitator.md)). The agent is the SPL fee payer and broadcaster, so it holds a small amount of SOL for fees.
- **Synapse first.** Each paid call settles through Synapse RPC. If Synapse has not confirmed after about 15 seconds, the same signed transaction is re-broadcast through `SOLANA_SEND_RPC_URL`. The identical signature executes at most once, so there is no double spend ([ADR 0012](./docs/adr/0012-synapse-primary-x402-paid-legs.md)).
- **Sell-side verification.** `x402-verifier` checks amount, destination ATA, mint, slot freshness, and signature dedupe before it serves a story.
- **Spend guard.** The cost guard is always on with a daily cap (`DAILY_ACE_CAP_USDC`, default 2 USDC). It is an in-memory runaway breaker. The wallet's USDC balance is the real ceiling ([ADR 0004](./docs/adr/0004-cost-guard-in-memory-v1.md), [ADR 0016 section G](./docs/adr/0016-always-on-pipeline-cat2-only-redacted-surfaces.md)).
- **Buyer-funded, agent-subsidised.** The 0.30 USDC covers the synchronous render. The agent pays for video and audio itself, because buy-side volume is the Category 2 metric ([ADR 0016 section B](./docs/adr/0016-always-on-pipeline-cat2-only-redacted-surfaces.md)).
- **Drain to zero.** The agent has no balance gate or auto top-up. When a paid call fails for lack of USDC or SOL, `isFundsExhausted()` classifies the error and `setDormant()` stores an opaque reason code. Ticks then exit silently (no `tick_log` row, no webhook) until the operator re-funds and clears the flag.

### Ace Data services used per tick

| Service | Ace call | Role |
| --- | --- | --- |
| SERP (Google) | `ace.search.google` | Up to 5 research queries: events, origin, price, sentiment, listing |
| Chat (heavy) | `ace.openai.chat.completions.create` | Subject decision and narrative, on `ACE_CHAT_MODEL_HEAVY` |
| Image | `ace.openai.images.generate` | Hero infographic (`nano-banana`, fallback `seedream`), under the [content policy](./docs/adr/0002-content-policy.md) |
| Video | `ace.video.generate` (`veo3`, fallback `kling`) | Abstract data-motion clip |
| Audio | `ace.audio.generate` (`fish`) | Spoken narration of the subtitle and lede |

Video and audio are async (`wait: false` returns a task id, polled through the free `ace.tasks.get`), so a tick stays short. Media is optional: a media failure never fails the tick.

## Provenance and honest volume

Every story has a `provenance` tag, so volume can be read without self-dealing or demos inflating it.

| `provenance` | Label on the story page | Meaning | Counted |
| --- | --- | --- | --- |
| `seed` | curator seed | Hand-seeded starter content | No |
| `buyer` | buyer render | Someone paid 0.30 USDC through the reactive flow, including the smoke-test wallet below | Yes |
| `curator` | curator pick | The autonomous tick paid Ace Data from treasury | Yes |
| `demo` | demo run | The operator funded a demo buyer that pays the agent's own ATA | No |

`listRecent` filters with `WHERE provenance <> 'demo'` ([ADR 0005](./docs/adr/0005-demo-self-funding-exception.md)). A second exclusion works at wallet level and takes precedence over the tag. A smoke-test wallet (`4HtB4QCubGYpqUnY6DDiZY8WvtyAXbNveRagVSVNuYUf`) runs synthetic transactions to keep the pipeline warm, and some of its stories carry the `buyer` tag. Exclude that wallet when you read external volume, as [`/judge`](https://chainbard.vercel.app/judge) notes.

## Testing it

Without a wallet, use the browser:

- [`/judge`](https://chainbard.vercel.app/judge) shows a live 402 probe against the reactive flow, agent discovery, the SAP memo trail, and curator history.
- [`/activity`](https://chainbard.vercel.app/activity) lists autonomous picks.
- The [home page](https://chainbard.vercel.app) gives a free read-only preview of any identifier.

From the CLI (see [Getting started](#getting-started) first):

```bash
bun run demo                 # simulate the full flow, spends nothing
bun run demo -- --send       # real mainnet writes: fund, pay, mint, publish, recover
bun run ace:debug <input>    # walk every stage; add --live for real x402 spend
bun run test-x402            # exercise the AceData x402 facilitator settlement
bun run check-agent          # confirm the registered SAP AgentAccount
```

## Stack

- Next.js 16.4.1 (App Router, Turbopack), React 19.3.1, Tailwind CSS 4
- Bun for packages and scripts, Biome for lint and format, `bun test` for tests
- Neon Postgres with Drizzle ORM (stories, activity, agent state)
- `@oobe-protocol-labs/synapse-sap-sdk` 0.19.8 for SAP registration, discovery, and memo
- `@oobe-protocol-labs/synapse-client-sdk` for Synapse RPC and x402
- `@acedatacloud/sdk` and `@acedatacloud/x402-client` for Ace Data APIs and payment
- `@solana/web3.js`, `@solana/spl-token`, `@coral-xyz/anchor`, Solana wallet adapter
- Upstash QStash and Workflow for durable jobs, Vercel Blob for generated media
- `@t3-oss/env-nextjs` and Zod for typed env validation
- Remotion (in `promo/`) for the promo videos

The published `synapse-sap-sdk` 0.19.8 bundles an IDL that drifts from the deployed v0.18 program. chainbard fetches the on-chain IDL (`Program.fetchIdl` with the Anchor coder) and uses it for account layouts and instruction discriminators ([ADR 0001](./docs/adr/0001-payment-plane-acedata-facilitator.md)).

## Getting started

```bash
bun install
cp .env.example .env.local   # fill in values
bun run check                # biome check --write, then tsc --noEmit
bun dev                      # http://localhost:3000
```

Other scripts in `package.json`:

| Script | Purpose |
| --- | --- |
| `build`, `start` | Production build and server |
| `db:generate`, `db:migrate`, `db:studio` | Drizzle migrations and studio |
| `register-agent`, `close-agent` | Register or close the SAP agent |
| `fund-buyer` | Fund the demo buyer wallet |
| `seed-mint`, `seed-featured` | Seed starter and featured stories |
| `fetch-place-reviews`, `ace-serp-places` | SERP helpers |
| `gen:brand` | Regenerate brand assets |
| `promo:dev`, `promo:render` | Remotion promo studio and render |

## Configuration

Env vars are validated in `src/env/` (Zod shapes in `src/env/shared.ts`). Names only:

- **Required:** `ACE_API_KEY`, `AGENT_SECRET_KEY_BASE58`, `CRON_SECRET`, `DATABASE_URL`, `DEMO_SECRET`
- **RPC:** `SYNAPSE_RPC_URL`, `SOLANA_RPC_URL`, `SOLANA_SEND_RPC_URL`. Reads resolve SOLANA, then SYNAPSE, then the public endpoint. Writes resolve SOLANA_SEND, then SOLANA, then public. Without `SYNAPSE_RPC_URL`, settlement loses its Synapse-in-execution path.
- **Ace Data:** `ACE_API_BASE`, `ACE_CHAT_MODEL`, `ACE_CHAT_MODEL_HEAVY`, `ACE_FACILITATOR_PUBKEY`, `ACE_FACILITATOR_URL`
- **Media:** `VIDEO_PROVIDER`, `VIDEO_MODEL`, `VIDEO_FALLBACK_PROVIDER`, `VIDEO_FALLBACK_MODEL`, `AUDIO_PROVIDER`, `AUDIO_MODEL`, `MEDIA_COLLECT_TIMEOUT_MS`, `IMAGE_PROVIDER`, `IMAGE_FALLBACK_PROVIDER`, `IMAGE_GEN_TIMEOUT_MS`, `PLACEHOLDER_IMAGE_URL`, `BLOB_READ_WRITE_TOKEN`
- **Scheduling:** `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `WORKFLOW_URL`, `CRON_CADENCE_CRON` (default `0 * * * *`)
- **Pricing and caps:** `MINT_PRICE_USDC`, `ACE_COST_PER_RENDER_USDC`, `DAILY_ACE_CAP_USDC`, `USDC_MINT`
- **Other:** `WEBHOOK_URL`, `NEXT_PUBLIC_AGENT_WALLET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`
- **Script-only:** `BUYER_KEY_PATH`, `CHAT_ENDPOINT`, `CHAT_MODEL`, `MINT_ENDPOINT`, `SERP_ENDPOINT`, `TEST_AGENT_NAME`, `TEST_AGENT_DESCRIPTION`

## Running the agent

1. Send USDC (the spend) and SOL (transaction fees) to the agent wallet.
2. Probe the rail with `bun run ace:debug <input> --live`. It runs detect, spotlights, director, multi-SERP, render, image, video, audio, persist, and memo. It prints the provider, model, and output for each stage, plus a Solscan link for each USDC settlement. For a quick per-service check, run `bun run scripts/spikes/x402-probe.ts`.
3. Set the scheduling variables above, then run `bun run scripts/setup-qstash-schedule.ts` to register the hourly QStash schedule. The agent then runs until its treasury is empty.

## Project structure

```
src/
  app/          Next.js routes: home, /[input] story page, /judge, /activity, /render, /og, API routes
    api/        mint/story, preview, agents/discover, cron/autonomous-tick, workflow/*
  components/   UI: mint console, paywall, story share page, brand mark
  modules/      x402 verifier, facilitator and envelope builder, SAP discovery and memo writer, director, mint orchestrator
  db/           Drizzle schema and client
  env/          Typed env validation
  *.ts          Pipeline: story-renderer, spotlight-fetcher, autonomous-curator, cost-guard, treasury, repos
scripts/        Operator and demo CLIs (register, fund, seed, demo, canary, QStash schedule)
drizzle/        SQL migrations
tests/          bun test suites
docs/           ADRs, SAP, Ace Data and Synapse notes, brand guide
promo/          Remotion promo videos (own package.json)
video/          Demo recording script
```

## Docs

- [`CONTEXT.md`](./CONTEXT.md) is the glossary.
- [`docs/adr/`](./docs/adr/) holds ADRs 0001 to 0016 (payment plane, content policy, cost guard, durable payment-intent idempotency, x402 cron conversion, always-on pipeline, and more).
- Integration notes: [`docs/sap.md`](./docs/sap.md), [`docs/acedata.md`](./docs/acedata.md), [`docs/synapse.md`](./docs/synapse.md).
- Brand: [`docs/brand.md`](./docs/brand.md) covers the plumed-cap and quill mark, palette, typography, and assets.

## Licence

MIT. See [LICENSE](./LICENSE).
