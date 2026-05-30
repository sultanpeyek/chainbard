# Token story is narrative-first on free data

## Status

accepted

## Context

The token **kind** shipped with a speculative 8-method `TokenSpotlightSource`
(holder distribution, supply breakdown, normalized price arc + ATH, milestones,
holder count) that was never sourced — those fields have no free provider, only
paid market-data APIs (Birdeye/Helius/DexScreener). Token render was therefore
deferred: the mint route returned an explicit "token render deferred" 400 (#82).

## Decision

Make the token story **narrative-first**, like the other kinds, on free data
only. A thin `TokenSpotlightSource` sources just what mainnet RPC + DAS give for
free — ticker, name, decimals, supply, mint/freeze-authority renounced, plus
best-effort `launchedAt` (oldest signature, bounded) and DAS `price_info` spot
price/mcap when present. Real-world color comes from a SERP search on the ticker
(the same engine `tx` already uses). The story adopts the common shape
(`stats[3-6]` + `sections[5]` + `verdict`, curated by the LLM from the prompt
facts) and reuses the wallet story view; the bespoke token viz components and the
fat interface are deleted.

## Considered alternatives

- **Integrate a paid market-data provider** to fill the fat interface (real price
  arc, ATH, holder distribution). Rejected: adds an API key, per-mint cost, and
  rate limits — a paid dependency on chainbard's otherwise free-ish plane — for
  data viz that isn't the product. The product is the AI narrative.
- **Keep the fat shape and synthesize the gaps** (pad a single price point into an
  arc, fabricate holder buckets/milestones). Rejected: the structured UI would
  imply a precision we don't have.

## Consequences

- The token story carries less structured market data than a typical token
  explorer; this is deliberate, not a gap to "fix" by wiring a provider.
- No no-credential token fixture: token always live-renders or `notFound`. The
  Featured BONK card 404s until BONK is minted once — minting BONK is a post-ship
  seed step.
- Enabling SERP for token extends the `search` progress step (previously tx-only)
  to token in the mint console contract + stepper.
