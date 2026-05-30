# Project glossary

Terms used in this project. Edit when the language sharpens.

## Product

**chainbard** The on-chain Solana storyteller web app at `chainbard.vercel.app`. Accepts a Solana
identifier (wallet pubkey, tx signature, token mint, NFT mint) and renders a story page at a
permanent URL. Two coexisting paths feed a single public gallery: the **reactive flow**
(third-party buyer pays 0.30 USDC via AceData x402 facilitator) and the **autonomous
daily-curator tick** (agent-run cron, no buyer). See PRD issue #1 for the full spec.

## Brand

**Cap-mark** The full woodcut bard's-cap; the hero/large brand art (OG, README).
_Avoid_: logo, icon.

**Plume mark** The flat single-path plume silhouette used for small-size chrome
(favicon, app icons, header/footer lockup); a legibility-first derivative of the
**cap-mark**. _Avoid_: logo, favicon (as a noun for the art).

**Brand lockup** The **mark** + "chainbard" wordmark composed together; rendered
by `BrandLockup` in header and footer.

## Payment model

**AceData x402 volume (Cat 2)** USDC paid through the **Ace Data Cloud x402
facilitator** for AI services. This is the **only** payment-volume type the
project pursues. Escrow-deposit volume (Cat 1) is **not pursued** — see
**Sentinel** and ADR 0016.

**x402-cron** The *buy-side* x402 rail: the AceData client is built with
`createX402PaymentHandler({ network:"solana" })` and a wallet adapter wrapping the
**agent keypair**, so the agent signs **and broadcasts** the SPL `TransferChecked`
as fee-payer (it needs USDC for spend plus a *dust* amount of SOL for the tx fee)
— the same broadcast/confirm/priority-fee path as the SAP memo sender. It is the
**only** buy-side rail and is **always on**: there is no env toggle and no
credit-paid Bearer fallback (the **agent keypair** is a required secret, so the
client is always built). Used by **both** the autonomous tick and the **reactive
flow** buy-side, so all downstream Ace spend is **AceData x402 volume**. _Avoid_:
conflating with the *sell-side* facilitator volume of the **reactive flow**;
"gated by `X402_CRON_ENABLED`" (the toggle was removed in ADR 0016).

Both flows' buy-side spend, plus the reactive sell-side, generate AceData x402
volume; that is the whole engine. There is no escrow-deposit floor (ADR 0016).

## Identities

**Agent** A SAP-registered Solana entity with a keypair, capabilities, pricing,
and an optional x402 endpoint. Discoverable on Synapse Explorer.

**Test agent** A SAP-registered agent created for pre-launch testing,
intentionally named/described as a test. To be deactivated once the real agent
is registered. Burns ~0.03 SOL in stake/fees.

**Buyer** Any third party that pays our agent via our x402 sell-side endpoint
(AceData x402 facilitator on the sell-side, with direct USDC fallback). The
buyer's 0.30 USDC offsets our downstream **x402-cron** Ace spend; for a
media-rich render (multi-SERP + **video service** + **audio service**) the
buy-side exceeds 0.30 and the **agent** subsidises the difference on purpose —
more buy-side spend *is* the Cat-2 metric (ADR 0016). No SAP escrow on the buyer
leg.

## Workflow shapes

**Daily curator tick** The agent fires on a cron without a human trigger. 5-step
brain: SERP/news → structured chat decides `{ kind, identifier, rationale }` →
Dexscreener + RPC enrich → render (chat + multi-SERP + image — the **Token
infographic** for `token`, the common story view for `wallet`/`tx`/`nft` — plus
the **video service** / **audio service** on **any kind**). Posts the story URL
to the operator webhook. Pays Ace Data via **x402-cron** from the agent's own
treasury. **No buyer escrow, no self-mint** — agent consumes only. Writes 1
trimmed SAP Memo v2 audit entry per render (on-chain proof; see **ACE receipt**).
Generates AceData x402 volume only — no Sentinel/escrow deposit (ADR 0016).

**Autonomous loop** Synonym for **daily curator tick**.

**Daily → Hourly curator tick** The tick cadence is configurable via
`CRON_CADENCE_CRON` (default `0 * * * *`, hourly) rather than fixed at once a
day. The names **daily curator tick** / **autonomous loop** are retained for the
*shape* of the tick (agent-run cron, no buyer); "daily" no longer pins the
interval. The durable trigger (QStash schedule → `/api/workflow/autonomous-tick`,
or the simpler `CRON_SECRET`-gated `/api/cron/autonomous-tick` GET route) fires on
this cadence. _Avoid_: reading "daily" as a literal once-per-day guarantee.

**Dormant state** The treasury-exhausted self-no-op state of the autonomous
agent, persisted in the `agent_state` row (`createSqlAgentStateRepo`). When the
agent runs out of funds — detected at runtime by `isFundsExhausted` (insufficient
USDC/SOL/lamports, SPL custom error `0x1`, debit-with-no-credit) — the tick
**sets dormant** and short-circuits: `runCuratorTick` returns `{ ok:false,
step:"dormant" }` with **no `tick_log` row and no operator webhook**, and the cron
route answers `200 { dormant:true }` (not a `500`). The stored `reason` is an
**opaque code**, never a balance/floor figure (ADR 0016 — no spend posture
leaks); the numeric `MIN_TREASURY_USDC` pre-flight is removed. A funded operator
clears the flag (`clearDormant`). Distinct from a normal tick error (which *does*
book a `tick_log` row + 500). See ADR 0015, 0016.

**Reactive flow** A third-party buyer pastes input (pubkey / tx sig / mint),
sees a free **Preview**, then pays 0.30 USDC via AceData x402 facilitator (or
direct USDC fallback) to render the story. **Payment gates the live render** —
the paid mint *is* the AI render + persist (ADR 0006); viewing an
already-minted story at `/[input]` is free. The synchronous mint renders the
story (chat + multi-SERP + image) and publishes immediately, then **enqueues a
durable QStash media-attach job** that generates + collects the **video service**
/ **audio service** out-of-band and patches `story.videoUrl` / `story.audioUrl`;
the share page **late-hydrates** them (ADR 0016). No SAP escrow on the buyer leg.
Generates AceData x402 volume on both sell-side (buyer payment via facilitator)
and buy-side (downstream **x402-cron** Ace spend). cNFT mint + cinematic tier
deferred to future opt-in upsells.

**Mint (story)** vs **cNFT mint** — "mint" is overloaded. *Minting a story* is
the reactive-flow act of rendering + persisting a story page at a permanent URL
(`POST /api/mint/story`); the buyer's input may be any **kind** (wallet / tx /
nft / token). *cNFT mint* is the deferred upsell that mints an actual compressed
NFT of a story via Sentinel — not implemented in v1. Unqualified "mint" in code
and demo means the story mint. A story is identified by its `input` alone
(`/[input]`, `ON CONFLICT (input_hash)`); a **brief** steers the render but is
*not* part of story identity — re-minting the same input under a new brief
**overwrites** the prior story (latest-paid-wins, v1). URLs are unchanged by the
brief.

**Re-mint** Paying the 0.30 USDC again for an input that *already* has a story,
to overwrite it with a fresh render (**latest-paid-wins**). Any **buyer** may
re-mint any input — story identity is the **input**, never the payer — so the
newest paid render wins and the `/[input]` URL is unchanged. Reachable from the
minted **share page** via a re-mint CTA (a cache *hit* is no longer a dead end).
Distinct from **Resume**: a re-mint is a *new payment carrying new intent*; a
resume *finishes one already-paid mint*. The two are told apart by the buyer's
**payment intent** — a freshly-signed payment is a re-mint, a replayed one is a
resume.

**Resume** Finishing a single already-paid **mint (story)** that failed *after*
settle, by replaying the *same* payment so the buyer is never charged twice (the
post-payment retry boundary — see **Pre-payment vs post-payment failure**). A
resume re-runs only the unfinished steps and is decided durably by the buyer's
**payment intent**, so it survives a server restart and never collides with a
**Re-mint**. _Avoid_: using "retry" for the post-payment case (that's **Try
again**, the uncharged pre-payment rebuild).

**Payment intent** The buyer's partial-signed USDC payment, identified by a
stable digest that is the same every time the *same* payment is replayed and
different for every fresh signature. The single fact that distinguishes a
**Re-mint** (new intent) from a **Resume** (same intent), independent of input,
buyer, or which server instance handles the request.

**Preview** The free, pre-payment card shown for a pasted input on the homepage
hero: detected **kind** + a few cheap on-chain facts (balance / tx count / asset
name) pulled from **free RPC only — no Ace spend**, plus a tone picker and the
"Mint · 0.30 USDC" CTA. De-risks the blind purchase; gives no AI render away.

**Brief** The optional free-form text a **buyer** writes at mint time to steer
their **mint (story)** — their angle, focus, or intent for the subject. Distinct
from **tone** (the fixed style enum Tragedy/Comedy/Epic/Elegy/Forensic) and from
the AI-*output* `narrative` (the bard's written paragraph in a `tx` story). The
brief is *buyer intent, not ground truth*: the on-chain **spotlights** remain the
source of truth, and the bard may not assert facts the chain contradicts. Never
interpreted by a contract — the chain only records its provenance alongside the
story. _Avoid_: "narration" (collides with `narrative`), "prompt".

**Director** The single structured LLM step that turns a (spotlights + **brief**)
pair into a typed **plan** before the fixed render pipeline runs. The *only* place
the raw, untrusted **brief** is read; it always sanitizes the brief into a
policy-clean plan and never hard-rejects (worst case: it drops the brief entirely
and renders the plain spotlights story, so a brief can never strand a paid buyer).
Built on the existing `aceChatJson` strict-schema primitive — *no new SDK, no agent
framework* (see ADR 0010). Runs as its own **mint console** step (`direct`) after
`confirm`, before `facts`, only when a brief was supplied. Same AceData Chat service
as `write` (x402-billed, but *not* a 4th distinct service for Cat 2). _Avoid_:
"agent", "planner-agent" (it makes no autonomous tool choices — pipeline shape is
fixed).

**Plan** The Director's typed output: `{ tone, serpQuery, imageStyle, emphasis }`.
The bounded contract between the untrusted **brief** and the fixed pipeline —
downstream steps (`search`/`write`/`paint`) consume the plan, never the raw brief,
so an injection in the brief cannot reach the image model. **tone** is derived here,
not picked by the buyer (the tone picker is retired in favour of the brief).

**Two-tier token truth** The grounding rule for `token` stories: on-chain +
Dexscreener **numbers are asserted facts** (the verified spine — price, liquidity,
volume, mcap, supply, renounced flags), while the **trending news** that surfaced
the token is **foregrounded but attributed** — the bard may lead with *why it is
trending* yet never asserts a non-chain claim as on-chain fact. For the **daily
curator tick** the steering text is the **curator rationale** (SERP-grounded), a
different trust class from an untrusted buyer **brief**, so the **Director** may
emit a news-seeded `serpQuery` for `token` (previously `wallet`/`nft` only) and the
specific source headline threads through to the render. A deliberate, bounded
loosening of ADR 0010's chain-only rule — see ADR 0014. _Avoid_: treating news as
ground truth, or letting it override a chain number.

**Token infographic** The `token` story's hero image is a **data-faithful
infographic** (a baoyu-style layout×style data card), not a cinematic
illustration — adopted so the image *shows the token's data* rather than random
art. The write step composes the layout/style from a content-policy-safe allowlist
and is handed the verified fact strings to embed **verbatim** (numbers never
paraphrased). Pure data-viz, typography, and geometric pattern are **permitted** by
the **content policy**; a token's mascot/logo (often an animal) is **not**, so the
card is abstract data, never the meme art. Rendered through the shared
nano-banana→seedream image chain (legible text). See ADR 0014.

**Video service** A Cat-2 AceData service (AceData x402 volume) that adds an
**abstract data-motion** clip to a story — kinetic typography / animated data
card / geometric motion, **never beings** (obeys **content policy**). Fired async
(`wait:false`) via a provider chain (`VIDEO_PROVIDER`=veo/veo3 →
`VIDEO_FALLBACK_PROVIDER`=kling), then a bounded `MEDIA_COLLECT_TIMEOUT_MS` poll
of `ace.tasks.get` collects the result URL, which is mirrored into Vercel Blob
(`storeRemoteAsset`) and stored as `story.videoUrl`. **Always on** — no env
toggle (ADR 0016) — and runs on **every kind** on the autonomous tick and on the
**reactive flow** (via the durable media-attach job). Pure enrichment: a failure
**never fails the render** (generate/collect return `null`). Emits a `video`
**ACE receipt**.

**Audio service** The companion Cat-2 AceData service (AceData x402 volume) that
adds a **spoken-word narration** of the story (subtitle + first section body) —
voice only, **no music/instruments** (obeys **content policy**). Same async
fire/collect/Blob-mirror shape as the **video service** (`AUDIO_PROVIDER`=fish),
stored as `story.audioUrl`, never fails the render, **always on**, every kind,
both flows (ADR 0016). Emits an `audio` **ACE receipt**. Together **video
service** + **audio service** are the two media-enrichment legs; they share the
one **agent keypair**'s **x402-cron** rail with **chat**/**search**/image, not
distinct payment systems.

**ACE receipt** The **service-provenance** record for one render — which Cat-2
AceData services ran (chat / search / image / video / audio), their providers,
task ids, and on-chain sigs. **No dollar figures** — provenance, not cost. It is
captured **completely on every path** (every **kind**, autonomous *and*
reactive — today the media legs are missing on the reactive and non-`token`
paths) and surfaced **only** in non-public / proof places: the trimmed on-chain
SAP memo, the **ace:debug** CLI, and **Judge mode**. It is **never** shown on the
public `/activity` feed or share page (ADR 0016). _Avoid_: putting a price/cost in
a receipt, or rendering a receipt on a public surface.

**Mint widget** The homepage-hero flow: paste input → **Preview** → connect
wallet (Wallet Standard, multi-wallet) → sign a partial-signed USDC transfer
(buyer = token authority, facilitator = fee-payer) → `POST /api/mint/story`
with `X-Payment` → redirect to the rendered `/[input]`.

**Mint console** The live, step-by-step status surface inside the **Mint
widget** that narrates one **mint (story)** in flight — one line per real
op (dry-run, settle, confirm, gather facts, search, write, paint, save, stamp
memo), streamed from `POST /api/mint/story` as each completes. Completed steps
collapse to a check, the active step shows a spinner, and on-chain signatures
(settle, memo) render as live explorer links. Buyer- *and* judge-facing
progress of a single mint; distinct from **Judge mode**, the separate standing
debug dashboard. The step list is **kind**- and **brief**-aware: the *direct*
line shows only when a **brief** was supplied (and runs the **Director**); the
*search* line shows for `tx`/`token` always, and for any **kind** whose **brief**
produced a `serpQuery` (a brief unlocks SERP for `wallet`/`nft` too).

**Pre-payment vs post-payment failure** The retry boundary in the **mint
console**: a step that fails *before* the settle line ran (build / dry-run /
sign / verify) leaves the buyer uncharged → **Try again** rebuilds a fresh
payment. A step that fails *after* settle (confirm / facts / write / paint /
save / memo) means the buyer already paid → **Resume** replays the *same*
`X-Payment` and never re-signs, so a transient error can't double-charge.

**Judge mode** A reviewer-facing debug layer, deliberately **visible and
labelled** (homepage + header/footer "Judge Mode" entry → `/judge`). The
`/judge` dashboard surfaces **on-chain-public proof** — live `402` probe,
agent-discover endpoint, `/activity` link, the SAP memo trail, the **ACE receipt**
(service provenance), `provenance` badge, and `paymentSig`/`memoSig` Solscan
links — so a reviewer can verify real Cat-2 settlement. **Open, no auth.** It
shows only on-chain-public or non-sensitive data; it **never** surfaces model
names, costs, budget, treasury balance, decision rationale, `DEMO_SECRET`,
keypairs, or operator strategy (ADR 0016).

**Kind** The class of on-chain identifier a story is about: `wallet` (system-
owned pubkey), `tx` (64-byte signature), `nft` (cNFT asset id, or a token-
program mint DAS-confirmed as a digital asset), or `token` (fungible SPL mint).
Detected by `detectKind` from the raw input. Each kind has its own spotlight
fetcher and renderer; `wallet`, `nft`, and `token` share the common story view.
The token story is **narrative-first on free data**: a `TokenSpotlightSource`
sources mainnet RPC trust signals (decimals, supply, mint/freeze-authority
renounced, best-effort launch date) plus **keyless Dexscreener market data**
(spot price, liquidity, 24h volume, 24h price change, market cap), with DAS
`getAsset` as a best-effort fallback; real-world color comes from the **trending
news** that surfaced the token (see **Two-tier token truth**). The speculative
fat interface (holder distribution, supply breakdown, milestones) stays cut for
lack of a free provider, but the market layer (price / liquidity / volume / mcap)
is now in-scope because Dexscreener serves it keylessly — no paid market-data
dependency.

**Gallery** Public feed of stories produced by the autonomous loop. Free to
read, indexed by Twitter unfurls. The full organic virality flywheel (algorithmic
feed, ranking, infinite scroll) is **deferred**. v1 ships two narrower homepage
surfaces instead — **Featured** (curated) and **Recent** (live) — plus the
per-story share page (`/[input]`) and the `/activity` tick-log page.

**Featured** A hand-picked, operator-curated showcase strip on the homepage. A
curated ordered view over the **Fixture catalog**, each card linking to its
`/[input]` share page. Static — never changes without a code edit. Distinct from
the deferred organic **Gallery**; it is the v1 "best of" highlight, not an
algorithmic feed.

**Fixture catalog** The single source of truth for chainbard's curated mainnet
assets (`src/config/fixtures.ts`): one slug-keyed entry per asset holding its
identifier, kind, label, and default tone. Both the **Featured** strip and the
seed-mint slate (`scripts/seed-mint.ts`) are derived ordered views over it, so
their identifiers/labels can never drift apart. Light by design — pure data, no
runtime imports, safe in the browser bundle.

**Recent** A live homepage section listing the most-recently-minted real stories
from `wallet_stories`, each linking to `/[input]`. Excludes `provenance='demo'`
(ADR 0005). The minimal real-feed realization of **Gallery** for v1 — newest-first,
no ranking/flywheel.

**No self-dealing** Autonomous loop never pays itself — agent treasury pays
Ace Data (third-party services) only (legitimate consumption; the Sentinel /
escrow path is removed, ADR 0016). Reactive story revenue comes from real
third-party **buyers**; the agent funds its own buy-side Ace spend (it is the
buyer of *services*, not of its own *story*). No path exists where the agent is
both buyer and seller of a story. **Exception:** the **demo loop** deliberately
self-funds a **demo buyer** so a reviewer can watch the flow without a separate
funded wallet. This is the one sanctioned agent-funds-both-legs path; it is
isolated by `provenance='demo'` and excluded from the public gallery and
real-volume accounting. See ADR 0005.

**Content policy** The operator's constraint on permitted imagery, audio, and
motion. Encoded in a single system-prompt constant `CONTENT_POLICY` imported
by both the story renderer and the image-prompt builder. Permits objects and
places without sentience (landscapes, plants, architecture, inanimate objects,
ornamental script, geometric patterns, abstract art); prohibits humans, animals,
anthropomorphic objects, religious iconography, symbols of political/
ideological/social movements, nudity/sexual themes, occult cosmology as
positive subjects, musical instruments, and motion that animates objects as
beings. See ADR 0002.

## Protocols & infra

**SAP (Synapse Agent Protocol v2)** Solana program
(`SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`) for agent identity, escrow, x402
settlement, attestation. SDK: `@oobe-protocol-labs/synapse-sap-sdk`.

**Synapse RPC** OOBE Protocol's Solana RPC gateway. Mainnet endpoint format
`https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=...`. Required for SAP
interactions. Free-tier signup at `synapse.oobeprotocol.ai/signup`.

**x402** HTTP 402 Payment Required protocol. Server returns `402 + accepts[]`
describing payment requirements; client signs a payment payload and retries with
`X-Payment` header; server verifies + settles + serves.

**Facilitator** Off-chain relay that verifies x402 payment payloads + executes
the on-chain settlement.

- **Ace Data facilitator** — `https://facilitator.acedata.cloud`. Used for paid
  Ace Data service calls.
- **PayAI facilitator** — used by Synapse RPC server (`x402-synapse-rpc-server`)
  when paying for RPC calls. Different system, out of scope for our AceData x402
  volume.

**Sentinel** SAP verification agent (pubkey:
`Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph`). Calling its service via the
`sap-x402` **escrow** would satisfy the Cat-1 escrow-deposit floor — but the
project **does not pursue Cat 1**, so the Sentinel / escrow-deposit path is
**removed** (ADR 0016). It was already a no-op in code (`createNoopSentinel`); the
0.01 SOL escrow deposit is never made. Retained here only to name what was
dropped.

- cNFT mint via Sentinel (`metaplex-nft_mintNFT`) remains a **deferred future
  opt-in upsell**, unrelated to the dropped escrow path. No `sentinel-mint-adapter`
  module in v1.

## Demo & simulation

**Demo loop** An operator-run CLI (`scripts/demo.ts`, `bun run demo`) that drives
one flow end-to-end — including self-funding — so a judge can watch it work
without juggling a funded wallet. `--flow reactive` (default) or `--flow cron`.
`--target local` (default) or `--target prod`.

**Simulate** The default mode of the demo loop (no `--send`): read-only preview
of balances + funding plan, a real `402` probe of the target endpoint, and a
narrated dry-run of each step with cost estimates. Broadcasts nothing, spends
nothing. `--send` flips the demo loop to real mainnet writes.

**ace:debug** A single operator-only CLI (`bun run ace:debug <input>`) that walks
the **whole ACE flow** for one input — detect → spotlights → director →
multi-SERP → render → image → **video service** → **audio service** → persist →
memo — printing, per stage, the **provider + model** in use, the **output/link**,
and on failure the **error + root cause**. Dual-mode: simulates by default,
`--live` does real **x402-cron** spend. Verbose by design and never public, so it
may print cost estimates and the full **ACE receipt** (ADR 0016). _Avoid_:
shipping its output to any public surface.

**Demo buyer** A disposable keypair (`keys/demo-buyer.json`) funded from the
agent treasury solely for demo runs, kept distinct from any real **buyer**.
Swept back to treasury after each `--send` run unless `--no-recover`.

**Demo provenance** Stories produced by a demo run carry `provenance='demo'`
(not `'buyer'`). Excluded from the public gallery feed and from real-volume
accounting. Signalled to the mint route via a gated `x-demo-key` header
(matching env `DEMO_SECRET`); the same gate authorizes `--placeholder`
(force-skip Midjourney on `--target prod`). _(The old demo-safe cron toggle
`DEMO_SKIP_SENTINEL` was removed with the escrow path — ADR 0016.)_

**Featured seeding loop** An operator-run CLI (`scripts/seed-featured.ts`,
`bun run seed-featured`) that drives the **reactive flow** once per **Featured**
fixture to back every homepage card with a real story. Like the **demo loop** it
self-funds, so every row carries **demo provenance** (`x-demo-key` → `provenance=
'demo'`); unlike `seed-mint.ts` it pays the real 0.30 USDC, settles a SAP memo,
and renders a real Midjourney image per fixture (passing each fixture's `brief` +
`tone`). Runs a bounded worker pool of disposable seed buyers
(`keys/seed-buyer-N.json`); each buyer recycles a single 0.30 USDC — the payment
round-trips to the treasury and the next iteration's idempotent fund re-sends it
— so concurrency `N` needs only `N × 0.30` USDC of float. Skips fixtures already
present unless `--force`; dry-run unless `--send`.

**Activity log** Public read-only page at `/activity` rendering the `tick_log`
history (autonomous curator ticks) as a **neutral story feed**: timestamp and the
pick linked to its story — nothing more. Stripped of spend posture: **no**
rationale, **no** ACE receipt, **no** error text, **no** treasury/budget wording
(ADR 0016). A dormant agent shows a neutral "Curator is currently offline." On-
chain proof and the **ACE receipt** live in **Judge mode**, not here.

## Environment

Env access is centralized via **t3-env** (typed, validated at boot). One set of
zod field shapes in `src/env/shared.ts`; two context wrappers — `src/env`
(`env-nextjs`, app server+client) and `src/env/cli.ts` (`env-core`, bun
scripts) — each declares which fields are required *for that context*. App
secrets are **strict**: `DATABASE_URL`, `ACE_API_KEY`, `AGENT_SECRET_KEY_BASE58`,
`CRON_SECRET`, `DEMO_SECRET` are required app-wide (missing → app refuses to
boot; no degraded-render fallback). Config knobs (prices, timeouts, models,
RPC, facilitator) are optional with defaults. See ADR 0007. The rich pipeline
(x402 buy-side, multi-SERP, **video service**, **audio service**) is **always
on** — the ADR 0015 feature toggles (`X402_CRON_ENABLED`, `VIDEO_ENABLED`,
`AUDIO_ENABLED`, `COST_GUARD_ENABLED`, `WEB_EXTRACT_ENABLED`, `DEMO_SKIP_SENTINEL`)
are **removed** (ADR 0016); only genuine external config remains as env
(`QSTASH_*`, `WORKFLOW_URL`, `BLOB_READ_WRITE_TOKEN`, the provider/model strings,
the agent key).

**Effective RPC** The single Solana RPC URL a server path uses, resolved by one
helper as `SOLANA_RPC_URL → SYNAPSE_RPC_URL → public mainnet-beta`. Generic
`SOLANA_RPC_URL` (a real full RPC) is preferred everywhere — reads, DAS, and
broadcast; **Synapse RPC** (SAP/DAS-capable, carries an `api_key`) is the
fallback; the public node is the last resort. ⚠️ Synapse is **read/DAS-only in
practice** — it drops raw tx sends, rejects preflight, and has flaky
confirmations + plain reads — so it stays fallback-only and never fronts the
default path. Writes (memo, facilitator settle) skip Synapse entirely, even as a
fallback (`SEND_RPC_URL`). Full list: `docs/synapse.md` → "Known limitations /
gotchas"; resolver in `src/env/rpc.ts` (`resolveRpcUrl` doc).

**Canonical env names** After merging duplicates: facilitator pubkey is
`ACE_FACILITATOR_PUBKEY` (was `X402_FACILITATOR` / `ACE_X402_SOLANA_FACILITATOR`
/ `FACILITATOR_PUBKEY`); facilitator URL is `ACE_FACILITATOR_URL` (was
`X402_FACILITATOR_URL` / `FACILITATOR_URL`); the agent pubkey is the single
public `NEXT_PUBLIC_AGENT_WALLET` (used server *and* client — it is public; the
secret is `AGENT_SECRET_KEY_BASE58`); the app's public base is
`NEXT_PUBLIC_APP_URL` (absorbs the old `STORY_BASE_URL`), and the operator
script target `MINT_ENDPOINT` derives from it by default.

## Terms we DON'T use

- **"Wallet"** — ambiguous. Use **agent keypair** (the on-chain identity),
  **payer** (the signer for a specific tx), or **buyer's wallet** (third-party
  caller).
- **"API key"** alone — there are three distinct credentials: `SYNAPSE_API_KEY`
  (RPC access), `ACE_API_KEY` (Bearer-token AI access), `ACE_PLATFORM_TOKEN`
  (console/platform operations). Name the specific one.
- **"Free credits" / "credit-paid"** — Ace Data signup credits consume the
  **Bearer-token** path, which is **removed** (ADR 0016): the only buy-side rail
  is **x402-cron**. No credit-paid path remains; all buy-side spend is x402-paid
  (Cat 2). Kept here only to flag the dead term.
