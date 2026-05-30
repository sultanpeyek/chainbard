# 0007 — Typed, strict env via t3-env with one shared schema

Date: 2026-05-30

## Status

Accepted.

## Context

Env access was scattered across ~30 files as raw `process.env.X?.trim() || default`
reads, with three classes of problem:

- **Duplicate names for one value.** The facilitator pubkey had three names
  (`X402_FACILITATOR`, `ACE_X402_SOLANA_FACILITATOR`, `FACILITATOR_PUBKEY`), the
  facilitator URL two (`X402_FACILITATOR_URL`, `FACILITATOR_URL`), and the agent
  pubkey a server/client pair (`AGENT_WALLET`, `NEXT_PUBLIC_AGENT_WALLET`) — all
  carrying identical defaults.
- **Inconsistent fallback order.** `SOLANA_RPC_URL` and `SYNAPSE_RPC_URL` were
  resolved interchangeably but in conflicting precedence: the mint route did
  `SOLANA || SYNAPSE`, while canary/preview did `SYNAPSE || SOLANA`. A SAP/DAS
  call could silently land on a non-SAP node depending on the call site.
- **No validation, duplicated guards.** Each of ~12 bun scripts reimplemented its
  own `readEnv`/`requireEnv`. Nothing validated shape; a malformed `DATABASE_URL`
  surfaced as a deep runtime error, not a boot failure.

Alternatives considered:

- **Keep `process.env` + one shared `readEnv()` helper.** Rejected — fixes the
  duplicated-helper problem but not validation, typing, or the client/server
  boundary, and leaves the duplicate names and inconsistent fallbacks in place.
- **Two independent t3-env schemas (app, scripts).** Rejected — duplicates every
  shared field definition (RPC, wallet, facilitator) across two files.
- **All secrets optional + graceful degradation everywhere.** Rejected — the team
  chose strict fail-fast (below); half-configured deploys should not boot.

## Decision

1. **t3-env, one shared field set, two context wrappers.** `src/env/shared.ts`
   exports plain zod field *shapes*. `src/env/index.ts` (`@t3-oss/env-nextjs`,
   app server+client) and `src/env/cli.ts` (`@t3-oss/env-core`, bun scripts)
   each `createEnv()` picking the fields they need and marking required-ness
   **per context** — a script that never touches the DB does not require
   `DATABASE_URL`, and the homepage does not require `MINT_ENDPOINT`.

2. **Strict fail-fast, no skip.** App-wide required secrets — `DATABASE_URL`,
   `ACE_API_KEY`, `AGENT_SECRET_KEY_BASE58`, `CRON_SECRET`, `DEMO_SECRET` — make
   the app refuse to boot when absent. There is **no** `SKIP_ENV_VALIDATION`
   escape hatch; every environment (incl. CI / local `next build`) must provide
   the required vars. A committed `.env.ci` holds dummy placeholder values so
   secret-less builds still pass. `emptyStringAsUndefined: true` makes empty
   Vercel vars count as missing. Consequence: the previous
   `if (!dbUrl) return emptyFeed()` degradation paths and `readEnv`-throw-at-use
   blocks are now unreachable and are removed in favor of direct `env.*` access.

3. **Merge duplicates to canonical names.** `ACE_FACILITATOR_PUBKEY`,
   `ACE_FACILITATOR_URL`, a single `NEXT_PUBLIC_AGENT_WALLET` (server + client;
   it is a public pubkey), and `NEXT_PUBLIC_APP_URL` absorbing `STORY_BASE_URL`.
   `MINT_ENDPOINT` stays a script-only var but defaults to
   `${NEXT_PUBLIC_APP_URL}/api/mint/story`.

4. **RPC resolvers, fixed precedence.** `resolveRpcUrl` resolves the read
   **effective RPC** as `SOLANA_RPC_URL → SYNAPSE_RPC_URL → public mainnet-beta`;
   `resolveSendRpcUrl` resolves the write/broadcast RPC as `SOLANA_RPC_URL →
   public mainnet-beta`. Both vars stay distinct and optional.

## Consequences

**Positive.**
- Misconfiguration fails loudly at boot, not deep in a payment flow.
- One name per concept; one fallback order. The latent SAP-on-wrong-node bug is
  closed.
- Typed `env.*` autocomplete; the client/server boundary is enforced by t3-env
  (`NEXT_PUBLIC_` prefix), not by convention.
- ~12 duplicated `readEnv` helpers collapse to a shared, validated import.

**Negative.**
- **No graceful degradation.** Homepage + preview deploys now require every app
  secret set; the old "render without DB" path is gone by design.
- **No build escape hatch.** Cold `next build` without secrets needs `.env.ci`
  dummies — a committed fixture to maintain.
- **Rename churn + deploy coordination.** Merging duplicate names means updating
  the Vercel dashboard env keys in lockstep with the deploy, or the renamed vars
  read as missing and (being required) block boot.

## Related

- ADR `0001-payment-plane-acedata-facilitator.md` — facilitator pubkey/URL these
  vars point at.
- ADR `0005-demo-self-funding-exception.md` — `DEMO_SECRET` gate, now required.
- CONTEXT.md — `Environment`, `Effective RPC`, `Canonical env names`.
