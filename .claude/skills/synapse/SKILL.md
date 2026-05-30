# Synapse Client SDK — Agent Skills Reference

> **Package**: `@oobe-protocol-labs/synapse-client-sdk`  
> **Version**: 2.0.6  
> **Runtime**: Node.js ≥ 18 · TypeScript ≥ 5.0  
> **License**: MIT

You are an advanced AI agent powered by the Synapse Client SDK and the Solana Agent Protocol (SAP) — a full-stack Solana blockchain toolkit for building, deploying, and orchestrating on-chain applications and autonomous agents.

This document is your complete operational reference. It defines every capability, tool, import path, parameter, and architectural pattern available to you. Use it to:

Select the right function — match user requests to the exact SDK method, import path, and parameters.
Combine tools creatively — when a user's request doesn't map to a single tool, compose multi-step workflows by chaining RPC calls, DAS queries, Jupiter swaps, token operations, and SAP protocol interactions into cohesive solutions.
Take implementation initiative — when asked to build something new (a bot, a dApp feature, an agent pipeline, an MCP server), proactively architect the full solution: choose the right plugins, design the data flow, handle errors, optimize costs, and suggest improvements the user hasn't considered.
Build production-ready code — never produce toy examples. Include proper error handling, retry logic, priority fees, confirmation checks, and cost estimates. Every code block you generate should be deployable.
Design novel integrations — combine SDK capabilities in ways not explicitly documented: sub-agent orchestration, multi-protocol workflows (Jupiter + SAP + x402), cross-agent discovery and delegation, on-chain memory with encrypted vaults, monetized tool marketplaces, and custom MCP servers that expose domain-specific Solana capabilities.
Reason about trade-offs — when multiple approaches exist (Ultra vs Metis API, Ledger vs Vault, stdio vs SSE, polling vs WebSocket), explain the trade-offs and recommend the best option based on the user's context (serverless vs persistent, cost-sensitive vs speed-sensitive, devnet vs mainnet).
Before writing any code, always consult the full SDK and SAP documentation from the GitHub repositories listed in this document. This skills file is a reference summary — the GitHub docs are the source of truth and contain edge cases, additional parameters, and implementation details not covered here.

You are not just a code assistant — you are an autonomous Solana engineer capable of designing, building, and deploying complete blockchain applications and agent systems from a single user promp

### IMPORTANT — First-Run Checklist

**Immediately after the user installs the SDK, you MUST:**

1. **Ask the user for their OOBE Protocol API key.** Without it, RPC calls will be rejected. The key is provided after sign-up at the OOBE Protocol dashboard.
2. **Ask the user if they need Jupiter integration** (swaps, quotes, DCA, limit orders). If yes, ask them for their **Jupiter API key** as well (obtainable at https://station.jup.ag).
3. Store the keys in environment variables or pass them directly in code. Never hard-code keys in committed source files.

The API key is appended as a **query parameter** on the endpoint URL:

```
https://us-1-mainnet.oobeprotocol.ai?api_key=YOUR_OOBE_API_KEY
```

All SDK methods, WebSocket connections, and gRPC streams use this authenticated URL automatically once you pass it as the endpoint.

---

## 📚 Documentation References

When in doubt, **always consult the official documentation** before guessing. These repos contain the authoritative reference for every module:

| Resource | URL | Description |
|----------|-----|-------------|
| **Synapse Client SDK Docs** | https://github.com/OOBE-PROTOCOL/synapse-client-sdk/tree/main/docs_md | Full SDK documentation — RPC, DAS, WebSocket, gRPC, AI tools, plugins, gateway, x402, MCP, persistence, context, Next.js integration..  | 
| **SAP Protocol Docs** | https://github.com/OOBE-PROTOCOL/synapse-sap/tree/main/docs | On-chain Solana Agent Protocol (SAP) program — Anchor IDL, instructions, accounts, events, error codes. Informational — for understanding the protocol layer |
| **SAP SDK Docs** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs | TypeScript SDK for SAP — agent lifecycle, memory systems, x402 escrow, discovery, tools, plugin adapter, best practices, RPC configuration |
| **SAP SDK README** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk | Quick start, installation, SapClient overview |
| **SAP Skill Guide — Client** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/client.md | Consumer role — discover agents, create escrows, build x402 headers, verify settlements, endpoint validation, Zod schemas |
| **SAP Skill Guide — Merchant** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/merchant.md | Seller role — register agent, publish tools, settle payments, memory vault, attestations, plugin adapter, PostgreSQL mirror |
| **SAP Skill Guide — Metaplex Bridge** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/metaplex-bridge.md | SAP × Metaplex Core `AgentIdentity` integration — link MPL Core assets to SAP agents via EIP-8004 registration JSON, single-tx attach, unified profile reads, host the live registry endpoint |
| **SAP CLI Reference** | https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/cli/README.md | `synapse-sap` CLI — 10 command groups, 40+ subcommands for full protocol access from the terminal |

### When to consult docs

- **Import errors or unknown exports** → Check SDK docs for correct import paths
- **SAP agent registration/memory/escrow** → Check SAP SDK docs (01,02,03-agent-lifecycle, 04-memory-systems, 05-x402-payments)
- **Tool publishing or discovery** → Check SAP SDK docs (06-discovery-indexing, 07-tools-schemas)
- **Plugin adapter (LangChain integration)** → Check SAP SDK docs (08-plugin-adapter)
- **Best practices, error handling, costs** → Check SAP SDK docs (09-best-practices)
- **RPC endpoint configuration** → Check SAP SDK docs (10-rpc-network)
- **Consumer flow (discover, pay, verify)** → Read SAP Skill Guide — Client (`skills/client.md`)
- **Merchant flow (register, publish, settle)** → Read SAP Skill Guide — Merchant (`skills/merchant.md`)
- **Metaplex Core integration (NFT identity, EIP-8004 link, unified profile)** → Read SAP Skill Guide — Metaplex Bridge (`skills/metaplex-bridge.md`) and `docs/11-metaplex-bridge.md`
- **CLI operations (agent, escrow, tools, discovery)** → Read SAP CLI Reference (`cli/README.md`)
- **Protocol-level details (Anchor IDL, PDA seeds)** → Check SAP Protocol docs

---

## Table of Contents

1. [Installation & API Keys](#1-installation--api-keys)
2. [Endpoints](#2-endpoints)
3. [Client Setup](#3-client-setup)
4. [Branded Types](#4-branded-types)
5. [RPC Methods (53)](#5-rpc-methods-53)
6. [DAS Methods (11)](#6-das--digital-asset-standard-methods-11)
7. [WebSocket Subscriptions (7)](#7-websocket-subscriptions-7)
8. [Account Readers (8)](#8-account-readers-8)
9. [Decoders (10)](#9-decoders-10)
10. [Programs / Instruction Builders (26)](#10-programs--instruction-builders-26)
11. [Utilities (26)](#11-utilities-26)
12. [AI Tools — LangChain (53 RPC + 86 Protocol)](#12-ai-tools--langchain)
13. [Plugin System — SynapseAgentKit (110 tools)](#13-plugin-system--synapseagentkit-110-tools)
14. [MCP — Model Context Protocol](#14-mcp--model-context-protocol)
15. [Agent Commerce Gateway](#15-agent-commerce-gateway)
16. [x402 Payment Protocol](#16-x402-payment-protocol)
17. [Intents System](#17-intents-system)
18. [SAP — Synapse Agent Protocol (SDK)](#18-sap--synapse-agent-protocol-sdk)
19. [SAP — On-Chain Protocol (via `@synapse-sap/sdk`)](#19-sap--on-chain-protocol-via-synapse-sapsdk)
20. [Solana Actions & Blinks](#20-solana-actions--blinks)
21. [Persistence](#21-persistence)
22. [Context / IoC Container](#22-context--ioc-container)
23. [gRPC / Geyser Parser](#23-grpc--geyser-parser)
24. [@solana/kit Bridge](#24-solanakit-bridge)
25. [Next.js Integration](#25-nextjs-integration)
26. [Common Patterns](#26-common-patterns)
27. [SAP Agent Skill Guides](#27-sap-agent-skill-guides)
28. [SAP CLI — synapse-sap](#28-sap-cli--synapse-sap)

---

## 1. Installation & API Keys

### Install

```bash
npm i @oobe-protocol-labs/synapse-client-sdk
```

Peer dependencies (install if using AI tools):
```bash
npm i @langchain/core zod
```

### API Key Configuration

**OOBE Protocol API Key** (required for all RPC access):

Append `?api_key=` to the endpoint URL. This is the **only** authentication method:

```ts
// ✅ Correct — API key as query param
const ENDPOINT = 'https://us-1-mainnet.oobeprotocol.ai?api_key=YOUR_OOBE_API_KEY';

// Use the authenticated URL everywhere
const client = new SynapseClient({ endpoint: ENDPOINT });
```

Or via environment variable (recommended):

```bash
# .env
OOBE_API_KEY=your-api-key-here
JUPITER_API_KEY=your-jupiter-key-here   # optional, only if using Jupiter tools
```

```ts
const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;
const client = new SynapseClient({ endpoint: ENDPOINT });
```

**Jupiter API Key** (optional — required only for Jupiter swap/quote/DCA tools):

If the user wants to use Jupiter DeFi tools (swap, quote, limit orders, DCA), they need a separate Jupiter API key. Pass it when creating Jupiter tools:

```ts
import { createJupiterTools } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

// ✅ CORRECT — Do NOT override apiUrl. The SDK uses https://api.jup.ag internally.
const { tools } = createJupiterTools({
  apiKey: process.env.JUPITER_API_KEY, // Jupiter-specific key
});
```

> **⚠️ CRITICAL**: Do **NOT** pass `apiUrl: 'https://quote-api.jup.ag/v6'` — that URL is **deprecated** and will cause `TOKEN_NOT_TRADABLE` errors. The SDK defaults to `https://api.jup.ag` which is the correct, current Jupiter API endpoint. Only pass `apiKey`.

> **Agent rule:** If the user has not provided their OOBE API key yet, **ask for it before running any SDK operation**. If they request Jupiter-related features, ask for the Jupiter API key too.

---

## 2. Endpoints

### Production Endpoints

| Region | URL | Use Case |
|--------|-----|----------|
| **US Mainnet** | `https://us-1-mainnet.oobeprotocol.ai?api_key=KEY` | Production — US region (lowest latency for Americas) |
| **EU Mainnet** | `https://staging.oobeprotocol.ai?api_key=KEY` | Production — EU region (lowest latency for Europe) |

All endpoints expose:
- **RPC**: `https://<host>` — JSON-RPC 2.0
- **WebSocket**: `wss://<host>/ws` — PubSub subscriptions
- **gRPC**: `https://<host>/grpc` — Yellowstone/Geyser streaming
- **gRPC native**: `grpc://<host>/grpc-native` — native gRPC transport

### Endpoint Resolution

```ts
import { SynapseNetwork, SynapseRegion, resolveEndpoint } from '@oobe-protocol-labs/synapse-client-sdk';

// Resolve US mainnet
const us = resolveEndpoint(SynapseNetwork.Mainnet, SynapseRegion.US);
// → { rpc: 'https://us-1-mainnet.oobeprotocol.ai', wss: 'wss://...', grpc: '...' }

// Resolve EU mainnet
const eu = resolveEndpoint(SynapseNetwork.Mainnet, SynapseRegion.EU);
// → { rpc: 'https://staging.oobeprotocol.ai', wss: 'wss://...', grpc: '...' }

// Auto-select fastest region
const fastest = await autoSelectRegion(SynapseNetwork.Mainnet);
```

---

## 3. Client Setup

### Direct endpoint

```ts
import { SynapseClient, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';

const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;

const client = new SynapseClient({
  endpoint: ENDPOINT,
});

const balance = await client.rpc.getBalance(Pubkey('So11111111111111111111111111111111'));
```

### From endpoint registry

```ts
import { SynapseClient, SynapseNetwork, SynapseRegion } from '@oobe-protocol-labs/synapse-client-sdk';

const client = SynapseClient.fromEndpoint({
  network: SynapseNetwork.Mainnet,
  region: SynapseRegion.US,
  apiKey: process.env.OOBE_API_KEY, // appended as ?api_key= automatically
});
```

### Factory function

```ts
import { createSynapse } from '@oobe-protocol-labs/synapse-client-sdk';

const client = createSynapse({
  endpoint: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`,
});
```

### Configuration Options

```ts
interface SynapseClientConfig {
  endpoint: string;          // RPC endpoint URL with ?api_key= (required)
  apiKey?: string;           // API key (auto-appended as ?api_key= if not in URL)
  timeout?: number;          // Request timeout in ms (default: 30000)
  maxRetries?: number;       // Retry attempts on failure (default: 3)
  debug?: boolean;           // Enable debug logging
  headers?: Record<string, string>; // Extra HTTP headers
  wsEndpoint?: string;       // WebSocket endpoint (auto-derived if omitted)
  grpcEndpoint?: string;     // gRPC endpoint (auto-derived if omitted)
}
```

### Sub-clients (lazy-loaded)

```ts
client.rpc       // SolanaRpc — 53 JSON-RPC methods
client.das       // DasClient — 11 DAS methods
client.ws        // WsClient — WebSocket subscriptions
client.grpc      // GrpcTransport — gRPC/Geyser streaming
client.accounts  // AccountsClient — typed account fetchers
client.transport // HttpTransport — raw RPC transport
client.kitRpc    // @solana/kit native RPC client
```

---

## 4. Branded Types

Zero-cost nominal types enforced at compile time. **These are NOT plain strings/numbers** — passing a raw `string` where `Pubkey` is expected will cause a TypeScript error.

```ts
import { Pubkey, Sig, Slot, Epoch, Lamports, UnixTs } from '@oobe-protocol-labs/synapse-client-sdk';

const pk  = Pubkey('So11111111111111111111111111111111111111112');
const sig = Sig('5eykt4Uu...');
const s   = Slot(250_000_000);
const e   = Epoch(600);
const l   = Lamports(1_000_000_000n);  // = 1 SOL
const ts  = UnixTs(1709740800);
```

### ⚠️ Strict-Mode Rules (MUST follow)

1. **Never pass raw strings where branded types are expected.**
   ```ts
   // ❌ WRONG — TypeScript error in strict mode
   const balance = await client.rpc.getBalance('So111...');

   // ✅ CORRECT — wrap with Pubkey()
   const balance = await client.rpc.getBalance(Pubkey('So111...'));
   ```

2. **Always wrap user-supplied wallet addresses with `Pubkey()`.**
   When the user gives you an address as a plain string, immediately brand it:
   ```ts
   const userWallet = Pubkey(userInput);  // brand it once, use everywhere
   ```

3. **Cast singletons and factory returns to `SynapseClient`.**
   `createSingleton()` and other factories may return a generic type. In strict Next.js builds, cast explicitly:
   ```ts
   import { SynapseClient, createSingleton } from '@oobe-protocol-labs/synapse-client-sdk';

   const getClient = createSingleton(
     () => new SynapseClient({ endpoint: ENDPOINT }),
     { key: 'synapse-client' },
   );

   // ✅ Cast to SynapseClient — avoids 'unknown' type in app router
   const client = getClient() as SynapseClient;
   ```

4. **Branded types are assignable to their base type** (e.g. `Pubkey` → `string` works), but **not the reverse**. If an external library expects `string`, you can pass a `Pubkey` directly.

---

## 5. RPC Methods (53)

Access via `client.rpc.*` or standalone functions.

### Account Methods (5)
| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `getAccountInfo(pubkey, opts?)` | `Pubkey, { commitment?, encoding? }` | Account data or null | Fetch account data |
| `getBalance(pubkey, opts?)` | `Pubkey, { commitment? }` | `{ value: Lamports }` | SOL balance in lamports |
| `getMultipleAccounts(pubkeys, opts?)` | `Pubkey[]` | Account data array | Batch fetch accounts |
| `getProgramAccounts(program, opts?)` | `Pubkey, filters?` | Program accounts | All accounts owned by program |
| `getLargestAccounts(opts?)` | `{ filter?, commitment? }` | Top 20 accounts | Largest lamport balances |

### Block Methods (7)
| Method | Description |
|--------|-------------|
| `getBlock(slot, opts?)` | Confirmed block by slot |
| `getBlockHeight(opts?)` | Current block height |
| `getBlockTime(slot)` | Estimated production time |
| `getBlockProduction(opts?)` | Recent block production info |
| `getBlocks(startSlot, endSlot?)` | Block list between slots |
| `getBlocksWithLimit(startSlot, limit)` | Blocks from slot with limit |
| `getBlockCommitment(slot)` | Block commitment |

### Transaction Methods (6)
| Method | Description |
|--------|-------------|
| `getTransaction(sig, opts?)` | Confirmed transaction by signature |
| `getSignaturesForAddress(addr, opts?)` | Signatures for an address |
| `getSignatureStatuses(sigs, opts?)` | Batch signature statuses |
| `sendTransaction(tx, opts?)` | Submit signed transaction |
| `simulateTransaction(tx, opts?)` | Simulate without submitting |
| `requestAirdrop(pubkey, lamports)` | Airdrop (devnet/testnet only) |

### Blockhash Methods (2)
| Method | Description |
|--------|-------------|
| `getLatestBlockhash(opts?)` | Latest blockhash + last valid block height |
| `isBlockhashValid(blockhash, opts?)` | Check blockhash validity |

### Slot / Epoch Methods (5)
| Method | Description |
|--------|-------------|
| `getSlot(opts?)` | Current slot |
| `getSlotLeader(opts?)` | Current slot leader |
| `getSlotLeaders(startSlot, limit)` | Slot leaders for range |
| `getEpochInfo(opts?)` | Current epoch info |
| `getEpochSchedule()` | Epoch schedule parameters |

### Inflation Methods (3)
| Method | Description |
|--------|-------------|
| `getInflationGovernor(opts?)` | Inflation governor params |
| `getInflationRate()` | Current epoch inflation |
| `getInflationReward(addresses, opts?)` | Staking rewards per address |

### Cluster / Network Methods (8)
| Method | Description |
|--------|-------------|
| `getVoteAccounts(opts?)` | All vote accounts + stake |
| `getClusterNodes()` | Cluster node info |
| `getSupply(opts?)` | SOL supply breakdown |
| `getRecentPerformanceSamples(limit?)` | Performance samples |
| `getHealth()` | Node health status |
| `getVersion()` | Solana version |
| `getGenesisHash()` | Genesis hash |
| `getIdentity()` | Node identity pubkey |

### Rent / Ledger Methods (5)
| Method | Description |
|--------|-------------|
| `getMinimumBalanceForRentExemption(size)` | Minimum lamports for rent-exempt |
| `minimumLedgerSlot()` | Lowest slot in ledger |
| `getFirstAvailableBlock()` | First non-purged block |
| `getHighestSnapshotSlot()` | Highest snapshot slot |
| `getLeaderSchedule(opts?)` | Leader schedule |

### Staking Methods (2)
| Method | Description |
|--------|-------------|
| `getStakeMinimumDelegation(opts?)` | Minimum delegation |
| `getStakeActivation(pubkey, opts?)` | Stake activation state *(deprecated)* |

### Token / SPL Methods (5)
| Method | Description |
|--------|-------------|
| `getTokenAccountBalance(pubkey)` | SPL token balance |
| `getTokenAccountsByOwner(owner, opts)` | All token accounts for owner |
| `getTokenAccountsByDelegate(delegate, opts)` | Token accounts by delegate |
| `getTokenLargestAccounts(mint)` | Top 20 for token mint |
| `getTokenSupply(mint)` | Total supply for mint |

### Fee / Misc Methods (5)
| Method | Description |
|--------|-------------|
| `getTransactionCount(opts?)` | Ledger transaction count |
| `getFeeForMessage(message)` | Network fee for message |
| `getRecentPrioritizationFees(pubkeys?)` | Recent priority fees |
| `getMaxRetransmitSlot()` | Max retransmit slot |
| `getMaxShredInsertSlot()` | Max shred insert slot |

---

## 6. DAS — Digital Asset Standard Methods (11)

Access via `client.das.*`. Used for NFTs, compressed NFTs (cNFTs), and digital assets.

```ts
const asset = await client.das.getAsset({ id: 'AssetPubkeyHere...' });
const nfts  = await client.das.getAssetsByOwner({ ownerAddress: 'WalletPubkey...' });
```

| Method | Params | Description |
|--------|--------|-------------|
| `getAsset({ id })` | Asset pubkey | Single digital asset |
| `getAssetProof({ id })` | Asset pubkey | Merkle proof for compressed asset |
| `getAssetBatch({ ids })` | Pubkey array | Batch fetch assets |
| `getAssetProofBatch({ ids })` | Pubkey array | Batch Merkle proofs |
| `getAssetsByOwner({ ownerAddress, ... })` | Owner wallet | All assets owned by wallet |
| `getAssetsByGroup({ groupKey, groupValue })` | Group (e.g. collection) | Assets in a group |
| `getAssetsByCreator({ creatorAddress })` | Creator pubkey | Assets by creator |
| `getAssetsByAuthority({ authorityAddress })` | Authority pubkey | Assets by authority |
| `searchAssets({ ... })` | Flexible filters | Search with criteria |
| `getSignaturesForAsset({ id })` | Asset pubkey | Transaction signatures for asset |
| `getTokenAccounts({ owner? , mint? })` | Owner or mint | Token accounts |

### ⚠️ DAS Strict-Type Pitfall — Collection Gating

`GetAssetsByOwnerParams` does **NOT** include `groupKey`/`groupValue` filter fields in the official type. If you need to check whether a wallet holds an NFT from a specific collection, you **cannot** filter at the DAS query level. Instead:

1. Fetch all assets for the owner.
2. Manually inspect the `grouping` array in each returned asset.

```ts
// ✅ CORRECT — fetch then filter client-side
const { items } = await client.das.getAssetsByOwner({
  ownerAddress: walletAddress,
  page: 1,
  limit: 1000,
});

const REQUIRED_COLLECTION = 'YourCollectionMintPubkey...';

const hasNft = items.some((asset) =>
  asset.grouping?.some(
    (g) => g.group_key === 'collection' && g.group_value === REQUIRED_COLLECTION,
  ),
);

if (!hasNft) throw new Error('Wallet does not hold an NFT from the required collection');
```

> **Do NOT** try to pass `{ groupKey: 'collection', groupValue: '...' }` into `getAssetsByOwner()` — it is not in the type and will cause a TypeScript error in strict mode. Use `getAssetsByGroup()` instead if you want to query by collection directly (but that returns ALL holders, not filtered to one wallet).

---

## 7. WebSocket Subscriptions (7)

Access via `client.ws.*`.

```ts
const subId = await client.ws.onAccountChange(
  Pubkey('So111...'),
  (account) => console.log('Updated:', account),
);

// Later
await client.ws.unsubscribe(subId);
```

| Method | Description |
|--------|-------------|
| `onAccountChange(pubkey, callback, opts?)` | Account data changes |
| `onProgramAccountChange(program, callback, opts?)` | All accounts for a program |
| `onLogs(filter, callback, opts?)` | Transaction logs (`'all'`, `'allWithVotes'`, or mentions `Pubkey`) |
| `onSignature(sig, callback, opts?)` | Transaction confirmation |
| `onSlotChange(callback)` | Slot changes |
| `onRootChange(callback)` | Root slot changes |
| `unsubscribe(subId)` | Remove subscription |
| `close()` | Close connection + clear all |

---

## 8. Account Readers (8)

Access via `client.accounts.*`. Fetch + decode in one call.

```ts
const tokenAcct = await client.accounts.fetchTokenAccount(transport, Pubkey('...'));
const mint      = await client.accounts.fetchMint(transport, Pubkey('...'));
const stake     = await client.accounts.fetchStakeAccount(transport, Pubkey('...'));
```

| Method | Description |
|--------|-------------|
| `fetchTokenAccount(transport, pubkey)` | SPL Token account (auto-detects Token vs Token-2022) |
| `fetchMint(transport, pubkey)` | Token mint (auto-detects) |
| `fetchTokenAccountsByOwner(transport, owner, mint?)` | All token accounts for owner |
| `fetchStakeAccount(transport, pubkey)` | Stake account |
| `fetchNonceAccount(transport, pubkey)` | Durable nonce account |
| `fetchLookupTable(transport, pubkey)` | Address Lookup Table |
| `fetchDecoded(transport, pubkey, decoder)` | Any account + custom decoder |
| `fetchDecodedBatch(transport, pubkeys, decoder)` | Batch + custom decoder |

---

## 9. Decoders (10)

Pure functions — decode raw bytes with zero I/O. Import from root or `decoders`.

```ts
import { decodeTokenAccount, decodeMint } from '@oobe-protocol-labs/synapse-client-sdk';
```

| Function | Description |
|----------|-------------|
| `decodeTokenAccount(data)` | SPL Token v1 account |
| `decodeMint(data)` | SPL Token v1 mint |
| `decodeToken2022Account(data)` | Token-2022 account (with extensions) |
| `decodeToken2022Mint(data)` | Token-2022 mint (with extensions) |
| `decodeStakeAccount(data)` | Stake account |
| `decodeNonceAccount(data)` | Durable nonce account |
| `decodeLookupTable(data)` | Address Lookup Table |
| `decodeMultisig(data)` | SPL Token multisig |
| `AccountReader` | Low-level DataView byte reader class |
| `encodeBase58(bytes)` | Encode bytes to base58 |

**Constants**: `TOKEN_PROGRAM_ID`, `TOKEN_2022_PROGRAM_ID`, `SYSTEM_PROGRAM_ID`, `STAKE_PROGRAM_ID`, `LOOKUP_TABLE_PROGRAM_ID`, `TOKEN_ACCOUNT_SIZE`, `MINT_SIZE`, `NONCE_ACCOUNT_SIZE`, `MULTISIG_SIZE`.

---

## 10. Programs / Instruction Builders (26)

Create transaction instructions without external deps.

```ts
import { SystemProgram, SplToken, AssociatedToken, ComputeBudget, Memo } from '@oobe-protocol-labs/synapse-client-sdk';
```

### SystemProgram (5)
| Method | Description |
|--------|-------------|
| `SystemProgram.transfer(params)` | Transfer SOL |
| `SystemProgram.createAccount(params)` | Create account |
| `SystemProgram.assign(params)` | Assign to program |
| `SystemProgram.createWithSeed(params)` | Create with seed derivation |
| `SystemProgram.allocate(params)` | Allocate space |

### SplToken (11)
| Method | Description |
|--------|-------------|
| `SplToken.transfer(params)` | Transfer tokens |
| `SplToken.transferChecked(params)` | Transfer with decimal check |
| `SplToken.approve(params)` | Approve delegate |
| `SplToken.revoke(params)` | Revoke delegate |
| `SplToken.mintTo(params)` | Mint tokens |
| `SplToken.mintToChecked(params)` | Mint with decimal check |
| `SplToken.burn(params)` | Burn tokens |
| `SplToken.closeAccount(params)` | Close token account |
| `SplToken.freezeAccount(params)` | Freeze account |
| `SplToken.thawAccount(params)` | Thaw account |
| `SplToken.syncNative(params)` | Sync wrapped SOL |

### AssociatedToken (2)
| Method | Description |
|--------|-------------|
| `AssociatedToken.create(params)` | Create ATA |
| `AssociatedToken.createIdempotent(params)` | Create ATA (no-op if exists) |

### ComputeBudget (3)
| Method | Description |
|--------|-------------|
| `ComputeBudget.setComputeUnitLimit(params)` | Set CU limit |
| `ComputeBudget.setComputeUnitPrice(params)` | Set priority fee |
| `ComputeBudget.requestHeapFrame(params)` | Request heap memory |

### Memo (2)
| Method | Description |
|--------|-------------|
| `Memo.v1(message)` | Memo Program v1 |
| `Memo.v2(message, signers?)` | Memo Program v2 |

### Utility
| Function | Description |
|----------|-------------|
| `createToken(params)` | High-level: create mint + ATA + mint-to in one call |

---

## 11. Utilities (26)

```ts
import { lamportsToSol, solToLamports, isValidPubkey, sleep, retry, chunk } from '@oobe-protocol-labs/synapse-client-sdk';
```

### Conversion & Validation
| Function | Description |
|----------|-------------|
| `lamportsToSol(lamports)` | Lamports → SOL (÷ 1e9) |
| `solToLamports(sol)` | SOL → branded `Lamports` (× 1e9) |
| `isValidPubkey(str)` | Validate base58 public key |
| `isValidSignature(str)` | Validate base58 signature |

### Async Helpers
| Function | Description |
|----------|-------------|
| `sleep(ms)` | Async sleep for ms |
| `retry(fn, opts?)` | Retry with exponential backoff |
| `chunk(array, size)` | Split array into chunks |

### Serialization
| Function | Description |
|----------|-------------|
| `toJsonSafe(value)` | BigInt-safe JSON conversion |
| `bigIntReplacer` | `JSON.stringify` replacer for BigInt |

### Environment
| Function | Description |
|----------|-------------|
| `isBrowser()` | `true` in browser |
| `isServer()` | `true` on server |
| `getEnvironment()` | `'browser'` or `'server'` |
| `SDK_USER_AGENT` | User-agent string |

### Endpoint Management
| Function | Description |
|----------|-------------|
| `resolveEndpoint(network, region?)` | Resolve RPC/WSS/gRPC URLs |
| `listEndpoints(network?)` | List all endpoints |
| `listRegions(network)` | Available regions |
| `listNetworks()` | Available networks |
| `autoSelectRegion(network)` | Fastest region by latency |
| `probeLatency(endpoint)` | Ping endpoint |
| `toClientConfig(endpoint, opts?)` | Endpoint → client config |
| `createSingleton(factory, opts?)` | HMR-safe singleton (Next.js/Vite) |

### Pre-resolved Endpoints
| Constant | Value |
|----------|-------|
| `SYNAPSE_MAINNET_US` | `https://us-1-mainnet.oobeprotocol.ai` |
| `SYNAPSE_MAINNET_EU` | `https://staging.oobeprotocol.ai` |
| `SYNAPSE_DEVNET_US` | Devnet US endpoint |
| `SYNAPSE_DEVNET_EU` | Devnet EU endpoint |

---

## 12. AI Tools — LangChain

### RPC Tools (53 methods)

```ts
import { createExecutableSolanaTools } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

const client = new SynapseClient({ endpoint: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` });
const { tools, toolMap } = createExecutableSolanaTools(client);

// All 53 RPC methods as LangChain StructuredTool[]
// Each tool has a Zod schema for input validation
```

> **⚠️ IMPORTANT**: The function is called `createExecutableSolanaTools`, NOT `createSolanaTools`. Using the wrong name will cause an import error.

### Protocol Tools (86 methods across 6 groups)

```ts
import {
  createJupiterTools,        // 22 tools — swap, quote, route, limit orders, DCA, price, smartSwap
  createRaydiumTools,        // 16 tools — pools, liquidity, farming, swaps
  createMetaplexTools,       // 12 tools — NFT mint, update, verify, burn, collections
  createJupiterOnchainTools, // 10 tools — on-chain Jupiter interactions
  createRaydiumOnchainTools, // 10 tools — on-chain Raydium interactions
  createSolanaProgramsTools, // 16 tools — program-level tools
  createProtocolTools,       // all protocol tools at once (86 total)
} from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

// ✅ CORRECT — no apiUrl needed, SDK defaults to https://api.jup.ag
const { tools } = createJupiterTools({
  apiKey: process.env.JUPITER_API_KEY,
});

// ❌ WRONG — never pass the deprecated quote-api URL
// const { tools } = createJupiterTools({ apiUrl: 'https://quote-api.jup.ag/v6' });
```

### Jupiter Tools Breakdown (22 tools)

| Group | Tools | Description |
|-------|-------|-------------|
| **Ultra** | `getOrder`, `executeOrder`, `getHoldings`, `shield` | Ultra swap API (simplified) |
| **Metis/Swap** | `getQuote`, `swap`, `swapInstructions`, `smartSwap` | Metis swap engine (full control) |
| **Price** | `getPrice` | Real-time token price |
| **Tokens** | `searchTokens`, `getTokenList`, `getTokenInfo`, `programLabels` | Token metadata |
| **Trigger** | `createLimitOrder`, `executeTrigger`, `cancelLimitOrder`, `cancelLimitOrders`, `getLimitOrders` | Limit & trigger orders |
| **Recurring** | `createDCA`, `executeDCA`, `cancelDCA`, `getDCAOrders` | Dollar-cost averaging |

### Protocol Tool Totals

| Factory | Count |
|---------|-------|
| `createJupiterTools()` | 22 |
| `createRaydiumTools()` | 16 |
| `createMetaplexTools()` | 12 |
| `createJupiterOnchainTools()` | 10 |
| `createRaydiumOnchainTools()` | 10 |
| `createSolanaProgramsTools()` | 16 |
| **Total (via `createProtocolTools()`)** | **86** |

### SDK Constants

```ts
import { JUPITER_API_URL, RAYDIUM_API_URL } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

console.log(JUPITER_API_URL); // 'https://api.jup.ag'
console.log(RAYDIUM_API_URL); // Raydium API base URL
```

---

## 13. Plugin System — SynapseAgentKit (110 tools)

The modular plugin architecture. Compose exactly the tools you need via `.use()`.

### Setup

```ts
import { SynapseAgentKit } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { TokenPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/token';
import { NFTPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/nft';
import { DeFiPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/defi';
import { MiscPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/misc';
import { BlinksPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins/blinks';

const kit = new SynapseAgentKit({
  rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`,
  walletPubkey: 'YourWalletPubkey...',  // optional
})
  .use(TokenPlugin)
  .use(NFTPlugin)
  .use(DeFiPlugin)
  .use(MiscPlugin)
  .use(BlinksPlugin);
```

### SynapseAgentKit API

| Method | Returns | Description |
|--------|---------|-------------|
| `.use(plugin)` | `this` | Install a plugin (chainable) |
| `.getTools()` | `StructuredTool[]` | All tools as LangChain StructuredTool |
| `.getVercelAITools()` | Vercel AI format | All tools for Vercel AI SDK |
| `.getMcpToolDescriptors()` | `McpToolDescriptor[]` | MCP-compatible descriptors |
| `.getToolMap()` | `Map<string, Tool>` | Name → tool lookup |
| `.summary()` | object | Installed plugins, tool count, protocol list |
| `.destroy()` | void | Cleanup resources |

### TokenPlugin — 22 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/token`

**spl-token** (11 tools):
| Tool | Description |
|------|-------------|
| `deployToken` | Deploy a new SPL token mint |
| `transfer` | Transfer SPL tokens between wallets |
| `transferSol` | Transfer native SOL |
| `getBalance` | Get token balance for a wallet |
| `getTokenAccounts` | List all token accounts for owner |
| `mintTo` | Mint tokens to an account |
| `burn` | Burn tokens from an account |
| `freezeAccount` | Freeze a token account |
| `thawAccount` | Unfreeze a token account |
| `closeAccount` | Close a token account |
| `rugCheck` | Run a rug-pull risk analysis on a token |

**staking** (7 tools):
| Tool | Description |
|------|-------------|
| `stakeSOL` | Native SOL staking |
| `unstakeSOL` | Unstake native SOL |
| `getStakeAccounts` | List stake accounts |
| `stakeJupSOL` | Stake via Jupiter (JupSOL) |
| `unstakeJupSOL` | Unstake JupSOL |
| `stakeSolayer` | Stake via Solayer |
| `unstakeSolayer` | Unstake Solayer |

**bridging** (4 tools):
| Tool | Description |
|------|-------------|
| `bridgeWormhole` | Cross-chain bridge via Wormhole |
| `bridgeWormholeStatus` | Check Wormhole bridge status |
| `bridgeDeBridge` | Cross-chain bridge via deBridge |
| `bridgeDeBridgeStatus` | Check deBridge bridge status |

### NFTPlugin — 19 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/nft`

**metaplex-nft** (9 tools):
| Tool | Description |
|------|-------------|
| `deployCollection` | Create a new NFT collection |
| `mintNFT` | Mint a single NFT |
| `updateMetadata` | Update NFT metadata |
| `verifyCreator` | Verify creator on NFT |
| `verifyCollection` | Verify collection on NFT |
| `setAndVerifyCollection` | Set + verify collection |
| `delegateAuthority` | Delegate authority |
| `revokeAuthority` | Revoke authority |
| `configureRoyalties` | Configure royalty settings |

**3land** (5 tools):
| Tool | Description |
|------|-------------|
| `createCollection` | Create collection on 3Land |
| `mintAndList` | Mint + list for sale |
| `listForSale` | List existing NFT for sale |
| `cancelListing` | Cancel a listing |
| `buyNFT` | Purchase listed NFT |

**das** (5 tools):
| Tool | Description |
|------|-------------|
| `getAsset` | Fetch a digital asset |
| `getAssetsByOwner` | Assets owned by wallet |
| `getAssetsByCreator` | Assets by creator |
| `getAssetsByCollection` | Assets in collection |
| `searchAssets` | Search with filters |

### DeFiPlugin — 43 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/defi`

**pump** (2): `launchToken`, `trade`
**raydium-pools** (5): `createCPMM`, `createCLMM`, `createAMMv4`, `addLiquidity`, `removeLiquidity`
**orca** (5): `getWhirlpool`, `swap`, `openPosition`, `closePosition`, `collectFees`
**manifest** (4): `createMarket`, `placeLimitOrder`, `cancelOrder`, `getOrderbook`
**meteora** (5): `createDynamicPool`, `createDLMMPool`, `addDLMMLiquidity`, `removeDLMMLiquidity`, `createAlphaVault`
**openbook** (3): `createMarket`, `placeOrder`, `cancelOrder`
**drift** (7): `deposit`, `withdraw`, `openPerpPosition`, `closePerpPosition`, `getPositions`, `lend`, `borrow`
**adrena** (5): `openPosition`, `closePosition`, `addCollateral`, `removeCollateral`, `getPositions`
**lulo** (4): `deposit`, `withdraw`, `getBestRates`, `getPositions`
**jito** (3): `sendBundle`, `getBundleStatus`, `getTipEstimate`

### MiscPlugin — 20 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/misc`

**sns** (3): `registerDomain`, `resolveDomain`, `reverseLookup` — Bonfida .sol domains
**alldomains** (3): `registerDomain`, `resolveDomain`, `getOwnedDomains`
**pyth** (3): `getPrice`, `getPriceHistory`, `listPriceFeeds` — real-time oracle prices
**coingecko** (6): `getTokenPrice`, `getTrending`, `getTopGainersLosers`, `getTokenInfo`, `getPoolsByToken`, `getOHLCV`
**gibwork** (3): `createBounty`, `listBounties`, `submitWork`
**send-arcade** (2): `listGames`, `playGame`

### BlinksPlugin — 6 tools

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/blinks`

| Tool | Description |
|------|-------------|
| `getAction` | Fetch a Solana Action by URL |
| `executeAction` | Execute an action |
| `confirmAction` | Confirm execution |
| `resolveBlinkUrl` | Resolve shortened blink URL |
| `validateActionsJson` | Validate actions.json |
| `buildActionUrl` | Build a proper action URL |

Pure HTTP — no RPC transport needed.

---

## 14. MCP — Model Context Protocol

Zero-dependency MCP implementation (spec 2024-11-05). Works as both server AND client.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/mcp`

### MCP Server

Exposes your SynapseAgentKit tools to any MCP client (Claude Desktop, Cursor, VS Code, Cline).

```ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(TokenPlugin)
  .use(DeFiPlugin);

// stdio mode (Claude Desktop, Cursor)
const server = new SynapseMcpServer(kit, {
  name: 'synapse-solana',
  version: '2.0.2',
  instructions: 'Solana blockchain tools for AI agents.',
});
await server.start(); // reads stdin, writes stdout

// SSE mode (web clients)
const sseServer = new SynapseMcpServer(kit, {
  transport: 'sse',
  ssePort: 3001,
  ssePath: '/mcp',
});
await sseServer.start(); // HTTP server on port 3001
```

**Claude Desktop config** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "synapse-solana": {
      "command": "npx",
      "args": ["synapse-mcp-server"],
      "env": {
        "SYNAPSE_RPC_URL": "https://us-1-mainnet.oobeprotocol.ai",
        "OOBE_API_KEY": "YOUR_OOBE_API_KEY"
      }
    }
  }
}
```

**Cursor config** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "synapse-solana": {
      "command": "npx",
      "args": ["synapse-mcp-server"],
      "env": {
        "SYNAPSE_RPC_URL": "https://us-1-mainnet.oobeprotocol.ai",
        "OOBE_API_KEY": "YOUR_OOBE_API_KEY"
      }
    }
  }
}
```

### SynapseMcpServer API

| Method | Description |
|--------|-------------|
| `start()` | Start server (stdio or SSE) |
| `stop()` | Graceful shutdown |
| `info()` | Server introspection |

MCP spec dispatch: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `resources/templates/list`, `prompts/list`, `prompts/get`, `ping`, `completion/complete`, `logging/setLevel`.

### MCP Client Bridge

Connect to external MCP servers and import their tools.

```ts
import { McpClientBridge } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const bridge = new McpClientBridge();

// Connect to GitHub MCP server
await bridge.connect({
  id: 'github',
  name: 'GitHub',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN! },
  toolPrefix: 'github_',
});

// Connect to Postgres
await bridge.connect({
  id: 'postgres',
  name: 'PostgreSQL',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-postgres', process.env.DATABASE_URL!],
  toolPrefix: 'pg_',
});

// Connect via SSE
await bridge.connect({
  id: 'custom',
  name: 'Custom MCP',
  transport: 'sse',
  url: 'https://my-mcp-server.com/mcp/sse',
});

// Get tools or use as plugin
const externalTools = bridge.getTools();       // LangChain StructuredTool[]
const plugin = bridge.toPlugin();              // SynapsePlugin
kit.use(plugin);                               // chain into AgentKit

// Direct access
const result = await bridge.callTool('github', 'list_repos', { owner: 'oobe-protocol-labs' });
const resource = await bridge.readResource('postgres', 'postgres://table/users');
```

### McpClientBridge API

| Method | Description |
|--------|-------------|
| `connect(config)` | Connect to an MCP server |
| `disconnect(id)` | Disconnect a server |
| `disconnectAll()` | Disconnect all |
| `getTools()` | All external tools as LangChain |
| `getServerTools(id)` | Tools from specific server |
| `callTool(serverId, name, args)` | Call a tool directly |
| `readResource(serverId, uri)` | Read a resource |
| `toPlugin()` | Convert to SynapsePlugin for `.use()` |
| `getAllStatuses()` | Connection statuses |
| `getAllToolDefinitions()` | Raw tool definitions |

---

## 15. Agent Commerce Gateway

Session management, pricing, validation, and marketplace for agent-to-agent commerce.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/gateway`

```ts
import {
  AgentGateway,
  createAgentGateway,
  AgentSession,
  PricingEngine,
  ResponseValidator,
  ToolMarketplace,
  AgentRegistry,
  createMonetizedTools,
  createMultiProtocolMonetizedTools,
} from '@oobe-protocol-labs/synapse-client-sdk/ai/gateway';
```

### AgentGateway
| Method | Description |
|--------|-------------|
| `createSession(config)` | Create metered session |
| `processRequest(sessionId, request)` | Process request with metering |
| `getSessionInfo(sessionId)` | Session info |
| `revokeSession(sessionId)` | Revoke session |
| `registerTool(def)` | Register tool in marketplace |
| `discoverTools(query)` | Search marketplace |
| `getMetrics()` | Gateway metrics |

### AgentSession
| Method | Description |
|--------|-------------|
| `create(config)` | Create session with TTL + rate limits |
| `validate(sessionId, token)` | Validate session token |
| `consume(sessionId)` | Consume a request from quota |
| `revoke(sessionId)` | Revoke |
| `info(sessionId)` | Session details |
| `cleanup()` | Remove expired sessions |

### PricingEngine
| Method | Description |
|--------|-------------|
| `calculateCost(method, params)` | Calculate cost for a call |
| `registerTier(tier)` | Register pricing tier |
| `getTiers()` | List tiers |
| `getUsage(sessionId)` | Usage stats |
| `estimateBatch(methods)` | Estimate batch cost |

### ResponseValidator
| Method | Description |
|--------|-------------|
| `validate(response, schema)` | Validate response shape |
| `attest(response, privateKey)` | Sign response attestation |
| `verify(response, attestation, publicKey)` | Verify attestation |

### Monetized Tools

```ts
// Create monetized versions of tools with per-call pricing
const monetized = createMonetizedTools(tools, pricingConfig);
const multiProto = createMultiProtocolMonetizedTools(protocolTools, pricingConfig);
```

### Gateway Errors

| Error | Description |
|-------|-------------|
| `GatewayError` | Base gateway error |
| `SessionNotFoundError` | Session ID not found |
| `MaxSessionsError` | Maximum concurrent sessions reached |
| `BudgetExhaustedError` | Session budget depleted |
| `RateLimitExceededError` | Too many requests |
| `SessionExpiredError` | Session TTL expired |
| `CallLimitExceededError` | Call quota exhausted |
| `IntentVerificationError` | Intent signature verification failed |

---

## 16. x402 Payment Protocol

HTTP 402-based micropayment protocol for AI agent commerce.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/gateway` (x402 is part of the gateway module)

```ts
import {
  X402Client,
  X402Paywall,
  FacilitatorClient,
  FacilitatorDiscovery,
  createFacilitator,
  createX402Client,
  encodePaymentHeader,
  decodePaymentHeader,
} from '@oobe-protocol-labs/synapse-client-sdk/ai/gateway';
```

### X402Client (Buyer)
| Method | Description |
|--------|-------------|
| `pay(invoice)` | Pay a 402 invoice |
| `negotiate(offer)` | Negotiate terms |
| `getReceipt(paymentId)` | Get payment receipt |

### X402Paywall (Seller)
| Method | Description |
|--------|-------------|
| `protect(route, price)` | Protect endpoint with 402 |
| `verify(payment)` | Verify incoming payment |
| `middleware()` | Express/Connect middleware |

### FacilitatorDiscovery
| Method | Description |
|--------|-------------|
| `findFacilitatorsByNetwork(network)` | Find facilitators for a network |
| `findGasSponsoredFacilitators()` | Find gas-sponsored facilitators |
| `listKnownFacilitators()` | List all known facilitators |
| `resolveKnownFacilitator(id)` | Resolve by ID |

### Supported Networks & Tokens

| Constant | Description |
|----------|-------------|
| `SOLANA_MAINNET`, `SOLANA_DEVNET` | Solana network IDs |
| `USDC_SOLANA_MAINNET`, `USDC_SOLANA_DEVNET` | USDC on Solana |
| `BASE_MAINNET`, `BASE_SEPOLIA` | Base network IDs |
| `ETHEREUM_MAINNET`, `POLYGON_MAINNET`, `AVALANCHE_MAINNET`, `SEI_MAINNET` | EVM chains |
| `USDC_BASE_MAINNET`, `USDC_ETHEREUM_MAINNET` | USDC on EVM chains |

### x402 Protocol Constants

| Constant | Value |
|----------|-------|
| `X402_STATUS_CODE` | `402` |
| `X402_VERSION` | Protocol version |
| `X402_HEADER_PAYMENT_REQUIRED` | Payment header key |
| `X402_HEADER_PAYMENT_SIGNATURE` | Signature header key |

### Priority Fees & Settlement Timeouts (SAP SDK v0.6.2)

When settling x402 payments on Solana, transactions at base fee can take
35–40 s — exceeding the 30 s timeout many agents impose.

The **SAP SDK** (v0.6.2+) provides priority-fee presets that land settle
txs in ~5–10 s:

```ts
import { FAST_SETTLE_OPTIONS } from "@oobe-protocol-labs/synapse-sap-sdk";
await sapClient.x402.settle(depositor, 1, data, FAST_SETTLE_OPTIONS);
```

> **Timeout guidance for public RPC users**
>
> The public Solana mainnet endpoint (`api.mainnet-beta.solana.com`) is
> rate-limited to ~10 req/s. If you don't have a dedicated RPC (OOBE
> Protocol, Helius, etc.), set your x402 settlement/HTTP timeout to
> **60 seconds** as a safe default. With a dedicated RPC +
> `FAST_SETTLE_OPTIONS`, 30 s is sufficient.

---

## 17. Intents System

Natural language → on-chain action resolution.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/intents`

```ts
import { IntentParser, IntentPlanner, IntentExecutor } from '@oobe-protocol-labs/synapse-client-sdk/ai/intents';
```

| Class | Method | Description |
|-------|--------|-------------|
| `IntentParser` | `parse(text)` | Natural language → structured intent |
| `IntentPlanner` | `plan(intent)` | Intent → execution steps with dependency resolution |
| `IntentExecutor` | `execute(plan)` | Execute planned steps |

### Intent Errors

| Error | Description |
|-------|-------------|
| `IntentError` | Base intent error |
| `CyclicDependencyError` | Circular dependency in plan steps |
| `UnresolvedReferenceError` | Missing dependency reference |
| `BudgetExceededError` | Execution would exceed budget |

---

## 18. SAP — Synapse Agent Protocol (SDK)

On-chain agent registry, discovery, scoring, and validation — built into the Synapse Client SDK.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/sap`

```ts
import {
  SAPDiscovery,
  SAPInstructionBuilder,
  SAPCapabilityRegistry,
  SAPValidator,
  SubnetworkBuilder,
  OnChainPersistenceAdapter,
  computeAgentHealthScore,
  computeNetworkAnalytics,
  deriveAgentPDA,
  deserializeAgentAccount,
  SAP_DEFAULT_PROGRAM_ID,
} from '@oobe-protocol-labs/synapse-client-sdk/ai/sap';
```

| Class / Function | Description |
|------------------|-------------|
| `SAPDiscovery` | Agent discovery — find by capability, protocol, score |
| `SAPInstructionBuilder` | Build SAP program instructions |
| `SAPCapabilityRegistry` | Register and query agent capabilities |
| `SAPValidator` | Validate agent behavior and integrity |
| `SubnetworkBuilder` | Create and manage agent subnetworks |
| `OnChainPersistenceAdapter` | Persist agent state on-chain |
| `computeAgentHealthScore` | Calculate agent health score |
| `computeNetworkAnalytics` | Calculate network-wide analytics |
| `deriveAgentPDA` | Derive agent PDA from wallet |
| `deserializeAgentAccount` | Deserialize on-chain agent account data |
| `serializeRegisterData` / `serializeUpdateData` | Serialize instruction data |
| `pdaToIdentity` | Convert PDA to agent identity |
| `pricingToTier` / `computeCallCost` / `estimateTotalCost` | Cost computation utilities |
| `base58Decode` / `base58Encode` | Base58 encoding/decoding |
| `BorshReader` / `BorshWriter` | Borsh serialization utilities |

### SAP Constants

| Constant | Value |
|----------|-------|
| `SAP_DEFAULT_PROGRAM_ID` | `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ` |
| `SAP_SEED_PREFIX` | PDA seed prefix |
| `SAP_ACCOUNT_DISCRIMINATOR` | Account discriminator bytes |

### SAP Errors

| Error | Description |
|-------|-------------|
| `SAPProgramError` | On-chain program error |
| `SAPDiscoveryError` | Discovery lookup failure |
| `SAPValidationError` | Agent validation failure |

> **For full SAP protocol interaction** (agent registration, memory, escrow, tool publishing), use the dedicated `@synapse-sap/sdk` package. See [§19](#19-sap--on-chain-protocol-via-synapse-sapsdk) below.
>
> **Role-specific guides:** Consumer workflow → [skills/client.md](./skills/client.md) · Merchant workflow → [skills/merchant.md](./skills/merchant.md) · CLI access → [§28](#28-sap-cli--synapse-sap)

---

## 19. SAP — On-Chain Protocol (via `@synapse-sap/sdk`)

> **📚 Full documentation**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs  
> **Program ID**: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`

The **Solana Agent Protocol (SAP)** is a full on-chain protocol for AI agents on Solana. The dedicated `@synapse-sap/sdk` package provides a TypeScript client for all protocol operations.

> **Role-specific deep-dives** for production agents:
> - **Consumer (buyer):** [skills/client.md](./skills/client.md) — discovery, escrow creation, x402 headers, settlement verification, endpoint validation, Zod schema validation, RPC strategy, network normalization, EscrowV2 disputes (§9a), SessionManager (§15a)
> - **Merchant (seller):** [skills/merchant.md](./skills/merchant.md) — agent registration, tool publishing, escrow settlement, memory vault, delegate hot-wallet, attestations, reputation metrics, plugin adapter, PostgreSQL mirror, EscrowV2 CRUD (§11a-c), staking (§11d), subscriptions (§11e), agent lifecycle (§15a)
> - **CLI access:** [§28](#28-sap-cli--synapse-sap) — `synapse-sap` command-line with 10 command groups and 40+ subcommands for full protocol access without writing code

### Installation

```bash
npm i @synapse-sap/sdk @coral-xyz/anchor @solana/web3.js
```

### Quick Start

```ts
import { SapClient } from '@synapse-sap/sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

const provider = AnchorProvider.env();
const client = SapClient.from(provider);

// Register an agent
await client.agent.register({
  name: 'SwapBot',
  description: 'AI-powered multi-DEX swap agent',
  capabilities: [
    { id: 'jupiter:swap', protocolId: 'jupiter', version: '6.0', description: null },
  ],
  pricing: [
    { tierId: 'free', pricePerCall: '0', currency: 'SOL' },
  ],
  protocols: ['jupiter', 'A2A'],
});
```

### Architecture — SapClient Module Tree

```
SapClient
├── .agent          → AgentModule          (register, update, deactivate, reactivate, close)
├── .feedback       → FeedbackModule       (give, update, revoke)
├── .indexing       → IndexingModule       (capability/protocol/tool category indexes)
├── .tools          → ToolsModule          (publish, inscribe, update, deactivate, checkpoints)
├── .vault          → VaultModule          (init, sessions, inscribe, delegate, encrypt)
├── .escrow         → EscrowModule         (⚠️ DEPRECATED — use escrowV2)
├── .escrowV2       → EscrowV2Module       (create, deposit, settle, withdraw, close, disputes) [v0.7.0]
├── .receipt        → ReceiptModule        (inscribeReceiptBatch, submitReceiptProof, autoResolveDispute) [v0.8.0]
├── .staking        → StakingModule        (initStake, deposit, requestUnstake, completeUnstake) [v0.7.0]
├── .subscription   → SubscriptionModule   (create, fund, cancel, close) [v0.7.0]
├── .attestation    → AttestationModule    (create, revoke)
├── .ledger         → LedgerModule         (init, write, seal, close, fetch pages)
├── .discovery      → DiscoveryRegistry    (findByCapability, findByProtocol, profiles, network overview)
├── .session        → SessionManager       (start, write, read, seal, close — recommended entry point)
├── .x402           → X402Registry         (estimateCost, preparePayment ⚠️, buildPaymentHeaders)
└── .builder        → AgentBuilder         (fluent registration API)
```

### 6 Protocol Layers

| Layer | Purpose | Modules |
|-------|---------|---------|
| **Identity** | Agent registration, lifecycle, reputation metrics | `agent`, `feedback`, `attestation` |
| **Memory** | Conversation storage — ring buffer (Ledger) or encrypted (Vault) | `ledger`, `vault`, `session` |
| **Reputation** | On-chain feedback (0–1000 score → 0–10000 aggregate), attestations, trust signals | `feedback`, `attestation` |
| **Commerce** | x402 micropayment escrow — SOL & SPL token, volume curves, V2 settlement security, receipt-based disputes, staking, subscriptions | `escrow` (⚠️), `escrowV2`, `receipt`, `staking`, `subscription`, `x402` |
| **Tools** | On-chain tool descriptors with schema hashing, versioning | `tools` |
| **Discovery** | Capability/protocol indexes, agent profiles, network overview | `discovery`, `indexing` |

### V2.1 Imports Reference (v0.7.0)

```ts
import {
  SapClient,
  // V2.1 Enums
  SettlementSecurity,   // SelfReport (deprecated) | CoSigned | DisputeWindow
  DisputeOutcome,       // Pending | AutoReleased | DepositorWins | AgentWins | PartialRefund | Split
  DisputeType,          // NonDelivery=0 | PartialDelivery=1 | Overcharge=2 | Quality=3
  ResolutionLayer,      // Pending | Auto | Governance
  BillingInterval,      // Weekly | Monthly | Quarterly | Yearly
  // V2.1 PDA Derivers
  deriveEscrowV2,
  derivePendingSettlement,
  deriveDispute,
  deriveReceiptBatch,   // v0.8.0 — receipt batch PDA
  deriveStake,
  deriveSubscription,
  deriveShard,
  deriveIndexPage,
  // V1 (⚠️ DEPRECATED)
  deriveEscrow,         // → use deriveEscrowV2
} from '@synapse-sap/sdk';

import type {
  // V2.1 Account Data
  EscrowAccountV2Data,
  PendingSettlementData,
  DisputeRecordData,
  AgentStakeData,
  SubscriptionData,
  CounterShardData,
  IndexPageData,
  // V2.1 Instruction Args
  CreateEscrowV2Args,
  CreateSubscriptionArgs,
  // V1 (⚠️ DEPRECATED)
  EscrowAccountData,    // → use EscrowAccountV2Data
  CreateEscrowArgs,     // → use CreateEscrowV2Args
} from '@synapse-sap/sdk';
```

### All PDA Derivation Functions (v0.7.0)

| Function | Seeds | Description | Version |
|----------|-------|-------------|---------|
| `deriveAgent(wallet)` | `["agent", wallet]` | Agent account | v0.1 |
| `deriveAgentStats(agentPda)` | `["agent_stats", agentPda]` | Performance metrics | v0.1 |
| `deriveEscrow(agentPda, depositor)` | `["escrow", agentPda, depositor]` | **⚠️ DEPRECATED** V1 escrow | v0.1 |
| `deriveEscrowV2(agentPda, depositor, nonce)` | `["sap_escrow_v2", agentPda, depositor, nonce]` | V2 escrow with nonce | v0.7.0 |
| `derivePendingSettlement(escrowV2Pda, nonce)` | `["sap_pending", escrowV2Pda, nonce]` | Pending settlement | v0.7.0 |
| `deriveDispute(pendingPda)` | `["sap_dispute", pendingPda]` | Dispute record | v0.7.0 |
| `deriveStake(agentPda)` | `["sap_stake", agentPda]` | Agent stake | v0.7.0 |
| `deriveSubscription(agentPda, subscriber, subId)` | `["sap_sub", agentPda, subscriber, subId]` | Subscription | v0.7.0 |
| `deriveShard(basePda, shardId)` | `["sap_shard", basePda, shardId]` | Counter shard | v0.7.0 |
| `deriveIndexPage(indexPda, page)` | `["sap_page", indexPda, page]` | Index page | v0.7.0 |
| `deriveFeedback(agentPda, reviewer)` | `["feedback", agentPda, reviewer]` | Rating | v0.1 |
| `deriveTool(agentPda, hash)` | `["tool_descriptor", agentPda, hash]` | Tool metadata | v0.1 |
| `deriveVault(agentPda)` | `["memory_vault", agentPda]` | Encrypted memory | v0.1 |
| `deriveAttestation(agentPda, attester)` | `["agent_attestation", agentPda, attester]` | Trust attestation | v0.1 |
| `deriveCapabilityIndex(capHash)` | `["capability_index", hash]` | Discovery index | v0.1 |
| `deriveProtocolIndex(protoHash)` | `["protocol_index", hash]` | Discovery index | v0.1 |
| `deriveToolCategoryIndex(cat)` | `["tool_category_index", cat]` | Discovery index | v0.1 |

---

### Agent Lifecycle

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/03-agent-lifecycle.md

#### Registration (Direct)

```ts
await client.agent.register({
  name: 'SwapBot',
  description: 'Multi-DEX swap agent',
  capabilities: [
    { id: 'jupiter:swap', protocolId: 'jupiter', version: '6.0', description: null },
    { id: 'raydium:swap', protocolId: 'raydium', version: '2.0', description: null },
  ],
  pricing: [
    { tierId: 'basic', pricePerCall: '1000000', currency: 'SOL' },
  ],
  protocols: ['jupiter', 'raydium', 'A2A'],
});
```

#### Registration (Fluent Builder)

```ts
await client.builder
  .agent('SwapBot')
  .description('Multi-DEX swap agent')
  .addCapability('jupiter:swap', { protocolId: 'jupiter', version: '6.0' })
  .addCapability('raydium:swap', { protocolId: 'raydium', version: '2.0' })
  .addPricingTier({ tierId: 'basic', pricePerCall: '1000000', currency: 'SOL' })
  .addProtocol('jupiter')
  .addProtocol('raydium')
  .register();
```

#### Lifecycle Operations

```ts
// Update agent metadata
await client.agent.update({ description: 'Updated description' });

// Deactivate (still discoverable but marked inactive)
await client.agent.deactivate();

// Reactivate
await client.agent.reactivate();

// Self-report metrics — REMOVED in v0.7
// await client.agent.reportCalls(100);           // ❌ Removed — use receipt batches
// await client.agent.updateReputation(150, 9950); // ❌ Removed — abuse vector

// Fetch agent data
const data = await client.agent.fetch();
const stats = await client.agent.fetchStats();
const global = await client.agent.fetchGlobalRegistry();

// Close agent permanently (reclaim rent)
await client.agent.close();
```

---

### Memory Systems — SessionManager (Recommended)

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/04-memory-systems.md

The **SessionManager** (`client.session`) is the recommended entry point for all memory operations. It orchestrates vault creation, session opening, ledger initialization, writing, sealing, and closing in the correct order.

#### Recommended Workflow

```ts
const session = client.session;

// 1. Start — creates vault + session + ledger as needed
const ctx = await session.start('conversation-001');

// 2. Write messages to ring buffer + TX log
await session.write(ctx, 'User: swap 10 SOL to USDC');
await session.write(ctx, 'Agent: executing via Jupiter…');

// 3. Read back latest entries from ring buffer
const entries = await session.readLatest(ctx);

// 4. Seal ring buffer into permanent archive page
await session.seal(ctx);

// 5. Close when conversation is finished (reclaim rent)
await session.close(ctx);
```

#### Two Memory Backends

| Feature | Ledger (Recommended) | Vault (Legacy) |
|---------|---------------------|----------------|
| Storage | Ring buffer (4 KB) + TX log | TX log only (encrypted AES-256-GCM) |
| On-chain rent | ~0.032 SOL per ledger | ~0 (data in logs) |
| Per-write cost | ~0.000005 SOL | ~0.000005 SOL |
| Queryable from RPC | Yes (ring buffer) | No (parse TX history) |
| Best for | Active memory, read-back needed | Permanent write-once encrypted records |

#### Best Practices

- **Always seal before closing** — unsaved ring buffer data is lost if you close without sealing
- **Monitor ring buffer utilization** — seal proactively when >80% full
- **Use SessionManager** — avoid manual vault/session/ledger orchestration

```ts
// ✅ Correct order
await session.seal(ctx);   // ring buffer → permanent LedgerPage
await session.close(ctx);  // reclaim rent

// ❌ Data loss risk
await session.close(ctx);  // ring buffer data lost if not sealed
```

---

### x402 Escrow Payments

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/05-x402-payments.md

#### V2 Escrow (v0.7.0 — Preferred)

V2 escrows introduce **settlement security modes**, **disputes**, **staking**, and **subscriptions**.

```ts
import { SettlementSecurity, BillingInterval } from '@synapse-sap/sdk';

// Create V2 escrow with settlement security
await client.escrowV2.create(agentWallet, {
  deposit: new BN(1_000_000),
  pricePerCall: new BN(10_000),
  maxCalls: new BN(100),
  expiresAt: new BN(Math.floor(Date.now() / 1000) + 3600),
  settlementSecurity: SettlementSecurity.DisputeWindow, // or .CoSigned
  // NOTE: .SelfReport is deprecated in v0.7 and returns an error
});

// Deposit more funds
await client.escrowV2.deposit(agentWallet, new BN(500_000));

// Agent settles calls (creates PendingSettlement for CoSigned mode)
await client.escrowV2.settleCalls(depositorWallet, {
  callsToSettle: 5,
  serviceData: "batch-query",
});

// Withdraw unused funds
await client.escrowV2.withdraw(agentWallet, new BN(200_000));

// Close escrow
await client.escrowV2.close(agentWallet);
```

#### Staking (v0.7.0)

```ts
// Agent stakes SOL to unlock higher-tier escrow modes
await client.staking.initStake(agentWallet, new BN(1_000_000_000));
await client.staking.deposit(agentWallet, new BN(500_000_000));
await client.staking.requestUnstake(agentWallet, new BN(500_000_000));
await client.staking.completeUnstake(agentWallet);
```

#### Subscriptions (v0.7.0)

```ts
// Recurring payment subscription
await client.subscription.create(agentWallet, {
  subId: 1,
  amount: new BN(100_000),
  interval: BillingInterval.Monthly,
});
await client.subscription.fund(agentWallet, 1, new BN(100_000));
await client.subscription.cancel(agentWallet, 1);
await client.subscription.close(agentWallet, 1);
```

#### V1 Escrow (⚠️ DEPRECATED)

> **⚠️ v0.7.0:** `client.escrow` and `client.x402.preparePayment()` create V1 escrows.
> Use `client.escrowV2` for new integrations. V1 escrows lack settlement security,
> disputes, and staking.

#### Consumer Flow (Paying for Agent Services)

> **⚠️ v0.7.0:** `preparePayment()` creates a V1 escrow. For new integrations,
> use `client.escrowV2.create()` + `client.escrowV2.deposit()` instead.
> See V2 Escrow section above.

```ts
// 1. Estimate cost
const cost = await client.x402.estimateCost(agentPubkey, 10); // 10 calls

// 2. Prepare payment (creates escrow)
const payment = await client.x402.preparePayment(agentPubkey, {
  amount: cost,
  currency: 'SOL',
  expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour
});

// 3. Build headers for HTTP requests
const headers = client.x402.buildPaymentHeaders(payment);
// Use these headers when calling the agent's x402-protected endpoint
```

#### Agent Flow (Settling Payments)

> **⚠️ v0.7.0:** `client.escrow.settle()` and `batchSettle()` are V1 methods.
> For new integrations, use `client.escrowV2.settleCalls()` instead.

```ts
// ⚠️ V1 API — DEPRECATED. Use client.escrowV2.settleCalls() for V2.
// Settle after serving N calls
await client.escrow.settle(depositorPubkey, 5, serviceHash);

// Batch settlement — up to 10 in one TX
await client.escrow.batchSettle(depositorPubkey, settlements);
```

#### Volume Curves

> **⚠️ V1-only feature.** Volume curves are supported only in V1 escrows
> (`client.escrow.create()`). V2 escrows use a flat `pricePerCall` model.
> If you need volume discounts with V2, implement tiered pricing in your
> agent’s off-chain logic.

V1 escrow supports pricing curves with up to 5 breakpoints for volume discounts:

```ts
// ⚠️ V1 API — DEPRECATED
await client.escrow.create({
  agent: agentPubkey,
  amount: new BN(10_000_000_000), // 10 SOL
  pricingCurve: [
    { callThreshold: 0,    pricePerCall: new BN(100_000_000) },  // 0.1 SOL/call
    { callThreshold: 100,  pricePerCall: new BN(80_000_000) },   // 0.08 SOL/call
    { callThreshold: 1000, pricePerCall: new BN(50_000_000) },   // 0.05 SOL/call
  ],
  expiresAt: new BN(Math.floor(Date.now() / 1000) + 3600),
});
```

---

### Discovery & Indexing

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/06-discovery-indexing.md

#### High-Level Queries (DiscoveryRegistry)

```ts
// Find agents by capability
const agents = await client.discovery.findAgentsByCapability('jupiter:swap');

// Find agents by protocol
const a2aAgents = await client.discovery.findAgentsByProtocol('A2A');

// Multi-capability search (deduplicated)
const swapAgents = await client.discovery.findAgentsByCapabilities([
  'jupiter:swap', 'raydium:swap', 'orca:swap',
]);

// Find tools by category
const swapTools = await client.discovery.findToolsByCategory('Swap');

// Get full agent profile
const profile = await client.discovery.getAgentProfile(agentWallet);
if (profile) {
  console.log(profile.identity.name);
  console.log(profile.computed.reputationScore);  // 0–1000
  console.log(profile.computed.hasX402);           // boolean
  console.log(profile.computed.protocols);         // string[]
}

// Network overview
const overview = await client.discovery.getNetworkOverview();
console.log(`Agents: ${overview.totalAgents}, Active: ${overview.activeAgents}`);
console.log(`Tools: ${overview.totalTools}, Vaults: ${overview.totalVaults}`);
```

#### Low-Level Index Management (IndexingModule)

```ts
// Capability indexes
await client.indexing.initCapabilityIndex('jupiter:swap');
await client.indexing.addToCapabilityIndex('jupiter:swap');
await client.indexing.removeFromCapabilityIndex('jupiter:swap');

// Protocol indexes
await client.indexing.initProtocolIndex('jupiter');
await client.indexing.addToProtocolIndex('jupiter');

// Tool category indexes
import { TOOL_CATEGORY_VALUES } from '@synapse-sap/sdk';
await client.indexing.initToolCategoryIndex(TOOL_CATEGORY_VALUES.Swap);
await client.indexing.addToToolCategory(TOOL_CATEGORY_VALUES.Swap, toolPda);
```

#### Tool Categories

| Name | Value | Description |
|------|-------|-------------|
| `Swap` | `0` | Token swap tools |
| `Lend` | `1` | Lending protocol tools |
| `Stake` | `2` | Staking tools |
| `Nft` | `3` | NFT-related tools |
| `Payment` | `4` | Payment processing |
| `Data` | `5` | Data retrieval / oracles |
| `Governance` | `6` | DAO governance tools |
| `Bridge` | `7` | Cross-chain bridge tools |
| `Analytics` | `8` | Analytics / reporting |
| `Custom` | `9` | User-defined category |

---

### Tool Registry

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/07-tools-schemas.md

> **⚠ On-chain constraint: tool name max 32 chars** (NOT 64). Exceeding → `ToolNameTooLong` (6048).
> Always use `publishByName()` (auto-hashes). Always inscribe ALL 3 schema types.

Publish on-chain tool descriptors with schema hashing and version tracking:

```ts
import { HTTP_METHOD_VALUES, TOOL_CATEGORY_VALUES } from '@synapse-sap/sdk';

// Publish a tool descriptor (toolName max 32 chars!)
await client.tools.publishByName(
  'jupiterSwap',                                    // toolName (max 32 chars)
  'jupiter',                                        // protocolId
  'Execute a token swap via Jupiter aggregator',     // description
  JSON.stringify(inputSchema),                       // inputSchema (JSON string)
  JSON.stringify(outputSchema),                      // outputSchema (JSON string)
  HTTP_METHOD_VALUES.Post,                           // httpMethod
  TOOL_CATEGORY_VALUES.Swap,                         // category
  4,                                                 // paramsCount
  3,                                                 // requiredParams
  false,                                             // isCompound
);

// Inscribe full schema into TX logs (zero rent, permanent)
await client.tools.inscribeSchema('jupiterSwap', {
  schemaType: 0,  // 0 = input, 1 = output, 2 = description
  schemaData: Buffer.from(inputSchemaJson),
  schemaHash: hashToArray(sha256(inputSchemaJson)),
  compression: 0,
});

// Update, deactivate, reactivate, close
await client.tools.update('jupiterSwap', { paramsCount: 5 });
await client.tools.deactivate('jupiterSwap');
await client.tools.reactivate('jupiterSwap');
// await client.tools.reportInvocations('jupiterSwap', 100); // ❌ Removed in v0.7
```

#### Complete Publish + Inscribe Pipeline (v0.6.2)

> **⚠ Many agents publish tools but never inscribe schemas.** This makes
> tools invisible to schema-aware discovery and prevents AI agents from
> auto-composing pipelines. Always inscribe all 3 schema types.

```ts
import { SchemaType, CompressionType, sha256, hashToArray } from '@synapse-sap/sdk';

// ── 1. Define schemas ─────────────────────────────
const inputSchema = JSON.stringify({
  type: 'object',
  properties: {
    inputMint:  { type: 'string', description: 'Source token mint' },
    outputMint: { type: 'string', description: 'Target token mint' },
    amount:     { type: 'number', description: 'Amount in lamports' },
  },
  required: ['inputMint', 'outputMint', 'amount'],
});
const outputSchema = JSON.stringify({
  type: 'object',
  properties: {
    txSignature: { type: 'string' },
    outputAmount: { type: 'number' },
  },
});
const description = 'Execute a token swap via Jupiter aggregator';

// ── 2. Publish the tool ───────────────────────────
await client.tools.publishByName(
  'jupiterSwap', 'jupiter', description,
  inputSchema, outputSchema,
  HTTP_METHOD_VALUES.Post, TOOL_CATEGORY_VALUES.Swap,
  3, 3, false,
);

// ── 3. Inscribe all 3 schemas (zero rent, permanent) ──
for (const [type, data] of [
  [SchemaType.Input, inputSchema],
  [SchemaType.Output, outputSchema],
  [SchemaType.Description, description],
] as const) {
  await client.tools.inscribeSchema('jupiterSwap', {
    schemaType: type,
    schemaData: Buffer.from(data),
    schemaHash: hashToArray(sha256(data)),
    compression: CompressionType.None,
  });
}
```

#### Tool Analytics & Invocation Tracking (v0.6.2)

```ts
// ❌ report_tool_invocations removed in v0.7 — tool usage now tracked via receipt batches
// await client.tools.reportInvocations('jupiterSwap', 1);

// Fetch tool analytics
const [agentPda] = deriveAgent(wallet);
const tools = await client.program.account.toolDescriptor.all([
  { memcmp: { offset: 9, bytes: agentPda.toBase58() } },
]);

for (const { account: t } of tools) {
  const hasSchema = !t.inputSchemaHash.every(b => b === 0)
                 && !t.outputSchemaHash.every(b => b === 0);
  console.log(`${t.toolName}: ${t.totalInvocations} invocations, schema: ${hasSchema ? '✓' : '✗'}`);
}

// AgentStats — authoritative call counter (updated by settlements)
const [statsPda] = deriveAgentStats(agentPda);
const stats = await client.program.account.agentStats.fetch(statsPda);
console.log('Total calls served:', stats.totalCallsServed.toString());
```

#### Consumer: Evaluate Agent Tool Quality (v0.6.2)

```ts
// Before committing funds, check the agent's tool schema completeness
const tools = await client.program.account.toolDescriptor.all([
  { memcmp: { offset: 9, bytes: agentPda.toBase58() } },
]);

const withSchema = tools.filter(({ account: t }) =>
  !t.inputSchemaHash.every(b => b === 0) && !t.outputSchemaHash.every(b => b === 0)
);
console.log(`${withSchema.length}/${tools.length} tools have schemas`);

// Retrieve inscribed schema from TX logs
const eventParser = new EventParser(client.program);
const sigs = await connection.getSignaturesForAddress(toolPda, { limit: 50 });
for (const { signature } of sigs) {
  const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
  if (!tx?.meta?.logMessages) continue;
  const events = eventParser.parseLogs(tx.meta.logMessages);
  for (const e of events) {
    if (e.name === 'ToolSchemaInscribedEvent') {
      const types = ['input', 'output', 'description'];
      console.log(`Schema [${types[e.data.schemaType]}]:`, Buffer.from(e.data.schemaData).toString());
    }
  }
}
```

> **Full details:** [merchant.md §8b — Tool Schema Pipeline](./skills/merchant.md#8b-tool-schema-inscription--complete-pipeline-v062) |
> [merchant.md §8c — Tool Analytics](./skills/merchant.md#8c-tool-analytics--invocation-tracking-v062) |
> [merchant.md §8d — ToolInput Interface](./skills/merchant.md#8d-toolinput-interface-reference-builder-pattern) |
> [merchant.md §8e — Tool Error Codes](./skills/merchant.md#8e-tool-error-codes-reference) |
> [merchant.md §8f — Tool Events](./skills/merchant.md#8f-tool-events-reference) |
> [merchant.md §8g — On-Chain Constraints](./skills/merchant.md#8g-on-chain-constraints--limits) |
> [merchant.md §8h — Mandatory Schema Checklist](./skills/merchant.md#8h-mandatory-schema-registration--complete-merchant-checklist) |
> [client.md §16b — Schema Discovery](./skills/client.md#16b-tool-schema-discovery--validation-v062) |
> [client.md §16c — Consumer Analytics](./skills/client.md#16c-agent--tool-analytics-for-consumers-v062)
>
> **V2.1 Commerce details:** [merchant.md §11a — EscrowV2 CRUD](./skills/merchant.md#11a-escrowv2-complete-crud) |
> [merchant.md §11b — Dispute Resolution + Receipt Layer (v0.8.0)](./skills/merchant.md#11b-dispute-resolution-flow-v080) |
> [merchant.md §11c — V1→V2 Migration](./skills/merchant.md#11c-v1v2-escrow-migration) |
> [merchant.md §11d — Staking](./skills/merchant.md#11d-staking-complete-reference) |
> [merchant.md §11e — Subscriptions](./skills/merchant.md#11e-subscriptions-complete-reference) |
> [merchant.md §15a — Agent Lifecycle](./skills/merchant.md#15a-agent-lifecycle-deactivate-reactivate-close) |
> [client.md §9a — EscrowV2 Disputes (Consumer)](./skills/client.md#9a-escrowv2-disputes--settlements-consumer-side) |
> [client.md §15a — SessionManager](./skills/client.md#15a-sessionmanager--complete-reference)

---

### On-Chain Tool Schemas — Why and How

> **⚠ Many agents publish tools but never inscribe schemas.** Without
> on-chain schemas, AI agents cannot auto-compose pipelines, consumers
> cannot validate request/response formats, and discovery systems cannot
> match tools to intents. **Always inscribe all 3 schema types.**

On-chain schemas are stored permanently in TX logs (zero rent) via
`ToolSchemaInscribedEvent`. The `ToolDescriptor` PDA tracks only the
SHA-256 hash of each schema — the full JSON Schema lives in the TX log.

#### Schema Types

| Type | Value | Purpose | Example |
|------|-------|---------|---------|
| `SchemaType.Input` | `0` | JSON Schema for request body | `{ inputMint, outputMint, amount }` |
| `SchemaType.Output` | `1` | JSON Schema for response body | `{ txSignature, outputAmount }` |
| `SchemaType.Description` | `2` | Human/LLM-readable tool description | `"Execute a token swap via Jupiter"` |

#### How schemas are stored

```
On-chain PDA (ToolDescriptor):
  input_schema_hash:   [u8; 32]  ← SHA-256 of the input JSON Schema
  output_schema_hash:  [u8; 32]  ← SHA-256 of the output JSON Schema
  description_hash:    [u8; 32]  ← SHA-256 of the description string

TX logs (permanent, zero rent):
  ToolSchemaInscribedEvent {
    agent, toolName, schemaType, schemaData, schemaHash, compression
  }
```

#### Merchant: Publish + Inscribe (complete pipeline)

```ts
import { SchemaType, CompressionType, sha256, hashToArray } from '@synapse-sap/sdk';

const inputSchema = JSON.stringify({
  type: 'object',
  properties: {
    inputMint:  { type: 'string', description: 'Source token mint address' },
    outputMint: { type: 'string', description: 'Target token mint address' },
    amount:     { type: 'number', description: 'Amount in lamports' },
    slippage:   { type: 'number', description: 'Max slippage basis points' },
  },
  required: ['inputMint', 'outputMint', 'amount'],
});

const outputSchema = JSON.stringify({
  type: 'object',
  properties: {
    txSignature: { type: 'string' },
    outputAmount: { type: 'number' },
    priceImpact: { type: 'number' },
  },
});

const description = 'Execute a token swap via Jupiter DEX aggregator. Finds optimal route across all Solana DEXs.';

// Step 1: Publish the tool descriptor
await client.tools.publishByName(
  'jupiterSwap', 'jupiter', description,
  inputSchema, outputSchema,
  HTTP_METHOD_VALUES.Post, TOOL_CATEGORY_VALUES.Swap,
  4, 3, false,
);

// Step 2: Inscribe all 3 schemas (MANDATORY for full discoverability)
for (const [type, data] of [
  [SchemaType.Input, inputSchema],
  [SchemaType.Output, outputSchema],
  [SchemaType.Description, description],
] as const) {
  await client.tools.inscribeSchema('jupiterSwap', {
    schemaType: type,
    schemaData: Buffer.from(data),
    schemaHash: hashToArray(sha256(data)),
    compression: CompressionType.None,  // or Deflate/Gzip/Brotli for large schemas
  });
}
// 3 TXs total — each ~0.000005 SOL (TX fee only)
// Schemas are now PERMANENTLY on Solana and retrievable by any consumer
```

#### Consumer: Verify schemas before paying

```ts
const [agentPda] = deriveAgent(agentWallet);
const tools = await client.program.account.toolDescriptor.all([
  { memcmp: { offset: 9, bytes: agentPda.toBase58() } },
]);

for (const { account: t } of tools) {
  const hasInput  = !t.inputSchemaHash.every(b => b === 0);
  const hasOutput = !t.outputSchemaHash.every(b => b === 0);
  const hasDesc   = !t.descriptionHash.every(b => b === 0);
  console.log(`${t.toolName}: input=${hasInput ? '✓' : '✗'} output=${hasOutput ? '✓' : '✗'} desc=${hasDesc ? '✓' : '✗'}`);
}

// Only trust agents with full schemas inscribed
const fullyInscribed = tools.filter(({ account: t }) =>
  !t.inputSchemaHash.every(b => b === 0) && !t.outputSchemaHash.every(b => b === 0)
);
```

#### Consumer: Retrieve schema from TX logs and validate

```ts
import { inflateSync } from 'node:zlib';

const [toolPda] = deriveTool(agentPda, hashToArray(sha256('jupiterSwap')));
const sigs = await connection.getSignaturesForAddress(toolPda, { limit: 50 });

const schemas: Record<number, string> = {};
for (const { signature } of sigs) {
  const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
  if (!tx?.meta?.logMessages) continue;
  const events = client.events.parseLogs(tx.meta.logMessages);
  for (const e of events) {
    if (e.name === 'ToolSchemaInscribedEvent') {
      const raw = Buffer.from(e.data.schemaData);
      schemas[e.data.schemaType] = e.data.compression === 1
        ? inflateSync(raw).toString()
        : raw.toString();
    }
  }
}

// Validate your request against the on-chain schema
import Ajv from 'ajv';
const ajv = new Ajv();
if (schemas[0]) {
  const validate = ajv.compile(JSON.parse(schemas[0]));
  const valid = validate({ inputMint: 'So11...', outputMint: 'EPjF...', amount: 1e9 });
  if (!valid) console.error('Invalid request:', validate.errors);
}
```

> **Deep dive:** [merchant.md §8b](./merchant.md) — full inscription pipeline with compression, CLI commands, builder pattern |
> [client.md §16b](./client.md) — full consumer schema discovery with AJV validation

---

### Feedback & Reputation System

On-chain feedback is the **only way to change an agent's `reputationScore`**.
It's fully trustless — no admin or oracle can modify it.

#### Reputation Score Formula

```
reputationScore = (reputationSum × 10) / totalFeedbacks
```

- Each feedback `score`: **0–1000** (1000 = perfect)
- Aggregate `reputationScore` range: **0–10000** (2 decimal places: 8547 = 85.47%)
- Self-review blocked on-chain (`SelfReviewNotAllowed`)
- One feedback PDA per (agent, reviewer) pair

#### Two Independent Signal Types

| Signal | Who Sets It | Trustless? | Fields |
|--------|------------|-----------|--------|
| **Reputation score** | Other users via `give_feedback` | **Yes** | `reputationScore`, `reputationSum`, `totalFeedbacks` |
| **Self-reported metrics** | ~~Agent owner via `reportCalls`~~ **Removed in v0.7** | **N/A** | `totalCallsServed`, `avgLatencyMs`, `uptimePercent` (legacy) |

> Self-report instructions (`reportCalls`, `updateReputation`, `reportInvocations`)
> were removed in v0.7. Call counts are now tracked via **receipt batches** —
> cryptographically committed merkle roots inscribed on-chain by the agent.

#### Give, Update, Revoke, Close Feedback

```ts
// ── Give feedback (creates FeedbackAccount PDA) ──
await client.feedback.give(agentWallet, {
  score: 850,      // 0-1000
  tag: 'fast',     // max 32 chars
  metadataHash: hashToArray(sha256(JSON.stringify({
    comment: 'Excellent swap execution', latency: 42,
  }))),
});

// ── Update (same reviewer, same agent) ──
await client.feedback.update(agentWallet, { score: 900, tag: 'reliable' });

// ── Revoke (removes score from reputation calculation) ──
await client.feedback.revoke(agentWallet);

// ── Close PDA (must revoke first — reclaims rent) ──
await client.feedback.close(agentWallet);
```

#### Read reputation & feedback data

```ts
// Agent's reputation
const agent = await client.agent.fetch();
console.log('Score:', agent.reputationScore, '/ 10000');
console.log('Feedbacks:', agent.totalFeedbacks);

// Self-reported metrics (treat as claims, NOT trustless)
console.log('Self-reported latency:', agent.avgLatencyMs, 'ms');
console.log('Self-reported uptime:', agent.uptimePercent, '%');

// Scan all feedbacks for an agent
const [agentPda] = deriveAgent(agentWallet);
const feedbacks = await client.program.account.feedbackAccount.all([
  { memcmp: { offset: 9, bytes: agentPda.toBase58() } },
]);
const active = feedbacks.filter(f => !f.account.isRevoked);
for (const { account: f } of active) {
  console.log(`${f.reviewer.toBase58()}: ${f.score}/1000 [${f.tag}]`);
}
```

> **Deep dive:** [merchant.md §18](./merchant.md) — full reputation/feedback lifecycle for sellers |
> [client.md §14a–§14e](./client.md) — consumer feedback guide with scoring heuristics

---

### Attestations (Web of Trust)

Attestations are **institutional trust signals** — not score-based reviews.
They represent identity-level trust from third parties: "OtterSec: code
audited", "Jupiter: API verified", "Solana Foundation: official partner".

Trust comes from **WHO** is attesting (the wallet identity), not from
the attestation content itself. Anyone can create attestations — the value
is in the attester's real-world reputation.

#### PDA & Constraints

```
Seeds: ["sap_attest", agent_pda, attester_wallet]
One attestation per (agent, attester) pair
Self-attestation blocked: attester.key() != agent.wallet
Lifecycle: create → (optional) revoke → close
Must revoke before closing
```

#### Create, Revoke, Close

```ts
// ── Create attestation ──
await client.attestation.create(agentWallet, {
  attestationType: 'audit',          // max 32 chars
  metadataHash: hashToArray(sha256(JSON.stringify({
    auditor: 'OtterSec', report: 'https://...', result: 'pass',
  }))),
  expiresAt: new BN(Math.floor(Date.now() / 1000) + 365 * 86400), // 1 year (0 = never)
});

// ── Revoke (only original attester) ──
await client.attestation.revoke(agentWallet);

// ── Close PDA (must be revoked first — rent returned to attester) ──
await client.attestation.close(agentWallet);
```

#### Read & Verify Attestations

```ts
const [agentPda] = deriveAgent(agentWallet);
const att = await client.attestation.fetchNullable(agentPda, attesterWallet);
if (att && att.isActive) {
  const expired = att.expiresAt > 0 && att.expiresAt < Date.now() / 1000;
  console.log(`${att.attestationType} by ${att.attester.toBase58()} — ${expired ? 'EXPIRED' : 'VALID'}`);
}

// Scan all attestations for an agent
const allAtts = await client.program.account.agentAttestation.all([
  { memcmp: { offset: 9, bytes: agentPda.toBase58() } },
]);
console.log(`${allAtts.filter(a => a.account.isActive).length} active attestations`);
```

#### Common Attestation Types

| Type | Who Attests | Meaning |
|------|------------|---------|
| `"audit"` | Security firms | Code audited |
| `"kyc"` | KYC providers | Identity verified |
| `"api-verified"` | Protocol teams | API integration tested |
| `"community"` | DAOs, power users | Community endorsement |
| `"official-partner"` | Ecosystem partners | Formal partnership |
| `"data-certified"` | Data providers | Data feed quality certified |

> **Deep dive:** [merchant.md §17](./merchant.md) — full attestation lifecycle for agents |
> [client.md §14f–§14g](./client.md) — consumer attestation creation and verification

---

### Delegate System (Hot-Wallet Access)

Delegates let agents authorize a **hot wallet** (server signer) to perform
vault operations without exposing the cold agent owner keypair.

#### Permission Bitmask

| Bit | Value | Permission | Allows |
|-----|-------|-----------|--------|
| 0 | `1` | `INSCRIBE` | Write encrypted memory |
| 1 | `2` | `CLOSE_SESSION` | Close sessions |
| 2 | `4` | `OPEN_SESSION` | Create new sessions |
| — | `7` | `ALL` | Full access |

```ts
import { DelegatePermission } from '@synapse-sap/sdk';

// Add delegate (hot wallet) with inscribe + open permission
await client.vault.addDelegate(
  hotWalletPubkey,
  DelegatePermission.Inscribe | DelegatePermission.OpenSession,  // bitmask = 5
  Math.floor(Date.now() / 1000) + 86400,  // expires in 24h (0 = never)
);

// Inscribe memory via delegate (auth chain: signer → VaultDelegate → Vault → Session)
await client.vault.inscribeDelegated(delegatePubkey, vaultPda, sessionPda, epochPda, args);

// Revoke delegate (immediately, reclaim rent)
await client.vault.revokeDelegate(hotWalletPubkey);
```

> **Deep dive:** [merchant.md §16](./merchant.md) — full delegate lifecycle, hot wallet production pattern, expiry management

---

### Plugin Adapter (LangChain Integration)

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/08-plugin-adapter.md

The SAP SDK provides a plugin that bridges all 52 on-chain SAP tools into the SynapseAgentKit:

```ts
import { SynapseAgentKit } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';

const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({ rpcUrl: 'https://synapse.oobeprotocol.ai' })
  .use(sapPlugin);

const tools = kit.getTools(); // → 52 SAP tools as LangChain StructuredTool[]
```

#### 8 Protocol Domains (52 tools total)

| Domain | ID | Tools | Description |
|--------|----|-------|-------------|
| Agent Identity | `sap-agent` | 8 | Registration, lifecycle, reputation |
| Trustless Reputation | `sap-feedback` | 4 | On-chain feedback (1–5 score) |
| Web of Trust | `sap-attestation` | 3 | Cross-agent attestations |
| x402 Escrow | `sap-escrow` | 6 | Micropayment escrow |
| Tool Registry | `sap-tools` | 7 | Tool schemas, versioning |
| Encrypted Memory Vault | `sap-vault` | 10 | Vault, sessions, delegation |
| Discovery Indexes | `sap-indexing` | 8 | Capability/protocol indexes |
| Unified Memory Ledger | `sap-ledger` | 6 | Ring buffer, sealed pages |

The plugin handles all type conversions automatically (LLM JSON → Solana `PublicKey`, `BN`, `Buffer`).

---

### SAP Error Handling

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/09-best-practices.md

```ts
import {
  SapError,
  SapRpcError,
  SapAccountNotFoundError,
  SapValidationError,
  SapTimeoutError,
  SapPermissionError,
} from '@synapse-sap/sdk/errors';

try {
  await client.agent.register(params);
} catch (err) {
  if (err instanceof SapAccountNotFoundError) {
    console.warn(`Missing ${err.accountType}: ${err.address}`);
  } else if (err instanceof SapValidationError) {
    console.error(`Invalid field "${err.field}": ${err.message}`);
  } else if (err instanceof SapRpcError) {
    console.error(`RPC error ${err.rpcCode}: ${err.message}`);
    err.logs?.forEach((log) => console.debug(log));
  } else if (err instanceof SapError) {
    console.error(`[${err.code}] ${err.message}`);
  } else {
    throw err;
  }
}
```

---

### SAP RPC & Network Configuration

> **📚 Docs**: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/docs/10-rpc-network.md

```ts
import { SapConnection } from '@synapse-sap/sdk';

// Devnet (testing)
const conn = SapConnection.devnet();

// Mainnet with Synapse Gateway (recommended)
const conn = SapConnection.mainnet('https://synapse.oobeprotocol.ai');

// Localnet (local validator)
const conn = SapConnection.localnet();

// One-liner with keypair
const { client } = SapConnection.fromKeypair(
  'https://synapse.oobeprotocol.ai',
  keypair,
);
```

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| **RPC** | `localhost:8899` | `api.devnet.solana.com` | `synapse.oobeprotocol.ai` |
| **Cluster** | `localnet` | `devnet` | `mainnet-beta` |
| **Commitment** | `confirmed` | `confirmed` | `confirmed` / `finalized` |
| **SOL source** | Airdrop | Airdrop | Real SOL |

---

### SAP Cost Optimization

| Operation | Cost |
|-----------|------|
| Ledger init | ~0.032 SOL rent |
| Ledger write | ~0.000005 SOL |
| Ledger seal → LedgerPage | ~0.031 SOL rent |
| Vault inscription | ~0 (data in TX logs) |
| Agent registration | ~0.01 SOL rent |
| Tool descriptor | ~0.005 SOL rent |

**Tips:**
- Prefer **Ledger** over Vault when you need to read data back
- **V2:** Use `client.escrowV2.settleCalls()` to batch-settle (replaces V1 `batchSettle()`)
- ~~V1: Use `client.escrow.batchSettle()` instead of individual `settle()` calls~~ *(deprecated)*
- Close unused accounts to reclaim rent
- Use `SessionManager` (`client.session`) instead of manual vault/session/ledger orchestration

### Merchant Validation (v0.6.4+)

For server-side escrow validation before serving requests, see **§29 Merchant Validation**:

```ts
import { validateEscrowState, SapMerchantValidator, parseX402Headers } from '@oobe-protocol-labs/synapse-sap-sdk';

// Quick one-shot validation
const result = await validateEscrowState(connection, agentWallet, depositorWallet, fetchEscrow);
if (!result.valid) throw new Error(result.errors.join(', '));

// Middleware-style validator (Express/Hono)
const validator = new SapMerchantValidator(connection, agentKeypair);
app.use('/api/ai/*', validator.middleware());
```

---

### Complete Module API Reference (v0.7.0)

Every method below returns `Promise<TransactionSignature>` unless noted otherwise.
All `fetch*` methods return deserialized account data. `fetchNullable` variants return `null` if the account doesn't exist.

#### AgentModule — `client.agent`

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `register(args)` | `RegisterAgentArgs` | `TransactionSignature` | Register new agent on-chain |
| `update(args)` | `UpdateAgentArgs` | `TransactionSignature` | Update agent metadata (partial) |
| `deactivate()` | — | `TransactionSignature` | Set `is_active = false` |
| `reactivate()` | — | `TransactionSignature` | Restore to active |
| `close()` | — | `TransactionSignature` | Close agent + stats PDAs, reclaim rent |
| ~~`reportCalls(count)`~~ | — | — | **REMOVED in v0.7** — use receipt batches |
| ~~`updateReputation(latencyMs, uptimePct)`~~ | — | — | **REMOVED in v0.7** |
| `fetch(wallet?)` | `PublicKey?` | `AgentAccountData` | Fetch agent account |
| `fetchNullable(wallet?)` | `PublicKey?` | `AgentAccountData \| null` | Fetch or null |
| `fetchStats(agentPda)` | `PublicKey` | `AgentStatsData` | Fetch stats |
| `fetchStatsNullable(agentPda)` | `PublicKey` | `AgentStatsData \| null` | Fetch stats or null |
| `fetchGlobalRegistry()` | — | `GlobalRegistryData` | Protocol singleton |
| `deriveAgent(wallet?)` | `PublicKey?` | `[PublicKey, number]` | Derive agent PDA |
| `deriveStats(agentPda)` | `PublicKey` | `[PublicKey, number]` | Derive stats PDA |

#### FeedbackModule — `client.feedback`

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `give(agentWallet, args)` | `PublicKey, GiveFeedbackArgs` | `TransactionSignature` | Leave on-chain feedback |
| `update(agentWallet, args)` | `PublicKey, UpdateFeedbackArgs` | `TransactionSignature` | Update existing feedback |
| `revoke(agentWallet)` | `PublicKey` | `TransactionSignature` | Mark feedback as revoked |
| `close(agentWallet)` | `PublicKey` | `TransactionSignature` | Close revoked feedback, reclaim rent |
| `fetch(agentPda, reviewer?)` | `PublicKey, PublicKey?` | `FeedbackAccountData` | Fetch feedback |
| `fetchNullable(agentPda, reviewer?)` | `PublicKey, PublicKey?` | `FeedbackAccountData \| null` | Fetch or null |

#### ToolsModule — `client.tools`

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `publish(args)` | `PublishToolArgs` | `TransactionSignature` | Publish tool with pre-hashed values |
| `publishByName(name, proto, desc, inSchema, outSchema, method, cat, params, required, compound)` | `string, ...` | `TransactionSignature` | Publish with auto-hashing |
| `inscribeSchema(toolName, args)` | `string, InscribeToolSchemaArgs` | `TransactionSignature` | Store full JSON schema in TX log (0 rent) |
| `update(toolName, args)` | `string, UpdateToolArgs` | `TransactionSignature` | Update tool hashes/metadata |
| `deactivate(toolName)` | `string` | `TransactionSignature` | Mark tool unavailable |
| `reactivate(toolName)` | `string` | `TransactionSignature` | Restore tool |
| `close(toolName)` | `string` | `TransactionSignature` | Close tool PDA |
| ~~`reportInvocations(toolName, count)`~~ | — | — | **REMOVED in v0.7** — use receipt batches |
| `createCheckpoint(toolName, args)` | `string, CreateCheckpointArgs` | `TransactionSignature` | Session checkpoint |
| `fetch(agentPda, toolName)` | `PublicKey, string` | `ToolDescriptorData` | Fetch tool descriptor |
| `fetchNullable(agentPda, toolName)` | `PublicKey, string` | `ToolDescriptorData \| null` | Fetch or null |

#### VaultModule — `client.vault`

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `initVault(nonce)` | `number[]` | `TransactionSignature` | Create encrypted memory vault |
| `openSession(sessionHash)` | `number[]` | `TransactionSignature` | Open new session |
| `inscribe(args)` | `InscribeMemoryArgs` | `TransactionSignature` | Write encrypted data to TX log |
| `inscribeWithAccounts(session, epoch, vault, args)` | `PublicKey, PublicKey, PublicKey, InscribeMemoryArgs` | `TransactionSignature` | Inscribe with explicit accounts |
| `compactInscribe(session, vault, args)` | `PublicKey, PublicKey, CompactInscribeArgs` | `TransactionSignature` | Simplified single-fragment write |
| `closeSession(vault, session)` | `PublicKey, PublicKey` | `TransactionSignature` | Close session |
| `closeVault()` | — | `TransactionSignature` | Close vault, reclaim rent |
| `closeSessionPda(vault, session)` | `PublicKey, PublicKey` | `TransactionSignature` | Close session PDA |
| `closeEpochPage(session, epochIdx)` | `PublicKey, number` | `TransactionSignature` | Close epoch page |
| `addDelegate(delegateWallet, expiresAt)` | `PublicKey, BN \| null` | `TransactionSignature` | Add hot-wallet delegate |
| `revokeDelegate(delegateWallet)` | `PublicKey` | `TransactionSignature` | Revoke delegate |
| `rotateNonce(newNonce)` | `number[]` | `TransactionSignature` | Rotate encryption nonce |
| `fetch(agentPda)` | `PublicKey` | `MemoryVaultData` | Fetch vault |
| `fetchSession(vault, sessionHash)` | `PublicKey, Uint8Array` | `SessionLedgerData` | Fetch session |
| `fetchEpochPage(session, epochIdx)` | `PublicKey, number` | `EpochPageData` | Fetch epoch page |
| `fetchDelegate(agent, delegate)` | `PublicKey, PublicKey` | `VaultDelegateData` | Fetch delegate |

#### LedgerModule — `client.ledger`

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `init(sessionPda)` | `PublicKey` | `TransactionSignature` | Create ledger with 4KB ring buffer (~0.032 SOL) |
| `write(sessionPda, data, contentHash)` | `PublicKey, Buffer, number[]` | `TransactionSignature` | Write data (~0.000005 SOL) |
| `seal(sessionPda)` | `PublicKey` | `TransactionSignature` | Seal ring buffer → LedgerPage (~0.031 SOL) |
| `close(sessionPda)` | `PublicKey` | `TransactionSignature` | Close ledger, reclaim rent |
| `fetchLedger(sessionPda)` | `PublicKey` | `MemoryLedgerData` | Fetch ledger |
| `fetchLedgerNullable(sessionPda)` | `PublicKey` | `MemoryLedgerData \| null` | Fetch or null |
| `fetchPage(ledgerPda, pageIdx)` | `PublicKey, number` | `LedgerPageData` | Fetch sealed page |
| `decodeLedgerEntries(ledger)` | `MemoryLedgerData` | `LedgerEntry[]` | Decode ring buffer entries |

#### EscrowV2Module — `client.escrowV2` (v0.7.0)

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `create(agentWallet, args, splAccounts?)` | `PublicKey, CreateEscrowV2Args, AccountMeta[]?` | `TransactionSignature` | Create V2 escrow |
| `deposit(agentWallet, nonce, amount, splAccounts?)` | `PublicKey, BN, BN, AccountMeta[]?` | `TransactionSignature` | Top up escrow |
| `settle(depositor, nonce, calls, serviceHash, splAccounts?, opts?)` | `PublicKey, BN, BN, number[], ...` | `TransactionSignature` | SelfReport settle (agent-side) |
| `createPendingSettlement(agent, depositor, nonce, settlementIdx, calls, amount, serviceHash, receiptMerkleRoot?)` | `...PublicKey, ...BN, number[], number[]?` | `TransactionSignature` | Dispute-window settlement (v0.7: +receiptMerkleRoot) |
| `finalizeSettlement(agent, depositor, nonce, settlementIdx)` | `...PublicKey, ...BN` | `TransactionSignature` | Finalize after dispute window |
| `fileDispute(agentWallet, nonce, settlementIdx, evidenceHash, disputeType?)` | `PublicKey, BN, BN, number[], number?` | `TransactionSignature` | Depositor files dispute (v0.7: +disputeType) |
| ~~`resolveDispute(...)`~~ | — | — | **REMOVED in v0.7** — use `client.receipt.autoResolveDispute` |
| `closeDispute(pendingPda)` | `PublicKey` | `TransactionSignature` | Close resolved dispute PDA |
| `closePendingSettlement(pendingPda)` | `PublicKey` | `TransactionSignature` | Close finalized pending PDA |
| `withdraw(agentWallet, nonce, amount)` | `PublicKey, BN, BN` | `TransactionSignature` | Withdraw from escrow |
| `close(agentWallet, nonce?)` | `PublicKey, BN?` | `TransactionSignature` | Close empty escrow |
| ~~`migrateFromV1(agentWallet)`~~ | — | — | **REMOVED in v0.7** — migration instruction deleted |
| `fetch(agentPda, depositor?, nonce?)` | `PublicKey, PublicKey?, BN?` | `EscrowAccountV2Data` | Fetch V2 escrow |
| `fetchNullable(...)` | same as fetch | `EscrowAccountV2Data \| null` | Fetch or null |
| `fetchPendingSettlement(pda)` | `PublicKey` | `PendingSettlementData` | Fetch pending settlement |
| `fetchPendingSettlementNullable(pda)` | `PublicKey` | `PendingSettlementData \| null` | Fetch or null |
| `fetchDispute(pda)` | `PublicKey` | `DisputeRecordData` | Fetch dispute record |
| `fetchDisputeNullable(pda)` | `PublicKey` | `DisputeRecordData \| null` | Fetch or null |

#### ReceiptModule — `client.receipt` (v0.8.0)

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `inscribeReceiptBatch(depositor, nonce, batchIdx, merkleRoot, callCount, periodStart, periodEnd)` | `PublicKey, BN, number, number[], BN, BN, BN` | `TransactionSignature` | Agent commits receipt merkle root |
| `submitReceiptProof(depositor, nonce, settlementIdx, batchIdx, provenCount, proof, leaf)` | `PublicKey, BN, BN, number, BN, number[][], number[]` | `TransactionSignature` | Agent proves delivery via merkle inclusion |
| `autoResolveDispute(agentWallet, depositor, nonce, settlementIdx)` | `PublicKey, PublicKey, BN, BN` | `TransactionSignature` | Permissionless crank — proportional resolution |
| `fetchReceiptBatch(escrowV2Pda, batchIdx)` | `PublicKey, number` | `ReceiptBatchData` | Fetch receipt batch |
| `fetchReceiptBatchNullable(escrowV2Pda, batchIdx)` | `PublicKey, number` | `ReceiptBatchData \| null` | Fetch or null |

#### StakingModule — `client.staking` (v0.7.0)

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `initStake(agentWallet, amount)` | `PublicKey, BN` | `TransactionSignature` | Initialize stake (collateral, not yield) |
| `deposit(agentWallet, amount)` | `PublicKey, BN` | `TransactionSignature` | Add to existing stake |
| `requestUnstake(agentWallet, amount)` | `PublicKey, BN` | `TransactionSignature` | Begin cooldown-gated unstake |
| `completeUnstake(agentWallet)` | `PublicKey` | `TransactionSignature` | Withdraw after cooldown |
| `fetch(agentPda)` | `PublicKey` | `AgentStakeData` | Fetch stake |
| `fetchNullable(agentPda)` | `PublicKey` | `AgentStakeData \| null` | Fetch or null |

#### SubscriptionModule — `client.subscription` (v0.7.0)

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `create(agentWallet, args)` | `PublicKey, CreateSubscriptionArgs` | `TransactionSignature` | Create recurring subscription |
| `fund(agentWallet, subId, amount)` | `PublicKey, BN, BN` | `TransactionSignature` | Top up subscription balance |
| `cancel(agentWallet, subId?)` | `PublicKey, BN?` | `TransactionSignature` | Cancel subscription |
| `close(agentWallet, subId?)` | `PublicKey, BN?` | `TransactionSignature` | Close cancelled subscription PDA |
| `fetch(agentPda, subscriber?, subId?)` | `PublicKey, PublicKey?, BN?` | `SubscriptionData` | Fetch subscription |
| `fetchNullable(...)` | same as fetch | `SubscriptionData \| null` | Fetch or null |

#### AttestationModule — `client.attestation`

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `create(agentWallet, args)` | `PublicKey, CreateAttestationArgs` | `TransactionSignature` | Vouch for an agent (web-of-trust) |
| `revoke(agentWallet)` | `PublicKey` | `TransactionSignature` | Revoke attestation |
| `close(agentWallet)` | `PublicKey` | `TransactionSignature` | Close revoked attestation PDA |
| `fetch(agentPda, attester?)` | `PublicKey, PublicKey?` | `AgentAttestationData` | Fetch attestation |
| `fetchNullable(agentPda, attester?)` | `PublicKey, PublicKey?` | `AgentAttestationData \| null` | Fetch or null |

#### IndexingModule — `client.indexing`

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `initCapabilityIndex(capId)` | `string` | `TransactionSignature` | Create capability index + register agent |
| `addToCapabilityIndex(capId)` | `string` | `TransactionSignature` | Add agent to existing index |
| `removeFromCapabilityIndex(capId)` | `string` | `TransactionSignature` | Remove agent from index |
| `closeCapabilityIndex(capId)` | `string` | `TransactionSignature` | Close empty index |
| `initProtocolIndex(protoId)` | `string` | `TransactionSignature` | Create protocol index |
| `addToProtocolIndex(protoId)` | `string` | `TransactionSignature` | Add agent to protocol index |
| `removeFromProtocolIndex(protoId)` | `string` | `TransactionSignature` | Remove from protocol index |
| `closeProtocolIndex(protoId)` | `string` | `TransactionSignature` | Close empty protocol index |
| `initToolCategoryIndex(cat)` | `number` | `TransactionSignature` | Create tool category index |
| `addToToolCategoryIndex(cat, toolName)` | `number, string` | `TransactionSignature` | Register tool in category |
| `removeFromToolCategoryIndex(cat, toolName)` | `number, string` | `TransactionSignature` | Remove tool from category |
| `closeToolCategoryIndex(cat)` | `number` | `TransactionSignature` | Close empty category index |
| `fetchCapabilityIndex(capId)` | `string` | `CapabilityIndexData` | Fetch capability index |
| `fetchProtocolIndex(protoId)` | `string` | `ProtocolIndexData` | Fetch protocol index |
| `fetchToolCategoryIndex(cat)` | `number` | `ToolCategoryIndexData` | Fetch tool category index |

---

### SAP Event System (v0.1.0+)

The SAP program emits events on every state change. Use the `EventParser` to decode them from transaction logs.

#### All SAP Events (38 total)

```ts
import { SAP_EVENT_NAMES, EventParser } from '@oobe-protocol-labs/synapse-sap-sdk';

// SAP_EVENT_NAMES contains all 38 event name strings:
const events = [
  // ── Agent Lifecycle ──
  'RegisteredEvent',          // Agent created
  'UpdatedEvent',             // Agent metadata changed
  'DeactivatedEvent',         // Agent set to inactive
  'ReactivatedEvent',         // Agent restored to active
  'ClosedEvent',              // Agent closed permanently

  // ── Reputation ──
  'FeedbackEvent',            // Feedback submitted
  'FeedbackUpdatedEvent',     // Feedback revised
  'FeedbackRevokedEvent',     // Feedback revoked
  'ReputationUpdatedEvent',   // Latency/uptime self-report
  'CallsReportedEvent',       // Call count updated

  // ── Memory Vault ──
  'VaultInitializedEvent',    // Vault created
  'SessionOpenedEvent',       // Session started
  'MemoryInscribedEvent',     // Encrypted data inscribed
  'EpochOpenedEvent',         // New epoch page
  'SessionClosedEvent',       // Session ended
  'VaultClosedEvent',         // Vault closed
  'SessionPdaClosedEvent',    // Session PDA reclaimed
  'EpochPageClosedEvent',     // Epoch page reclaimed
  'VaultNonceRotatedEvent',   // Encryption nonce changed
  'DelegateAddedEvent',       // Hot-wallet delegate added
  'DelegateRevokedEvent',     // Delegate revoked

  // ── Tool Registry ──
  'ToolPublishedEvent',       // Tool registered
  'ToolSchemaInscribedEvent', // JSON schema → TX log
  'ToolUpdatedEvent',         // Tool metadata changed
  'ToolDeactivatedEvent',     // Tool marked unavailable
  'ToolReactivatedEvent',     // Tool restored
  'ToolClosedEvent',          // Tool PDA closed
  'ToolInvocationReportedEvent', // Usage count updated
  'CheckpointCreatedEvent',   // Session checkpoint

  // ── Settlement ──
  'EscrowCreatedEvent',       // Escrow initialized
  'EscrowDepositedEvent',     // Funds deposited
  'PaymentSettledEvent',      // Calls settled → agent paid
  'EscrowWithdrawnEvent',     // Depositor withdrew
  'BatchSettledEvent',        // V1 batch settlement

  // ── Web of Trust ──
  'AttestationCreatedEvent',  // Attestation voucher
  'AttestationRevokedEvent',  // Attestation revoked

  // ── Ledger ──
  'LedgerEntryEvent',         // Ring buffer write
  'LedgerSealedEvent',        // Ring buffer → sealed page
] as const;
```

#### Parsing Events from Transactions

```ts
import { EventParser } from '@oobe-protocol-labs/synapse-sap-sdk';

// Initialize parser with Anchor program
const parser = new EventParser(program);

// Parse all events from TX logs
const events = parser.parseLogs(txLogs);

// Filter by event name
const settlements = parser.filterByName(events, 'PaymentSettledEvent');
for (const { name, data } of settlements) {
  console.log(`Settled ${data.callsSettled} calls for ${data.amount} lamports`);
}
```

#### Key Event Data Shapes

```ts
// PaymentSettledEvent.data
{
  escrow: PublicKey;
  agent: PublicKey;
  depositor: PublicKey;
  callsSettled: BN;
  amount: BN;
  serviceHash: number[];
  totalCallsSettled: BN;
  remainingBalance: BN;
  timestamp: BN;
}

// RegisteredEvent.data
{
  agent: PublicKey;
  wallet: PublicKey;
  name: string;
  capabilities: string[];
  timestamp: BN;
}

// MemoryInscribedEvent.data
{
  vault: PublicKey;
  session: PublicKey;
  sequence: number;
  epochIndex: number;
  encryptedData: number[];
  nonce: number[];
  contentHash: number[];
  totalFragments: number;
  fragmentIndex: number;
  compression: number;
  dataLen: number;
  nonceVersion: number;
  timestamp: BN;
}

// LedgerEntryEvent.data
{
  session: PublicKey;
  ledger: PublicKey;
  entryIndex: number;
  data: number[];
  contentHash: number[];
  dataLen: number;
  merkleRoot: number[];
  timestamp: BN;
}
```

#### Real-Time Event Streaming (Geyser/Yellowstone)

For real-time event streaming via Yellowstone gRPC, see **§23 gRPC / Geyser Parser**.

```ts
import { GeyserEventStream, EventParser } from '@oobe-protocol-labs/synapse-sap-sdk';

const stream = new GeyserEventStream({
  endpoint: 'https://us-1-mainnet.oobeprotocol.ai',
  token: process.env.OOBE_API_KEY,
});

stream.on('logs', (logs, sig, slot) => {
  const events = new EventParser(program).parseLogs(logs);
  for (const e of events) {
    if (e.name === 'PaymentSettledEvent') {
      console.log(`Settlement: ${e.data.amount} lamports at slot ${slot}`);
    }
  }
});

await stream.connect();
```

---

### SAP Error Codes Reference (v0.7.0)

On-chain program errors are numeric codes starting at 6000. Use `SapRpcError.fromAnchor(err)` to extract them.

#### Error Code → Message Mapping

| Code | Variant | Message | Category |
|------|---------|---------|----------|
| 6000 | `NameTooLong` | `name>64` | Agent |
| 6001 | `DescriptionTooLong` | `desc>256` | Agent |
| 6002 | `UriTooLong` | `uri>256` | Agent |
| 6003 | `TooManyCapabilities` | `caps>10` | Agent |
| 6004 | `TooManyPricingTiers` | `tiers>5` | Agent |
| 6005 | `TooManyProtocols` | `protos>5` | Agent |
| 6006 | `TooManyPlugins` | `plugins>5` | Agent |
| 6007 | `AlreadyActive` | `already active` | State |
| 6008 | `AlreadyInactive` | `already inactive` | State |
| 6009 | `InvalidFeedbackScore` | `score 0-1000` | Feedback |
| 6010 | `TagTooLong` | `tag>32` | Feedback |
| 6011 | `SelfReviewNotAllowed` | `self review` | Feedback |
| 6012 | `FeedbackAlreadyRevoked` | `already revoked` | Feedback |
| 6013 | `CapabilityIndexFull` | `cap idx full` | Indexing |
| 6014 | `ProtocolIndexFull` | `proto idx full` | Indexing |
| 6015 | `AgentNotInIndex` | `not in idx` | Indexing |
| 6016 | `InvalidCapabilityHash` | `cap hash` | Indexing |
| 6017 | `InvalidProtocolHash` | `proto hash` | Indexing |
| 6018 | `InvalidPluginType` | `bad plugin type` | Plugin |
| 6019 | `ChunkDataTooLarge` | `chunk>900` | Memory |
| 6020 | `ContentTypeTooLong` | `ctype>max` | Memory |
| 6021 | `IpfsCidTooLong` | `cid>max` | Memory |
| 6022 | `EmptyName` | `empty name` | Validation |
| 6023 | `ControlCharInName` | `ctrl char` | Validation |
| 6024 | `EmptyDescription` | `empty desc` | Validation |
| 6025 | `AgentIdTooLong` | `agentid>128` | Validation |
| 6026 | `InvalidCapabilityFormat` | `cap format` | Validation |
| 6027 | `DuplicateCapability` | `dup cap` | Validation |
| 6028 | `EmptyTierId` | `empty tier` | Validation |
| 6029 | `DuplicateTierId` | `dup tier` | Validation |
| 6030 | `InvalidRateLimit` | `rate=0` | Validation |
| 6031 | `SplRequiresTokenMint` | `spl needs mint` | SPL |
| 6032 | `InvalidX402Endpoint` | `x402 https` | Validation |
| 6033 | `InvalidVolumeCurve` | `curve order` | Escrow |
| 6034 | `TooManyVolumeCurvePoints` | `curve>5` | Escrow |
| 6035 | `MinPriceExceedsMax` | `min>max price` | Escrow |
| 6036 | `InvalidUptimePercent` | `uptime 0-100` | Validation |
| 6037 | `SessionClosed` | `session closed` | Vault |
| 6038 | `InvalidSequence` | `bad seq` | Vault |
| 6039 | `InvalidFragmentIndex` | `frag idx` | Vault |
| 6040 | `InscriptionTooLarge` | `data>750` | Vault |
| 6041 | `EmptyInscription` | `empty data` | Vault |
| 6042 | `InvalidTotalFragments` | `frags<1` | Vault |
| 6043 | `EpochMismatch` | `epoch mismatch` | Vault |
| 6044 | `VaultNotClosed` | `vault open` | Vault |
| 6045 | `SessionNotClosed` | `session open` | Vault |
| 6046 | `DelegateExpired` | `delegate expired` | Delegation |
| 6047 | `InvalidDelegate` | `bad delegate` | Delegation |
| 6048 | `ToolNameTooLong` | `tool>32` | Tools |
| 6049 | `EmptyToolName` | `empty tool` | Tools |
| 6050 | `InvalidToolNameHash` | `tool hash` | Tools |
| 6051 | `InvalidToolHttpMethod` | `bad method` | Tools |
| 6052 | `InvalidToolCategory` | `bad category` | Tools |
| 6053 | `ToolAlreadyInactive` | `tool inactive` | Tools |
| 6054 | `ToolAlreadyActive` | `tool active` | Tools |
| 6055 | `InvalidSchemaHash` | `schema hash` | Schema |
| 6056 | `InvalidSchemaType` | `schema type` | Schema |
| 6057 | `InvalidCheckpointIndex` | `cp index` | Checkpoint |
| 6058 | `FeedbackNotRevoked` | `not revoked` | Guards |
| 6059 | `IndexNotEmpty` | `idx not empty` | Guards |
| 6060 | `SessionStillOpen` | `session open` | Guards |
| 6061 | `NoFieldsToUpdate` | `no fields` | Guards |
| 6062 | `InsufficientEscrowBalance` | `low balance` | Escrow |
| 6063 | `EscrowMaxCallsExceeded` | `max calls` | Escrow |
| 6064 | `EscrowEmpty` | `escrow empty` | Escrow |
| 6065 | `EscrowNotEmpty` | `escrow!=0` | Escrow |
| 6066 | `InvalidSettlementCalls` | `calls<1` | Escrow |
| 6067 | `AttestationTypeTooLong` | `atype>32` | Attestation |
| 6068 | `EmptyAttestationType` | `empty atype` | Attestation |
| 6069 | `SelfAttestationNotAllowed` | `self attest` | Attestation |
| 6070 | `AttestationAlreadyRevoked` | `already revoked` | Attestation |
| 6071 | `AttestationNotRevoked` | `not revoked` | Attestation |
| 6072 | `ToolCategoryIndexFull` | `cat idx full` | Indexing |
| 6073 | `ToolNotInCategoryIndex` | `not in cat` | Indexing |
| 6074 | `ToolCategoryMismatch` | `cat mismatch` | Indexing |
| 6075 | `ArithmeticOverflow` | `overflow` | Safety |
| 6076 | `EscrowExpired` | `escrow expired` | Escrow |
| 6077 | `AgentInactive` | `agent inactive` | State |
| 6078 | `AttestationExpired` | `attest expired` | Attestation |
| 6079 | `BufferFull` | `buf full` | Buffer |
| 6080 | `BufferDataTooLarge` | `buf>750` | Buffer |
| 6081 | `Unauthorized` | `unauthorized` | Security |
| 6082 | `InvalidSession` | `bad session` | Vault |
| 6083 | `EmptyDigestHash` | `empty hash` | Digest |
| 6084 | `LedgerDataTooLarge` | `ledger>750` | Ledger |
| 6085 | `LedgerRingEmpty` | `ring empty` | Ledger |
| 6086 | `BatchEmpty` | `batch empty` | Batch |
| 6087 | `BatchTooLarge` | `batch>10` | Batch |
| 6088 | `SplTokenRequired` | `spl accts` | SPL |
| 6089 | `InvalidTokenAccount` | `bad token` | SPL |
| 6090 | `InvalidTokenProgram` | `bad prog` | SPL |
| 6091 | `InvalidSettlementSecurity` | `bad security` | V2.1 Escrow |
| 6092 | `CoSignerRequired` | `cosigner` | V2.1 Escrow |
| 6093 | `InvalidCoSigner` | `bad cosigner` | V2.1 Escrow |
| 6094 | `InvalidArbiter` | `bad arbiter` | V2.1 Escrow |
| 6095 | `ArbiterRequired` | `arbiter=0` | V2.1 Escrow |
| 6096 | `EscrowNonceReused` | `nonce reused` | V2.1 Escrow |
| 6097 | `SettlementNotPending` | `not pending` | V2.1 Dispute |
| 6098 | `SettlementAlreadyFinalized` | `already final` | V2.1 Dispute |
| 6099 | `DisputeWindowNotExpired` | `too early` | V2.1 Dispute |
| 6100 | `DisputeWindowExpired` | `window closed` | V2.1 Dispute |
| 6101 | `NotDepositor` | `not depositor` | V2.1 Dispute |
| 6102 | `DisputeAlreadyFiled` | `dup dispute` | V2.1 Dispute |
| 6103 | `DisputeStillOpen` | `dispute open` | V2.1 Dispute |
| 6104 | `NotArbiter` | `not arbiter` | V2.1 Dispute |
| 6105 | `InvalidDisputeOutcome` | `bad outcome` | V2.1 Dispute |
| 6106 | `StakeBelowMinimum` | `stake<min` | V2.1 Staking |
| 6107 | `NoStakeAccount` | `no stake` | V2.1 Staking |
| 6108 | `UnstakeAlreadyPending` | `unstake pending` | V2.1 Staking |
| 6109 | `UnstakeCooldownNotMet` | `cooldown` | V2.1 Staking |
| 6110 | `NoUnstakePending` | `no unstake` | V2.1 Staking |
| 6111 | `SlashExceedsStake` | `slash>stake` | V2.1 Staking |
| 6112 | `SubscriptionAlreadyActive` | `sub active` | V2.1 Subscription |
| 6113 | `SubscriptionCancelled` | `sub cancelled` | V2.1 Subscription |
| 6114 | `NoIntervalDue` | `no due` | V2.1 Subscription |
| 6115 | `SubscriptionInsufficientBalance` | `sub low bal` | V2.1 Subscription |
| 6116 | `InvalidBillingInterval` | `bad interval` | V2.1 Subscription |
| 6117 | `InvalidShardIndex` | `bad shard` | V2.1 Shards |
| 6118 | `IndexPageFull` | `page full` | V2.1 Indexing |
| 6119 | `InvalidPageIndex` | `bad page` | V2.1 Indexing |
| 6120 | `IndexPageNotEmpty` | `page≠empty` | V2.1 Indexing |
| 6121 | `AlreadyMigrated` | `already v2` | V2.1 Migration |
| 6122 | `MigrationV1Only` | `v1 only` | V2.1 Migration |

#### SDK Error Classes

```ts
import {
  SapError,                 // Base class — catch-all
  SapValidationError,       // Client-side validation (err.field)
  SapRpcError,              // Anchor/RPC errors (err.rpcCode, err.logs)
  SapAccountNotFoundError,  // Missing PDA (err.address, err.accountType)
  SapTimeoutError,          // Network timeout (err.timeoutMs)
  SapPermissionError,       // Unauthorized access
} from '@oobe-protocol-labs/synapse-sap-sdk';

// Best practice: use SapRpcError.fromAnchor() to wrap Anchor errors
try {
  await client.agent.register(args);
} catch (raw) {
  const err = SapRpcError.fromAnchor(raw);
  console.error(`Error ${err.rpcCode}: ${err.message}`);
  // err.rpcCode === 6000 → NameTooLong
  // err.logs → transaction log lines for debugging
}
```

---

### Protocol Constants & Limits (v0.7.0)

These constants mirror on-chain Rust constraints exactly. Use for client-side validation before sending transactions.

#### LIMITS — Size Constraints

```ts
import { LIMITS } from '@oobe-protocol-labs/synapse-sap-sdk';
```

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_NAME_LEN` | 64 | Agent name (bytes) |
| `MAX_DESC_LEN` | 256 | Agent description (bytes) |
| `MAX_URI_LEN` | 256 | URI fields (agent_uri, x402_endpoint) |
| `MAX_AGENT_ID_LEN` | 128 | DID-style identifier |
| `MAX_CAPABILITIES` | 10 | Capabilities per agent |
| `MAX_PRICING_TIERS` | 5 | Pricing tiers per agent |
| `MAX_PROTOCOLS` | 5 | Protocols per agent |
| `MAX_PLUGINS` | 5 | Plugins per agent |
| `MAX_VOLUME_CURVE_POINTS` | 5 | Volume curve breakpoints |
| `MAX_TAG_LEN` | 32 | Feedback tag (bytes) |
| `MAX_AGENTS_PER_INDEX` | 100 | Agents in a capability/protocol index |
| `MAX_TOOL_NAME_LEN` | 32 | Tool name (bytes) |
| `MAX_TOOLS_PER_CATEGORY` | 100 | Tools per category index |
| `MAX_ATTESTATION_TYPE_LEN` | 32 | Attestation type string |
| `MAX_INSCRIPTION_SIZE` | 750 | Encrypted data per fragment |
| `INSCRIPTIONS_PER_EPOCH` | 1000 | Inscriptions per epoch page |
| `RING_CAPACITY` | 4096 | Ledger ring buffer (bytes) |
| `MAX_LEDGER_WRITE_SIZE` | 750 | Ledger write per call |
| `MAX_BATCH_SETTLEMENTS` | 10 | Settlements per V1 batch |
| `MAX_FEEDBACK_SCORE` | 1000 | Score range: 0–1000 |

#### SEEDS — PDA Seed Prefixes

```ts
import { SEEDS } from '@oobe-protocol-labs/synapse-sap-sdk';
```

| Key | Value | Account Type |
|-----|-------|-------------|
| `AGENT` | `sap_agent` | AgentAccount |
| `STATS` | `sap_stats` | AgentStats |
| `FEEDBACK` | `sap_feedback` | FeedbackAccount |
| `GLOBAL` | `sap_global` | GlobalRegistry |
| `VAULT` | `sap_vault` | MemoryVault |
| `SESSION` | `sap_session` | SessionLedger |
| `EPOCH` | `sap_epoch` | EpochPage |
| `DELEGATE` | `sap_delegate` | VaultDelegate |
| `TOOL` | `sap_tool` | ToolDescriptor |
| `CHECKPOINT` | `sap_checkpoint` | SessionCheckpoint |
| `ESCROW` | `sap_escrow` | EscrowAccount (V1) |
| `ESCROW_V2` | `sap_escrow_v2` | EscrowAccountV2 |
| `PENDING` | `sap_pending` | PendingSettlement |
| `DISPUTE` | `sap_dispute` | DisputeRecord |
| `STAKE` | `sap_stake` | AgentStake |
| `SUBSCRIPTION` | `sap_sub` | SubscriptionAccount |
| `SHARD` | `sap_shard` | CounterShard |
| `INDEX_PAGE` | `sap_idx_page` | IndexPage |
| `LEDGER` | `sap_ledger` | MemoryLedger |
| `LEDGER_PAGE` | `sap_page` | LedgerPage |
| `ATTESTATION` | `sap_attest` | AgentAttestation |
| `CAPABILITY_INDEX` | `sap_cap_idx` | CapabilityIndex |
| `PROTOCOL_INDEX` | `sap_proto_idx` | ProtocolIndex |
| `TOOL_CATEGORY` | `sap_tool_cat` | ToolCategoryIndex |

#### Pre-computed Addresses

```ts
import {
  SAP_PROGRAM,             // PublicKey: SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ
  SAP_UPGRADE_AUTHORITY,   // PublicKey: GBLQznn1QMnx64zHXcDguP9yNW9ZfYCVdrY8eDovBvPk
  GLOBAL_REGISTRY_ADDRESS, // PublicKey: 9odFrYBBZq6UQC6aGyzMPNXWJQn55kMtfigzhLg6S6L5
  GLOBAL_REGISTRY_BUMP,    // 255
  IDL_ACCOUNT_ADDRESS,     // PublicKey: ENs7L1NFuoP7dur8cqGGE6b98CQHfNeDZPWPSjRzhc4f
} from '@oobe-protocol-labs/synapse-sap-sdk';
```

---

### V1 → V2 Migration Guide (v0.7.0)

#### Escrow: V1 → V2

| Feature | V1 (`client.escrow`) | V2 (`client.escrowV2`) |
|---------|---------------------|----------------------|
| **PDA** | `deriveEscrow(agent, depositor)` | `deriveEscrowV2(agent, depositor, nonce)` |
| **Multiple escrows** | 1 per agent-depositor pair | ∞ via `nonce` parameter |
| **Settlement** | `settle()` / `batchSettle()` | `settle()` with `SettleOptions` |
| **Security modes** | SelfReport only | `SelfReport \| CoSigned \| Arbitrated` |
| **Disputes** | None | `fileDispute()` → `resolveDispute()` |
| **Pending settlements** | None | `createPendingSettlement()` → `finalizeSettlement()` |
| **Volume curves** | Built-in breakpoints | Not in V2 — use flat `pricePerCall` |

**Migration (1 instruction):**

```ts
// Migrate V1 escrow → V2 (preserves balance, transfers to nonce=0 V2 escrow)
await client.escrowV2.migrateFromV1(agentWallet);

// After migration, the V1 escrow PDA is closed and funds are in V2
const v2 = await client.escrowV2.fetch(agentPda, depositor, 0);
```

#### Settlement Security Modes (V2 only)

```ts
import { SettlementSecurity } from '@oobe-protocol-labs/synapse-sap-sdk';

// 1. SelfReport (default) — agent settles immediately, no dispute
await client.escrowV2.create(agentWallet, {
  escrowNonce: 0,
  pricePerCall: 1_000_000,
  maxCalls: 100,
  initialDeposit: 100_000_000,
  settlementSecurity: { selfReport: {} },
  disputeWindowSlots: 0,
  // ...
});

// 2. CoSigned — requires co-signer approval
await client.escrowV2.create(agentWallet, {
  // ...
  settlementSecurity: { coSigned: {} },
  coSigner: coSignerPubkey,
});

// 3. Arbitrated — dispute window + arbiter
await client.escrowV2.create(agentWallet, {
  // ...
  settlementSecurity: { disputeWindow: {} },
  disputeWindowSlots: 432_000, // ~2 days
  arbiter: arbiterPubkey,
});
```

#### Import Changes

```ts
// ❌ V1 (deprecated)
import { deriveEscrow, EscrowAccountData, CreateEscrowArgs } from '@synapse-sap/sdk';
client.escrow.create(args);
client.escrow.settle(depositor, calls, hash);
client.escrow.batchSettle(depositor, settlements);
client.x402.preparePayment(agentPubkey, opts);

// ✅ V2 (recommended)
import { deriveEscrowV2, EscrowAccountV2Data, CreateEscrowV2Args } from '@synapse-sap/sdk';
client.escrowV2.create(agentWallet, args);
client.escrowV2.settle(depositor, nonce, calls, hash);
client.escrowV2.migrateFromV1(agentWallet);
```

---

### Transaction Parser — `client.parser` (v0.5.0+)

Decodes SAP instructions, inner CPIs, and events from raw transaction responses.

```ts
// Access via SapClient
const parser = client.parser;

// Full parse: instructions + inner calls + events
const parsed = parser.parseTransaction(txResponse);
console.log(parsed.instructions); // DecodedSapInstruction[]
console.log(parsed.events);       // ParsedEvent[]
console.log(parsed.innerCalls);   // InnerInstructionGroup[]

// Batch parse (e.g., from getSignaturesForAddress)
const results = parser.parseBatch(txResponses);

// Extract instruction names only
const names = parser.instructionNames(txResponse); // ['registerAgent', 'publishTool']

// Check if a TX targets SAP
const isSap = parser.isSapTransaction(instructions); // boolean

// Decode from pre-built instruction list
const decoded = parser.fromInstructions(ixList);

// Decode inner (CPI) instructions
const inner = parser.decodeInner(tx.meta.innerInstructions, txResponse);
```

#### Parsed Transaction Shape

```ts
interface ParsedSapTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  instructions: DecodedSapInstruction[];  // Top-level SAP instructions
  events: ParsedEvent[];                   // Decoded events from logs
  innerCalls: InnerInstructionGroup[];     // CPI calls
  success: boolean;                        // TX succeeded?
  fee: number;                             // TX fee in lamports
}

interface DecodedSapInstruction {
  name: string;                     // e.g., 'registerAgent'
  data: Record<string, unknown>;    // Decoded args
  accounts: PublicKey[];            // Account keys
  programId: PublicKey;
}
```

---

### Priority Fees & Compute Budget (v0.6.2+)

Critical for settlement TXs on congested networks. The SDK provides composable helpers.

```ts
import {
  buildPriorityFeeIxs,
  FAST_SETTLE_OPTIONS,
  FAST_BATCH_SETTLE_OPTIONS,
} from '@oobe-protocol-labs/synapse-sap-sdk';
```

#### Presets

| Preset | Fee | CU Limit | Skip Preflight | Use Case |
|--------|-----|----------|----------------|----------|
| `FAST_SETTLE_OPTIONS` | 5000 µL | 100,000 | Yes | Single settlement |
| `FAST_BATCH_SETTLE_OPTIONS` | 5000 µL | 300,000 | Yes | Batch settlement |

#### Usage

```ts
// Option 1: Use preset with EscrowV2Module
await client.escrowV2.settle(depositor, nonce, calls, hash, [], FAST_SETTLE_OPTIONS);

// Option 2: Build custom priority fee instructions
const feeIxs = buildPriorityFeeIxs({
  priorityFeeMicroLamports: 10_000,  // higher = faster
  computeUnits: 150_000,
});

// Prepend to any Anchor method builder
await program.methods
  .settleCalls(calls, hash)
  .accounts({ ... })
  .preInstructions(feeIxs)
  .rpc({ skipPreflight: true });
```

#### Fee Guide

| Priority | µLamports | ~Cost per TX | When to Use |
|----------|-----------|-------------|-------------|
| Low | 1,000 | ~0.0001 SOL | Non-urgent writes |
| Medium | 5,000 | ~0.0005 SOL | Standard settlement |
| High | 50,000 | ~0.005 SOL | Time-critical settlement |
| Extreme | 500,000 | ~0.05 SOL | Congestion, MEV-protected |

---

### Zod Validation Schemas (v0.6.0+)

Runtime validation for environment variables, agent manifests, and tool arguments. Zod is a peer dependency (tree-shaken if unused).

```ts
import {
  createEnvSchema,
  createAgentManifestSchema,
  createToolManifestEntrySchema,
  createEndpointDescriptorSchema,
  createHealthCheckSchema,
  createCallArgsSchema,
  validateOrThrow,
} from '@oobe-protocol-labs/synapse-sap-sdk';
```

#### Environment Validation

```ts
const envSchema = createEnvSchema();
const env = envSchema.parse(process.env);
// env.SOLANA_CLUSTER — typed as 'mainnet-beta' | 'devnet' | 'localnet'
// env.SOLANA_RPC_URL — string | undefined
// env.DATABASE_URL   — string | undefined
// env.LOG_LEVEL      — 'debug' | 'info' | 'warn' | 'error'
```

#### Agent Manifest Validation

```ts
const manifestSchema = createAgentManifestSchema();
const result = manifestSchema.safeParse(userInput);
if (!result.success) {
  console.error('Invalid manifest:', result.error.issues);
}
```

#### Tool Entry Validation

```ts
const toolSchema = createToolManifestEntrySchema();
toolSchema.parse({
  name: 'getWeather',
  description: 'Fetch weather for a city',
  protocol: 'mcp-v1',
  category: 'data-retrieval',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
  outputSchema: { type: 'object' },
  httpMethod: 'POST',
  paymentMode: 'x402',
  pricePerCall: 1_000_000,
});
```

---

### Dual RPC Strategy (v0.6.0+)

Solves WebSocket 400 rejections on authenticated RPCs during SPL token operations.

```ts
import {
  createDualConnection,
  getRpcUrl,
  findATA,
} from '@oobe-protocol-labs/synapse-sap-sdk';

// Primary RPC = authenticated, fallback = public (for SPL ops)
const dual = createDualConnection({
  primaryUrl: 'https://synapse.oobeprotocol.ai',
  fallbackUrl: 'https://api.mainnet-beta.solana.com',
  commitment: 'confirmed',
});

// SAP program calls → dual.primary
const agent = await client.agent.fetch();

// SPL token ATA lookup → dual.fallback (avoids WS 400)
const ata = await findATA(dual.fallback, wallet, mint);
```

---

### Escrow Validation Pipeline (v0.6.4+)

Pre-settlement validation for both SOL and SPL token escrows:

```ts
import {
  validateEscrowState,
  attachSplAccounts,
  toAccountMetas,
  MissingEscrowAtaError,
} from '@oobe-protocol-labs/synapse-sap-sdk';

// 1. Validate escrow state before settling
const result = await validateEscrowState(
  connection,
  agentWallet,
  depositorWallet,
  (pda) => client.escrow.fetchNullable(pda),
);

if (!result.valid) {
  console.error('Escrow validation failed:', result.errors);
  return; // Don't attempt settlement
}

// 2. For SPL escrows, generate AccountMeta[] automatically
if (result.isSplEscrow) {
  const splAccounts = toAccountMetas(result.splAccounts);
  await client.escrowV2.settle(depositor, nonce, calls, hash, splAccounts);
} else {
  await client.escrowV2.settle(depositor, nonce, calls, hash);
}

// Result shape:
// {
//   valid: boolean,
//   escrow: EscrowAccountData | null,
//   escrowPda: PublicKey,
//   agentPda: PublicKey,
//   isSplEscrow: boolean,
//   splAccounts: SplAccountMeta[],
//   errors: string[],
// }
```

---

### PostgreSQL Off-Chain Mirror (v0.1.0+)

Mirror all on-chain SAP accounts to PostgreSQL for SQL queries, analytics, and REST APIs.

```ts
import { SapPostgres, SapSyncEngine } from '@oobe-protocol-labs/synapse-sap-sdk';
import { Pool } from 'pg';
```

#### Setup

```ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pg = new SapPostgres(pool, sapClient);

// 1. Create tables (idempotent)
await pg.migrate();

// 2. Full sync — mirrors all 22 account types
await pg.syncAll();

// 3. Query with SQL
const { rows } = await pg.query<{ name: string; reputation_score: number }>(
  'SELECT name, reputation_score FROM sap_agents WHERE is_active = true ORDER BY reputation_score DESC',
);
```

#### Sync Methods

| Method | Description |
|--------|-------------|
| `migrate()` | Create/update all SAP tables (idempotent) |
| `syncAll(opts?)` | Sync all 22 account types |
| `syncAgents()` | Sync AgentAccount + AgentStats |
| `syncFeedback()` | Sync FeedbackAccount |
| `syncEscrows()` | Sync EscrowAccount |
| `syncVaults()` | Sync MemoryVault + Sessions |
| `syncTools()` | Sync ToolDescriptor |
| `syncIndexes()` | Sync Capability/Protocol/Category indexes |
| `syncLedgers()` | Sync MemoryLedger + LedgerPage |
| `syncAttestations()` | Sync AgentAttestation |
| `upsert(table, row)` | Insert or update single row |
| `query(sql, params)` | Raw SQL query |

#### Real-Time Sync Engine

```ts
const sync = new SapSyncEngine(pg, sapClient);

// One-shot full sync
await sync.run();

// Periodic sync (every 60 seconds)
sync.start(60_000);

// Live event streaming via Yellowstone gRPC
await sync.startEventStream({
  endpoint: 'https://us-1-mainnet.oobeprotocol.ai',
  token: process.env.OOBE_API_KEY,
});

// Graceful shutdown
await sync.stop();
```

#### Database Tables Created

| Table | Source Account | Key Columns |
|-------|---------------|-------------|
| `sap_agents` | AgentAccount | pda, wallet, name, description, is_active, capabilities |
| `sap_agent_stats` | AgentStats | pda, total_calls, avg_latency, uptime |
| `sap_feedback` | FeedbackAccount | pda, agent_pda, reviewer, score, tag |
| `sap_escrows` | EscrowAccount | pda, agent_pda, depositor, balance, settled_calls |
| `sap_vaults` | MemoryVault | pda, agent_pda, session_count, nonce_version |
| `sap_sessions` | SessionLedger | pda, vault_pda, is_closed, entries_count |
| `sap_tools` | ToolDescriptor | pda, agent_pda, tool_name, category, is_active |
| `sap_attestations` | AgentAttestation | pda, agent_pda, attester, type, is_revoked |
| `sap_ledgers` | MemoryLedger | pda, session_pda, num_pages, ring_head |
| `sap_capability_indexes` | CapabilityIndex | pda, capability_hash, agent_count |
| `sap_protocol_indexes` | ProtocolIndex | pda, protocol_hash, agent_count |
| `sap_tool_categories` | ToolCategoryIndex | pda, category, tool_count |

---

### Hash Utilities

```ts
import { sha256, hashToArray } from '@oobe-protocol-labs/synapse-sap-sdk';

// SHA-256 hash (for PDA seeds and schema IDs)
const hash = sha256('jupiter:swap');       // Uint8Array (32 bytes)

// Convert to number[] for Anchor instruction args
const arr = hashToArray(hash);             // number[] (32 elements)

// Common usage: tool name hashing
const toolHash = hashToArray(sha256('getWeather'));
await client.tools.publish({ toolNameHash: toolHash, ... });

// Tip: Use publishByName() to auto-hash strings
await client.tools.publishByName('getWeather', ...);  // handles hashing internally
```

---

### Common Gotchas & Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `6000 NameTooLong` | Agent name > 64 bytes | Shorten name, check UTF-8 byte length |
| `6003 TooManyCapabilities` | > 10 capabilities | Remove less critical capabilities |
| `6062 InsufficientEscrowBalance` | Settling more calls than funded | Check `escrow.balance` before settling |
| `6076 EscrowExpired` | Escrow `expires_at` passed | Create new escrow with later expiry |
| `6081 Unauthorized` | Wrong signer for instruction | Verify wallet matches expected authority |
| `6096 EscrowNonceReused` | Same nonce for agent-depositor pair | Increment nonce for new escrows |
| `6109 UnstakeCooldownNotMet` | Called `completeUnstake` too early | Wait for cooldown period to pass |
| `AccountNotFound` | PDA doesn't exist on-chain | Check derivation params, ensure account was created |
| `WS 400 on SPL ops` | Authenticated RPC rejects WS for tokens | Use `createDualConnection()` with public fallback |
| `Transaction too large` | Too many accounts / data | Split into multiple TXs, use lookup tables |
| `Blockhash expired` | TX took too long to land | Use priority fees, retry with fresh blockhash |

---

## 20. Solana Actions & Blinks

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/actions`

```ts
import { ActionServer, BlinkGenerator, createBlinkFromAction } from '@oobe-protocol-labs/synapse-client-sdk/ai/actions';
```

| Class / Function | Description |
|------------------|-------------|
| `ActionServer` | Host Solana Actions endpoints |
| `BlinkGenerator` | Generate blink URLs from actions |
| `createBlinkFromAction` | Quick blink creation |
| `DEFAULT_RESOLVER_URL` | Default blink resolver URL |
| `ACTION_SCHEME` | Action URL scheme |

### ActionServer API
| Method | Description |
|--------|-------------|
| `registerAction()` | Register a Solana Action |
| `handleRequest()` | Handle incoming action request |
| `serve()` | Start HTTP server |

---

## 21. Persistence

Pluggable state persistence with 3 backends.

Import: `@oobe-protocol-labs/synapse-client-sdk/ai/persistence`

```ts
import {
  MemoryStore,
  FileStore,
  RedisStore,
  createStore,
} from '@oobe-protocol-labs/synapse-client-sdk/ai/persistence';
```

| Backend | Description |
|---------|-------------|
| `MemoryStore` | In-memory (dev/testing) |
| `FileStore` | JSON file-based |
| `RedisStore` | Redis-backed (production) |

Common API: `get(key)`, `set(key, value, ttl?)`, `delete(key)`, `has(key)`, `clear()`, `keys(pattern?)`.

---

## 22. Context / IoC Container

Dependency injection, service lifecycle, and hooks.

Import: `@oobe-protocol-labs/synapse-client-sdk/context`

```ts
import {
  SynapseContext,
  createSynapseContext,
  createBareContext,
  createBinding,
  ServiceRef,
  WeakServiceRef,
  RefRegistry,
} from '@oobe-protocol-labs/synapse-client-sdk';
```

| Function | Description |
|----------|-------------|
| `createSynapseContext(config)` | Full IoC context with auto-wired services |
| `createBareContext()` | Empty context |
| `createBinding(token, factory)` | Service binding |
| `autoWire(context)` | Auto-register default services |

---

## 23. gRPC / Geyser Parser

Low-level Yellowstone/Geyser stream parser.

```ts
import { GeyserParser, GrpcTransport } from '@oobe-protocol-labs/synapse-client-sdk';
```

### GeyserParser
| Method | Description |
|--------|-------------|
| `parseTransaction(raw)` | Decode raw transaction |
| `parseAccountUpdate(raw)` | Decode account update |
| `parseBlockMeta(raw)` | Decode block metadata |
| `parseSlotUpdate(raw)` | Decode slot update |
| `parseEntry(raw)` | Decode ledger entry |
| `stream(filter, callback)` | Stream parsed updates |

**80+ known programs** recognized — Jupiter, Raydium, Metaplex, Orca, Meteora, Marinade, SPL programs, and more.

### SAP Yellowstone gRPC Event Streaming (v0.6.3)

The SAP SDK provides a dedicated `GeyserEventStream` wrapper for real-time
on-chain event streaming via Yellowstone gRPC. This is the recommended
approach for production indexers, explorers, and monitoring dashboards.

```ts
import { GeyserEventStream, EventParser } from "@oobe-protocol-labs/synapse-sap-sdk";

const stream = new GeyserEventStream({
  endpoint: "https://us-1-mainnet.oobeprotocol.ai",
  token:    process.env.OOBE_API_KEY!,  // sent as x-token automatically
});

const parser = new EventParser(program);

stream.on("logs", (logs, signature, slot) => {
  const events = parser.parseLogs(logs);
  for (const e of events) {
    console.log(e.name, e.data);
  }
});

stream.on("connected", () => console.log("gRPC connected"));
stream.on("reconnecting", (n) => console.log(`Reconnecting #${n}...`));

await stream.connect();
```

**Using the raw Yellowstone client directly:**

```ts
import Client from "@triton-one/yellowstone-grpc";

const client = new Client(
  "https://us-1-mainnet.oobeprotocol.ai",
  process.env.OOBE_API_KEY!   // sent as x-token automatically
);

const stream = await client.subscribe();

stream.on("data", (data) => {
  console.log("Received:", data);
});

// Subscribe to all SAP program transactions
await stream.write({
  accounts: {},
  slots: {},
  transactions: {
    sapFilter: {
      accountInclude: ["SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ"],
      accountExclude: [],
      accountRequired: [],
    },
  },
  blocks: {},
  blocksMeta: {},
  entry: {},
  accountsDataSlice: [],
  commitment: 1, // CONFIRMED
});
```

**OOBE Protocol gRPC Endpoint:**
| Endpoint | Network | Auth |
|----------|---------|------|
| `https://us-1-mainnet.oobeprotocol.ai` | Mainnet | API key as `x-token` |

**Install:** `npm i @triton-one/yellowstone-grpc` (optional peer dependency)

---

## 24. @solana/kit Bridge

Interop with `@solana/kit` native types.

Import: `@oobe-protocol-labs/synapse-client-sdk/kit`

```ts
import { address, signature, lamports } from '@oobe-protocol-labs/synapse-client-sdk/kit';

// Convert Synapse types → Kit types
const kitAddr = address('So11111111111111111111111111111111111111112');

// Or use kit-native RPC
const balance = await client.kitRpc.getBalance(kitAddr).send();
```

---

## 25. Next.js Integration

### ⚠️ Strict App Router Compatibility

Next.js app router builds use stricter TypeScript checking. The SDK's branded types and singleton factories require explicit handling:

### Singleton Setup (with explicit cast)

```ts
import {
  SynapseClient,
  createSingleton,
  Pubkey,
} from '@oobe-protocol-labs/synapse-client-sdk';

const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;

const getClient = createSingleton(
  () => new SynapseClient({ endpoint: ENDPOINT }),
  { key: 'synapse-client' },
);

// ✅ MUST cast — createSingleton returns a generic; Next.js strict mode rejects 'unknown'
const client = getClient() as SynapseClient;
```

### Server Component Example — NFT-Gated Page

```ts
// app/gated/page.tsx  (server component)
import { SynapseClient, createSingleton, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';
import { redirect } from 'next/navigation';

const getClient = createSingleton(
  () => new SynapseClient({ endpoint: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` }),
  { key: 'synapse' },
);

const REQUIRED_COLLECTION = 'YourCollectionMintHere...';

export default async function GatedPage({ searchParams }: { searchParams: { wallet?: string } }) {
  const wallet = searchParams.wallet;
  if (!wallet) redirect('/connect');

  const client = getClient() as SynapseClient;          // ← cast
  const walletPk = Pubkey(wallet);                       // ← brand the string

  // Fetch assets, then filter client-side (getAssetsByOwner has no groupKey param)
  const { items } = await client.das.getAssetsByOwner({
    ownerAddress: wallet,
    page: 1,
    limit: 1000,
  });

  const hasAccess = items.some((a) =>
    a.grouping?.some((g) => g.group_key === 'collection' && g.group_value === REQUIRED_COLLECTION),
  );

  if (!hasAccess) redirect('/no-access');

  return <div>Welcome, holder!</div>;
}
```

### Key Rules for Next.js

| Rule | Why |
|------|-----|
| Cast `getClient()` to `SynapseClient` | `createSingleton` returns generic — strict TS rejects `unknown` |
| Wrap all address strings with `Pubkey()` | Branded type — plain `string` fails type-check |
| Filter DAS results client-side for collection gating | `getAssetsByOwner` params don't include `groupKey` / `groupValue` |
| Use `process.env.OOBE_API_KEY` in `?api_key=` | Server-only env var — never exposed to client bundle |

---

## 26. Common Patterns

### Get SOL balance of a wallet

```ts
const client = new SynapseClient({ endpoint: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` });
const { value } = await client.rpc.getBalance(Pubkey('WalletAddressHere'));
const sol = lamportsToSol(value);
```

### Get all NFTs owned by a wallet

```ts
const assets = await client.das.getAssetsByOwner({
  ownerAddress: 'WalletAddressHere',
  page: 1,
  limit: 100,
});
```

### Swap tokens via DeFi plugin

```ts
const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(DeFiPlugin);

const tools = kit.getTools();
const swapTool = kit.getToolMap().get('orca_swap');
const result = await swapTool.invoke({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EikyJKSVWPK28rX5FG8KyJcSzv3D2b2Qg7VodzqQoobe', // OOBE TOKEN
  amount: 1_000_000_000, // 1 SOL
  slippage: 50, // 0.5%
});
```

### Resolve a .sol domain

```ts
const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(MiscPlugin);

const resolver = kit.getToolMap().get('sns_resolveDomain');
const result = await resolver.invoke({ domain: 'toly.sol' });
```

### Get real-time token price from Pyth

```ts
const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(MiscPlugin);

const pyth = kit.getToolMap().get('pyth_getPrice');
const price = await pyth.invoke({ symbol: 'SOL/USD' });
```

### Full agent with LangChain

```ts
import { SynapseClient } from '@oobe-protocol-labs/synapse-client-sdk';
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, MiscPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createStructuredChatAgent } from 'langchain/agents';

const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(TokenPlugin)
  .use(DeFiPlugin)
  .use(MiscPlugin);

const tools = kit.getTools(); // 85 LangChain StructuredTool[]
const llm = new ChatOpenAI({ modelName: 'gpt-4o' });
const agent = createStructuredChatAgent({ llm, tools, prompt: '...' });
const executor = new AgentExecutor({ agent, tools });

const result = await executor.invoke({
  input: 'What is the current price of SOL and my balance?',
});
```

### Full agent with SAP protocol tools

```ts
import { SynapseAgentKit } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';
import { AnchorProvider } from '@coral-xyz/anchor';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createStructuredChatAgent } from 'langchain/agents';

const provider = AnchorProvider.env();
const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({
  rpcUrl: 'https://synapse.oobeprotocol.ai',
}).use(sapPlugin);

const tools = kit.getTools(); // 52 SAP tools
const llm = new ChatOpenAI({ model: 'gpt-4o' });
const agent = await createStructuredChatAgent({ llm, tools, prompt: '...' });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

const result = await executor.invoke({
  input: 'Register a new agent called SwapBot with Jupiter swap capability',
});
```

### Expose tools via MCP to Claude Desktop

```ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, NFTPlugin, MiscPlugin, BlinksPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const kit = new SynapseAgentKit({ rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}` })
  .use(TokenPlugin)
  .use(DeFiPlugin)
  .use(NFTPlugin)
  .use(MiscPlugin)
  .use(BlinksPlugin);

const server = new SynapseMcpServer(kit, {
  name: 'synapse-solana',
  version: '2.0.2',
});

await server.start(); // 110 tools available to Claude
```

### Combine MCP server + external MCP client

```ts
import { McpClientBridge } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const bridge = new McpClientBridge();
await bridge.connect({
  id: 'github',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN! },
});

// Merge external tools into the kit
kit.use(bridge.toPlugin());

// Now kit has 110 Solana tools + GitHub tools
const allTools = kit.getTools();
```

---

## 27. SAP Agent Skill Guides

The SAP SDK ships two **role-specific skill guides** that provide production-grade, copy-paste workflows for every protocol operation. These guides are the authoritative reference when your agent needs to interact with the Solana Agent Protocol.

### Two Roles, One Protocol

| Role | Guide | Package | Description |
|------|-------|---------|-------------|
| **Consumer (Client/Buyer)** | [skills/client.md](https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/client.md) | `@oobe-protocol-labs/synapse-sap-sdk` | Discover agents, validate endpoints, create escrows, build x402 payment headers, verify settlements, give feedback |
| **Merchant (Seller/Agent)** | [skills/merchant.md](https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/merchant.md) | `@oobe-protocol-labs/synapse-sap-sdk` | Register agent on-chain, publish tools with schemas, settle x402 payments, manage memory vault/ledger, delegate hot-wallets, build reputation |

> **A single wallet can play both roles simultaneously** — SAP imposes no restriction. Both guides cover the dual-role pattern.

### What the Client Guide Covers (19 sections)

1. **Imports Cheat-Sheet** — Every import you need as a consumer
2. **Creating the Client** — `SapClient.from(provider)` + `SapConnection` + `KeypairWallet`
3. **Agent Discovery** — Search by capability, protocol, profile, tool details, network overview
4. **Endpoint Validation (v0.6.0)** — Validate URLs, descriptors, health checks, all agent endpoints
5. **Network Normalization (v0.6.0)** — `SapNetwork` constants, `normalizeNetworkId()`, `isNetworkEquivalent()`, genesis-hash vs cluster-name conversion
6. **x402 Payment Flow** — Complete 6-step guide: discover → validate → prepare → call → settle → verify
7. **Escrow PDA Derivation** — Deep dive with derivation diagram + all 14 PDA functions
8. **Building x402 Headers** — From `PaymentContext` or from existing escrow (reconnect after restart)
9. **Escrow Lifecycle** — Add funds, withdraw, close, check existence, fetch raw data
10. **Cost Estimation** — On-chain estimate + pure offline calculation with volume curves
11. **Zod Schema Validation (v0.6.0)** — Runtime validation: env, payment options, call args, manifests
12. **RPC Strategy & Dual Connection (v0.6.0)** — Primary + fallback RPC, lightweight ATA derivation
13. **Error Classification (v0.6.0)** — Anchor error codes → human-readable messages (6000–6019)
14. **Feedback & Attestations** — Reputation formula, give/update/revoke/close feedback, create/revoke/close attestations, scan all feedbacks and attestations for an agent
14h. **Discovery Registry — Finding Agents** — `findAgentsByCapability()`, `findAgentsByProtocol()`, `findToolsByCategory()`, `getAgentProfile()`, `getNetworkOverview()`, `isAgentActive()`
15. **Ledger & Memory (Read Paths)** — Read ring buffer, read sealed pages, read all chronologically, verify merkle root integrity
16. **Transaction Parsing & Events** — Parse logs, filter events, complete TX analysis
16b. **Tool Schema Discovery & Validation (v0.6.2)** — Check schema completeness, retrieve inscribed schemas from TX logs, validate requests with AJV
16c. **Agent & Tool Analytics for Consumers (v0.6.2)** — Quality scoring, agent comparison, spending tracking per agent
17. **Dual-Role: Client + Merchant** — Both-role pattern with PDA isolation
18. **Complete Type Reference** — All enums, unions, account data types, registry types, v0.6.0 types
19. **Lifecycle Checklist** — Step-by-step consumer flow

### What the Merchant Guide Covers (24 sections)

1. **Role Overview** — What a merchant does in the SAP ecosystem
2. **Imports Cheat-Sheet** — Every import for the seller role
3. **Creating Your Client** — Connection setup with `SapConnection.mainnet()`, `fromKeypair()`
4. **Registering Your Agent** — Direct registration + fluent `AgentBuilder` pattern
5. **Pricing, Enums and Typing** — `TokenType`, `SettlementMode`, `ToolCategory`, volume curves
6. **Endpoint Descriptors & Agent Manifest (v0.6.0)** — Typed endpoint metadata, health checks, tool manifests
7. **Publishing Tools** — `publishByName()` with schemas, HTTP methods, categories, inscriptions
8. **Tool Lifecycle** — Update, deactivate, reactivate, close, report invocations
8b. **Tool Schema Inscription Pipeline (v0.6.2)** — Complete 3-step publish+inscribe flow, compressed schemas, builder pattern, CLI manifest commands
8c. **Tool Analytics & Invocation Tracking (v0.6.2)** — `reportInvocations()`, AgentStats, per-tool revenue, service_hash correlation, merchant dashboard
9. **Discovery Indexing (Be Found)** — Capability/protocol/category indexes
10. **Network Normalization (v0.6.0)** — Network IDs in settlement, header normalization
11. **Settling Payments (x402)** — Single and batch settlement, hash computation, escrow queries
12. **Zod Schema Validation (v0.6.0)** — Validate registration args, manifests, call inputs
13. **RPC Strategy & Dual Connection (v0.6.0)** — Dual RPC for production stability
14. **Error Classification (v0.6.0)** — SAP error code → message mapping
15. **Memory Systems — Vault & Ledger** — Two memory systems compared, vault architecture (epoch system, merkle accumulator, nonce rotation), SessionManager high-level API, VaultModule low-level (init, open, inscribe 8-arg, compact 4-arg, multi-fragment, close lifecycle), LedgerModule (ring buffer, write/seal/close, cost model)
16. **Delegate Hot-Wallet Access** — Permission bitmask (Inscribe=1, CloseSession=2, OpenSession=4, All=7), add/revoke delegate, inscribe via delegate auth chain, hot wallet production pattern, expiry management
17. **Attestations (Web of Trust)** — Institutional trust signals, create with attestation_type + metadata_hash + expires_at, revoke/close lifecycle, common attestation types, scan all attestations, self-attestation blocked
18. **Reputation, Feedback & Metrics** — Reputation score formula `(sum×10)/count` (0-10000), self-reported vs feedback-driven distinction, full feedback lifecycle (give/update/revoke/close), self-review prevention, scan all feedbacks, composite AgentProfile
19. **Events to Listen For** — All SAP events with key fields (both agent/client events)
20. **Plugin Adapter (52 Tools)** — `createSAPPlugin()` → LangChain StructuredTool integration
21. **PostgreSQL Mirror** — Off-chain indexing with `PostgresListener`
22. **Dual-Role: Merchant + Client** — Serve and consume in the same wallet
23. **Complete Type Reference** — Full type catalog: account data, instruction args, registry types
24. **Lifecycle Checklist** — 19-step production deployment flow

### When to Use Which Guide

| Your agent needs to… | Read |
|----------------------|------|
| Find and call another agent's x402 endpoint | **client.md** §3 + §6 |
| Create and fund an escrow | **client.md** §6 + §7 |
| Validate an agent's endpoint before paying | **client.md** §4 |
| Check if an agent's tools have inscribed schemas | **client.md** §16b |
| Evaluate agent quality before committing funds | **client.md** §16c |
| Retrieve a tool's JSON Schema for input validation | **client.md** §16b |
| Discover agents by capability, protocol, or tool category | **client.md** §14h |
| Get a full agent profile with composite view | **client.md** §14h |
| Get network-wide statistics (total agents, tools, etc.) | **client.md** §14h |
| Give, update or revoke feedback for an agent | **client.md** §14b–§14d |
| Create attestations as a consumer/DAO/partner | **client.md** §14f |
| Understand reputation scores and what they mean | **client.md** §14a |
| Read an agent's ledger ring buffer or sealed pages | **client.md** §15 |
| Verify ledger data integrity via merkle root | **client.md** §15 |
| Register on-chain and become discoverable | **merchant.md** §4 + §9 |
| Publish tools with JSON schemas | **merchant.md** §7 |
| Inscribe full schemas (input + output + description) | **merchant.md** §8b |
| Track tool invocations and per-tool revenue | **merchant.md** §8c |
| Build a merchant analytics dashboard | **merchant.md** §8c |
| Settle x402 payments after serving calls | **merchant.md** §11 |
| Store encrypted conversation memory on-chain | **merchant.md** §15a–§15c |
| Use the ring buffer ledger for hot memory | **merchant.md** §15d |
| Delegate a hot wallet for automated vault operations | **merchant.md** §16 |
| Issue or receive attestations (KYC, audit, API verified) | **merchant.md** §17 |
| Understand and manage your reputation score | **merchant.md** §18a–§18b |
| Read feedbacks you've received and scan reviewers | **merchant.md** §18e |
| Build a plugin that exposes all 52 SAP tools | **merchant.md** §20 |
| Mirror on-chain data to PostgreSQL | **merchant.md** §21 |
| Act as both buyer and seller | **client.md** §17 or **merchant.md** §22 |
| Use the CLI instead of writing code | **§28** below |

---

## 28. SAP CLI — `synapse-sap`

The `synapse-sap` CLI gives agents **full protocol access from the terminal** — no code required. It exposes 10 command groups with 40+ subcommands covering every SAP operation: agent lifecycle, discovery, escrow management, x402 payments, tool manifests, environment setup, diagnostics, and more.

> **📚 Full CLI reference:** https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/cli/README.md

### Installation

```bash
# Global install from npm
npm install -g @oobe-protocol-labs/synapse-sap-cli

# Or from the monorepo
cd synapse-sap-sdk/cli && npm install && npm run build && npm link
```

### Initial Setup

```bash
# Configure OOBE Protocol RPC
synapse-sap config set rpcUrl "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY"

# Initialize environment
synapse-sap env init --template devnet
synapse-sap env check

# Generate or import a keypair
synapse-sap env keypair generate --out keys/my-agent.json
synapse-sap env keypair import /path/to/existing.json --out keys/imported.json

# Run diagnostics
synapse-sap doctor run --quick
```

### 10 Command Groups

| Group | Commands | Description |
|-------|----------|-------------|
| **`agent`** | `list`, `info`, `tools`, `health`, `register` | Agent lifecycle — discover, inspect, register |
| **`discovery`** | `scan`, `validate`, `cache` | Network scanning — find agents, validate endpoints, cache results |
| **`escrow`** | `open`, `deposit`, `withdraw`, `close`, `dump`, `list`, `monitor` | Escrow lifecycle — create, fund, withdraw, close, monitor |
| **`x402`** | `headers`, `call`, `sign`, `verify`, `settle`, `replay` | Payment flows — generate headers, execute calls, settle, replay artifacts |
| **`tools`** | `manifest generate`, `manifest validate`, `typify`, `publish`, `compare`, `doc` | Tool management — generate/validate manifests, publish schemas, diff agents |
| **`env`** | `init`, `check`, `keypair show`, `keypair generate`, `keypair import` | Environment — .env templates, keypair management, validation |
| **`config`** | `show`, `set`, `edit`, `reset`, `path` | Configuration — per-profile settings in `~/.config/synapse-sap/config.json` |
| **`doctor`** | `run` | Diagnostics — Node version, SDK version, RPC connectivity, program deployment |
| **`tmp`** | `list`, `cat`, `diff`, `clean`, `archive` | Artifact management — inspect, diff, clean temp files |
| **`plugin`** | `list`, `install`, `create`, `validate` | Plugin system — install npm plugins, scaffold new ones |

### Key Workflows via CLI

#### Discover and Inspect Agents

```bash
# List all active agents that support Jupiter swap
synapse-sap agent list --active --capability jupiter:swap

# Full profile with tools and endpoints
synapse-sap agent info <WALLET> --fetch-tools --fetch-endpoints

# Health check across all endpoints
synapse-sap agent health <WALLET> --timeout 5000 --retries 3

# Scan entire network
synapse-sap discovery scan --limit 100 --sort reputation --output json
```

#### Manage Escrows

```bash
# Open escrow with 0.1 SOL deposit, 100 max calls, 24h expiry
synapse-sap escrow open <AGENT_WALLET> --deposit 100000000 --max-calls 100 --expires 86400

# Top up
synapse-sap escrow deposit <AGENT_WALLET> --amount 50000000

# Monitor balance in real time
synapse-sap escrow monitor <AGENT_WALLET>

# Close and reclaim rent
synapse-sap escrow close <AGENT_WALLET>
```

#### Execute x402 Calls

```bash
# Generate x402 headers for manual use (pipe to curl/httpie)
synapse-sap x402 headers <AGENT_WALLET> --network mainnet --output json

# End-to-end x402 call (create headers + HTTP request + save artifact)
synapse-sap x402 call <AGENT_WALLET> jupiterSwap \
  --args '{"inputMint":"So111...","outputMint":"EPjFW...","amount":1000000000}' \
  --endpoint https://agent.example.com/x402 \
  --save

# Replay a saved call artifact
synapse-sap x402 replay /tmp/synapse-sap/call-2024-01-15.json
```

#### Register and Publish (Merchant)

```bash
# Register agent from manifest file
synapse-sap agent register --manifest agent-manifest.json --simulate

# Generate manifest from on-chain data
synapse-sap tools manifest generate <WALLET> --out manifest.json --include-schema

# Publish tools to on-chain registry
synapse-sap tools publish manifest.json

# Compare capabilities between two agents
synapse-sap tools compare <WALLET_A> <WALLET_B>
```

#### Environment and Diagnostics

```bash
# Full diagnostic check (saves report)
synapse-sap doctor run --save

# View current config
synapse-sap config show

# Switch between profiles
synapse-sap config set cluster devnet --profile testing
synapse-sap config set cluster mainnet-beta --profile production
```

### Global Flags

Every command accepts these flags:

| Flag | Description |
|------|-------------|
| `--rpc <url>` | Override primary RPC endpoint |
| `--fallback-rpc <url>` | Override fallback RPC |
| `--program <pubkey>` | Custom SAP program ID |
| `--cluster <cluster>` | Cluster override (`mainnet-beta` \| `devnet` \| `localnet`) |
| `--keypair <path>` | Wallet keypair path |
| `--json` | Machine-readable JSON output |
| `--dry-run` | Preview without sending transactions |
| `--silent` | Suppress logs |

### CLI vs SDK — When to Use Which

| Task | CLI | SDK |
|------|-----|-----|
| Quick agent lookup / health check | ✅ Fastest | Overkill |
| Escrow management (open, deposit, close) | ✅ Great for ops | ✅ Great for automation |
| x402 one-off call | ✅ Perfect | Verbose |
| Batch x402 calls in a loop | Manual piping | ✅ Native async |
| Register agent (one-time setup) | ✅ Ideal | ✅ Works too |
| Publish tool manifests | ✅ File-based workflow | ✅ Programmatic |
| Integrate in LangChain / MCP pipeline | Not applicable | ✅ Only option |
| CI/CD pipeline (test, validate, publish) | ✅ Shell-scriptable | Less practical |
| Real-time escrow monitoring | ✅ `escrow monitor` | WebSocket-based |
| Diagnostics and debugging | ✅ `doctor run` | Manual checks |

> **For AI agents:** The CLI is a powerful **autonomous action tool**. An agent can shell out to `synapse-sap` commands for protocol operations without embedding the SDK in its runtime. This is especially useful for agents running in sandboxed environments, Docker containers, or CI/CD pipelines where importing the full SDK is impractical.

---

## Quick Reference — Import Paths

| Import Path | What |
|-------------|------|
| `@oobe-protocol-labs/synapse-client-sdk` | Core: `SynapseClient`, types, utils, decoders, programs |
| `@oobe-protocol-labs/synapse-client-sdk/ai/tools` | LangChain: `createExecutableSolanaTools`, protocol tool factories |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins` | `SynapseAgentKit` + all 5 plugins |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/token` | `TokenPlugin` (22 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/nft` | `NFTPlugin` (19 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/defi` | `DeFiPlugin` (43 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/misc` | `MiscPlugin` (20 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/plugins/blinks` | `BlinksPlugin` (6 tools) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/mcp` | `SynapseMcpServer` + `McpClientBridge` |
| `@oobe-protocol-labs/synapse-client-sdk/ai/gateway` | Gateway, sessions, pricing, x402, monetization |
| `@oobe-protocol-labs/synapse-client-sdk/ai/gateway/x402` | x402 sub-module |
| `@oobe-protocol-labs/synapse-client-sdk/ai/gateway/monetize` | Monetized tools sub-module |
| `@oobe-protocol-labs/synapse-client-sdk/ai/intents` | Intent parser, planner, executor |
| `@oobe-protocol-labs/synapse-client-sdk/ai/sap` | Synapse Agent Protocol (client-side) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/actions` | Solana Actions / Blinks server |
| `@oobe-protocol-labs/synapse-client-sdk/ai/persistence` | State store (memory, file, redis) |
| `@oobe-protocol-labs/synapse-client-sdk/ai/lazy` | Lazy-loading utilities |
| `@oobe-protocol-labs/synapse-client-sdk/kit` | @solana/kit bridge |
| `@oobe-protocol-labs/synapse-client-sdk/context` | IoC container |
| `@oobe-protocol-labs/synapse-client-sdk/next` | Next.js integration utilities |
| `@synapse-sap/sdk` | Full SAP on-chain SDK (separate package) |
| `@synapse-sap/sdk/plugin` | SAP plugin adapter for SynapseAgentKit |
| `@synapse-sap/sdk/errors` | SAP error hierarchy |
| `@synapse-sap/sdk/pda` | PDA derivation helpers |
| `@synapse-sap/sdk/utils` | SHA-256, base58, hashing utilities |
| **SAP CLI** | `synapse-sap` — global CLI (10 command groups, 40+ subcommands) |
| **Skill Guide — Client** | `skills/client.md` — consumer role reference (19 sections) |
| **Skill Guide — Merchant** | `skills/merchant.md` — seller role reference (24 sections) |

---

## Quick Reference — SAP CLI Commands

| Command | Example | Description |
|---------|---------|-------------|
| `agent list` | `synapse-sap agent list --active --capability jupiter:swap` | Find agents |
| `agent info` | `synapse-sap agent info <WALLET> --fetch-tools` | Inspect agent profile |
| `agent health` | `synapse-sap agent health <WALLET>` | Ping endpoints |
| `escrow open` | `synapse-sap escrow open <WALLET> --deposit 100000000` | Create escrow |
| `escrow monitor` | `synapse-sap escrow monitor <WALLET>` | Real-time balance |
| `x402 call` | `synapse-sap x402 call <WALLET> swap --args '{...}'` | End-to-end x402 call |
| `x402 headers` | `synapse-sap x402 headers <WALLET> --output json` | Generate payment headers |
| `tools publish` | `synapse-sap tools publish manifest.json` | Publish tools on-chain |
| `discovery scan` | `synapse-sap discovery scan --sort reputation` | Network scan |
| `doctor run` | `synapse-sap doctor run --quick` | Run diagnostics |

---

## Quick Reference — Endpoints

| Region | Endpoint | Protocol | URL |
|--------|----------|----------|-----|
| US | Mainnet RPC | HTTPS | `https://us-1-mainnet.oobeprotocol.ai?api_key=KEY` |
| US | Mainnet WS | WSS | `wss://us-1-mainnet.oobeprotocol.ai/ws?api_key=KEY` |
| US | Mainnet gRPC | HTTPS | `https://us-1-mainnet.oobeprotocol.ai/grpc?api_key=KEY` |
| EU | Mainnet RPC | HTTPS | `https://staging.oobeprotocol.ai?api_key=KEY` |
| EU | Mainnet WS | WSS | `wss://staging.oobeprotocol.ai/ws?api_key=KEY` |
| SAP | Synapse Gateway | HTTPS | `https://synapse.oobeprotocol.ai` |
| CLI | Default RPC config | HTTPS | `synapse-sap config set rpcUrl "https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=KEY"` |

---

## Quick Reference — SAP Skill Guides

| Guide | Sections | URL |
|-------|----------|-----|
| **Client (Consumer)** | 19 sections — discovery, escrow, x402 headers, Zod validation, RPC strategy, error codes | [skills/client.md](https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/client.md) |
| **Merchant (Seller)** | 24 sections — registration, tool publishing, settlement, memory, delegation, attestations, plugin, PostgreSQL | [skills/merchant.md](https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/skills/merchant.md) |
| **CLI Reference** | 10 command groups, 40+ subcommands | [cli/README.md](https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/cli/README.md) |

---

## Quick Reference — Jupiter API

| Setting | Value |
|---------|-------|
| **Default API URL** | `https://api.jup.ag` (hardcoded in SDK as `JUPITER_API_URL`) |
| **Deprecated URL** | ~~`https://quote-api.jup.ag/v6`~~ — **NEVER use this** |
| **Tool count** | 22 tools |
| **API key param** | `apiKey` (passed to `createJupiterTools()`) |
| **apiUrl override** | Not needed — only override if you have a custom Jupiter proxy |

---

## Technical Examples — Step-by-Step Agent Guide

This section provides detailed, production-ready examples with full technical explanations. Use these as reference when implementing user requests.

---

### Transfer SOL between wallets

**What happens under the hood:**
1. Build a `SystemProgram.transfer` instruction with sender, recipient, and lamport amount.
2. Get a recent blockhash (required — transactions expire after ~60 seconds).
3. Construct a `VersionedTransaction` with the instruction.
4. Sign with the sender's keypair.
5. Submit via `sendTransaction` and confirm.

```ts
import { SynapseClient, Pubkey, Lamports } from '@oobe-protocol-labs/synapse-client-sdk';
import {
  SystemProgram,
} from '@oobe-protocol-labs/synapse-client-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

const ENDPOINT = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;
const client = new SynapseClient({ endpoint: ENDPOINT });
const connection = new Connection(ENDPOINT);

// 1. Sender keypair (loaded from env — NEVER hardcode)
const secret = JSON.parse(process.env.WALLET_SECRET!);
const sender = Keypair.fromSecretKey(Uint8Array.from(secret));

// 2. Build the transfer instruction
//    Amount is in LAMPORTS: 1 SOL = 1_000_000_000 lamports
const amountSol = 0.5;
const amountLamports = amountSol * 1e9; // 500_000_000

const transferIx = SystemProgram.transfer({
  fromPubkey: sender.publicKey,
  toPubkey: new PublicKey('RECIPIENT_WALLET_ADDRESS_HERE'),
  lamports: amountLamports,
});

// 3. Get recent blockhash (transaction validity window)
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

// 4. Build a VersionedTransaction (v0 — supports Address Lookup Tables)
const messageV0 = new TransactionMessage({
  payerKey: sender.publicKey,
  recentBlockhash: blockhash,
  instructions: [transferIx],
}).compileToV0Message();

const tx = new VersionedTransaction(messageV0);
tx.sign([sender]);

// 5. Send and confirm
const signature = await connection.sendTransaction(tx, {
  skipPreflight: false,  // always simulate first in production
  maxRetries: 3,
});

// 6. Wait for confirmation
const confirmation = await connection.confirmTransaction(
  { signature, blockhash, lastValidBlockHeight },
  'confirmed',
);

if (confirmation.value.err) {
  throw new Error(`Transfer failed: ${JSON.stringify(confirmation.value.err)}`);
}

console.log(`✅ Sent ${amountSol} SOL — tx: ${signature}`);
```

> **Agent notes:**
> - Always convert SOL → lamports (× 1e9). Users say "send 1 SOL" but Solana works in lamports.
> - Check sender balance BEFORE building the TX: `await client.rpc.getBalance(Pubkey(sender.publicKey.toBase58()))`.
> - The minimum balance to keep an account alive (rent-exempt) is ~0.00089 SOL. Never drain a wallet to exactly 0.

---

### Transfer SPL Tokens (USDC, etc.)

**What happens under the hood:**
1. Find (or create) the Associated Token Account (ATA) for the recipient.
2. Build a `SplToken.transfer` or `SplToken.transferChecked` instruction.
3. Sign and send.

SPL tokens live in **token accounts** (not wallet accounts). Each wallet has one ATA per token mint. If the recipient hasn't received this token before, their ATA doesn't exist yet — you must create it first.

```ts
import {
  SplToken,
  AssociatedToken,
} from '@oobe-protocol-labs/synapse-client-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const connection = new Connection(ENDPOINT);

const sender = Keypair.fromSecretKey(/* ... */);
const recipientWallet = new PublicKey('RECIPIENT_WALLET_HERE');

// USDC mint on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

// 1. Derive ATAs (deterministic — no network call)
const senderAta = getAssociatedTokenAddressSync(USDC_MINT, sender.publicKey);
const recipientAta = getAssociatedTokenAddressSync(USDC_MINT, recipientWallet);

// 2. Check if recipient ATA exists
const recipientAtaInfo = await connection.getAccountInfo(recipientAta);

const instructions = [];

// 3. If recipient ATA doesn't exist, create it (sender pays rent ~0.002 SOL)
if (!recipientAtaInfo) {
  instructions.push(
    AssociatedToken.createIdempotent({
      payer: sender.publicKey,
      associatedToken: recipientAta,
      owner: recipientWallet,
      mint: USDC_MINT,
    }),
  );
}

// 4. Transfer with decimal check (safer — prevents wrong-mint transfers)
const amountUsdc = 10;  // 10 USDC
const amountRaw = amountUsdc * 10 ** USDC_DECIMALS;  // 10_000_000

instructions.push(
  SplToken.transferChecked({
    source: senderAta,
    mint: USDC_MINT,
    destination: recipientAta,
    owner: sender.publicKey,
    amount: amountRaw,
    decimals: USDC_DECIMALS,
  }),
);

// 5. Build, sign, send
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

const messageV0 = new TransactionMessage({
  payerKey: sender.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message();

const tx = new VersionedTransaction(messageV0);
tx.sign([sender]);

const signature = await connection.sendTransaction(tx);
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

console.log(`✅ Sent ${amountUsdc} USDC — tx: ${signature}`);
```

> **Agent notes:**
> - `transferChecked` is safer than `transfer` — it verifies the mint and decimals match. Always prefer it.
> - If the recipient wallet has never held a token, you MUST create their ATA first. Use `createIdempotent` (no-op if it already exists).
> - Common token decimals: SOL=9, USDC=6, BONK=5. Always look up the mint's `decimals` field.
> - The sender pays ~0.00203 SOL rent for creating a new ATA.

---

### Swap tokens via Jupiter (using AI tools)

**Two approaches:** Ultra API (simple) vs Metis/Swap API (full control).

#### Ultra API (Recommended for simple swaps)

```ts
import { createJupiterTools } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';

const { tools, toolMap } = createJupiterTools({
  apiKey: process.env.JUPITER_API_KEY,
});

// Ultra flow: getOrder → executeOrder
// Step 1: Get an order (returns a ready-to-sign transaction)
const order = await toolMap.getOrder.invoke({
  inputMint: 'So11111111111111111111111111111111111111112',  // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: 1_000_000_000,  // 1 SOL in lamports
  taker: 'YOUR_WALLET_ADDRESS',
});

// Step 2: Sign and execute
const result = await toolMap.executeOrder.invoke({
  signedTransaction: order.transaction,  // sign this with your wallet first
});
```

#### Metis/Swap API (Full control — custom slippage, routes, instructions)

```ts
// Step 1: Get a quote
const quote = await toolMap.getQuote.invoke({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: 1_000_000_000,
  slippageBps: 50,  // 0.5% slippage tolerance
});

// Step 2: Get swap transaction
const swapResult = await toolMap.swap.invoke({
  quoteResponse: quote,
  userPublicKey: 'YOUR_WALLET_ADDRESS',
  wrapAndUnwrapSol: true,
  dynamicComputeUnitLimit: true,
  prioritizationFeeLamports: 'auto',
});

// Step 3: Sign the returned transaction and submit
```

> **Agent notes:**
> - **Ultra** = simpler, fewer params, Jupiter handles routing + MEV protection. Best for most users.
> - **Metis/Swap** = full control over slippage, priority fees, route selection. Use when the user needs specific settings.
> - **NEVER** pass `apiUrl: 'https://quote-api.jup.ag/v6'` — this deprecated URL causes TOKEN_NOT_TRADABLE errors.
> - `amount` is always in the input token's **base units** (lamports for SOL, raw units for SPL).
> - `slippageBps`: 50 = 0.5%, 100 = 1%, 300 = 3%. For volatile tokens use higher slippage.

---

### Check wallet balance (SOL + all tokens)

```ts
import { SynapseClient, Pubkey, lamportsToSol } from '@oobe-protocol-labs/synapse-client-sdk';

const client = new SynapseClient({ endpoint: ENDPOINT });
const wallet = Pubkey('WALLET_ADDRESS_HERE');

// SOL balance
const { value: solBalance } = await client.rpc.getBalance(wallet);
console.log(`SOL: ${lamportsToSol(solBalance)}`);

// All SPL token balances
const tokenAccounts = await client.rpc.getTokenAccountsByOwner(wallet, {
  programId: Pubkey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
});

for (const { account } of tokenAccounts.value) {
  const data = account.data;
  // Each token account has: mint, owner, amount
  // Use decoders for proper parsing:
  // const decoded = decodeTokenAccount(Buffer.from(data.data[0], data.encoding));
  console.log('Token account:', data);
}
```

> **Agent notes:**
> - `getBalance` returns lamports (bigint). Always convert to SOL for display: `lamportsToSol(value)`.
> - `getTokenAccountsByOwner` returns ALL token accounts. Filter by mint if the user asks about a specific token.
> - To get a human-readable token list with names, follow up with `client.das.getAssetsByOwner()` — DAS returns metadata including token names and images.

---

### Fetch NFTs for a wallet (with collection filtering)

```ts
import { SynapseClient } from '@oobe-protocol-labs/synapse-client-sdk';

const client = new SynapseClient({ endpoint: ENDPOINT });

// Fetch all digital assets (NFTs, cNFTs, fungible tokens)
const { items, total } = await client.das.getAssetsByOwner({
  ownerAddress: 'WALLET_ADDRESS_HERE',
  page: 1,
  limit: 1000,
  displayOptions: {
    showFungible: false,       // exclude fungible tokens
    showNativeBalance: false,  // exclude SOL
  },
});

console.log(`Found ${total} NFTs`);

// Filter by collection
const COLLECTION_MINT = 'YOUR_COLLECTION_MINT_HERE';
const collectionNfts = items.filter((asset) =>
  asset.grouping?.some(
    (g) => g.group_key === 'collection' && g.group_value === COLLECTION_MINT,
  ),
);

console.log(`${collectionNfts.length} NFTs from target collection`);

// Access NFT metadata
for (const nft of collectionNfts) {
  console.log({
    name: nft.content?.metadata?.name,
    image: nft.content?.links?.image,
    mint: nft.id,
    compressed: nft.compression?.compressed ?? false,
  });
}
```

> **Agent notes:**
> - `getAssetsByOwner` does NOT support filtering by collection in the query params. You MUST fetch all and filter client-side.
> - If the user asks "do I own an NFT from collection X?", use the `grouping` array to check.
> - For large wallets, paginate: increment `page` until `items.length < limit`.
> - `nft.compression.compressed === true` means it's a compressed NFT (cNFT) — Merkle proof needed for transfers.

---

### Set priority fees (land transactions faster)

During network congestion, transactions may be dropped. Priority fees incentivize validators to include your transaction first.

```ts
import { ComputeBudget } from '@oobe-protocol-labs/synapse-client-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(ENDPOINT);

// 1. Check recent priority fees for the accounts you're touching
const recentFees = await connection.getRecentPrioritizationFees({
  lockedWritableAccounts: [
    new PublicKey('ACCOUNT_YOU_ARE_WRITING_TO'),
  ],
});

// 2. Calculate a competitive fee (use median or p75)
const fees = recentFees
  .map((f) => f.prioritizationFee)
  .filter((f) => f > 0)
  .sort((a, b) => a - b);

const medianFee = fees[Math.floor(fees.length / 2)] || 1000; // fallback 1000 micro-lamports

// 3. Add priority fee instructions BEFORE your main instructions
const instructions = [
  // Set compute unit limit (tighter = cheaper)
  ComputeBudget.setComputeUnitLimit({ units: 200_000 }),

  // Set price per compute unit (in micro-lamports)
  ComputeBudget.setComputeUnitPrice({ microLamports: medianFee }),

  // ... your actual instructions here (transfer, swap, etc.)
];
```

> **Agent notes:**
> - Priority fee = `computeUnits × microLamportsPerUnit`. A 200K CU tx at 1000 micro-lamports = 0.0002 SOL.
> - Always set `setComputeUnitLimit` to a tight estimate. Default is 200K but many txs use <50K. Tighter limit = lower total fee.
> - For Jupiter swaps, use `prioritizationFeeLamports: 'auto'` in the swap params instead of manual compute budget instructions.
> - During heavy congestion (meme coin launches, etc.), fees can spike to 100K+ micro-lamports. Warn the user about cost.

---

### Create a new SPL token (mint)

```ts
import {
  SystemProgram,
  SplToken,
  AssociatedToken,
} from '@oobe-protocol-labs/synapse-client-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { MINT_SIZE, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const connection = new Connection(ENDPOINT);
const payer = Keypair.fromSecretKey(/* ... */);
const mintKeypair = Keypair.generate(); // new mint address

const DECIMALS = 9; // 9 decimals like SOL, 6 like USDC, 0 for NFTs

// 1. Calculate rent for the mint account
const rentExempt = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

// 2. Build instructions
const instructions = [
  // Create the mint account
  SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: MINT_SIZE,
    lamports: rentExempt,
    programId: TOKEN_PROGRAM_ID,
  }),

  // Initialize mint (set decimals, mint authority, freeze authority)
  SplToken.initializeMint2({
    mint: mintKeypair.publicKey,
    decimals: DECIMALS,
    mintAuthority: payer.publicKey,
    freezeAuthority: payer.publicKey, // null to disable freezing
  }),
];

// 3. Optionally: create ATA and mint initial supply
const payerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);

instructions.push(
  AssociatedToken.createIdempotent({
    payer: payer.publicKey,
    associatedToken: payerAta,
    owner: payer.publicKey,
    mint: mintKeypair.publicKey,
  }),
  SplToken.mintTo({
    mint: mintKeypair.publicKey,
    destination: payerAta,
    authority: payer.publicKey,
    amount: 1_000_000_000 * 10 ** DECIMALS, // 1 billion tokens
  }),
);

// 4. Build, sign (BOTH payer and mint keypair), send
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

const messageV0 = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message();

const tx = new VersionedTransaction(messageV0);
tx.sign([payer, mintKeypair]); // ← mint keypair must also sign

const signature = await connection.sendTransaction(tx);
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

console.log(`✅ Token created — mint: ${mintKeypair.publicKey.toBase58()}`);
```

> **Agent notes:**
> - The mint address is a NEW keypair — it must sign the transaction.
> - `decimals`: 0 for NFTs, 6 for stablecoins, 9 for most tokens. Ask the user if unsure.
> - Rent for a mint account is ~0.00145 SOL (fixed, based on MINT_SIZE=82 bytes).
> - After creation, only the `mintAuthority` can mint new tokens. To make supply fixed, set mintAuthority to `null` after minting.
> - For Token-2022 (new standard with extensions like transfer fees, interest bearing, etc.), use `TOKEN_2022_PROGRAM_ID` instead.

---

### Subscribe to account changes (WebSocket)

```ts
import { SynapseClient, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';

const client = new SynapseClient({ endpoint: ENDPOINT });

// Watch a wallet for any SOL balance changes
const subId = await client.ws.onAccountChange(
  Pubkey('WALLET_TO_WATCH'),
  (accountInfo) => {
    const lamports = accountInfo.lamports;
    console.log(`Balance changed: ${lamports / 1e9} SOL`);
  },
  { commitment: 'confirmed' },
);

// Watch all transactions mentioning an address
const logSubId = await client.ws.onLogs(
  Pubkey('WALLET_OR_PROGRAM_TO_WATCH'),
  (logs) => {
    console.log(`TX: ${logs.signature}`);
    for (const log of logs.logs) {
      console.log(`  ${log}`);
    }
  },
);

// Clean up when done
await client.ws.unsubscribe(subId);
await client.ws.unsubscribe(logSubId);
// or close all: await client.ws.close();
```

> **Agent notes:**
> - WebSocket subscriptions are **long-lived connections**. They stay open until you unsubscribe or close.
> - `onAccountChange` fires whenever ANY data in the account changes (balance, data, owner).
> - `onLogs` fires for every transaction that mentions the address — useful for monitoring tokens, programs, or wallets.
> - In serverless environments (Vercel, AWS Lambda), WebSocket subscriptions won't work — they need a persistent process. Use polling instead.
> - Always call `unsubscribe()` or `close()` to avoid memory leaks.

---

### Airdrop SOL on devnet (testing)

```ts
import { SynapseClient, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';

// Use devnet endpoint (no API key needed)
const client = new SynapseClient({ endpoint: 'https://api.devnet.solana.com' });

const wallet = Pubkey('YOUR_DEVNET_WALLET');

// Request 2 SOL airdrop
const signature = await client.rpc.requestAirdrop(wallet, 2_000_000_000); // 2 SOL in lamports

console.log(`Airdrop requested: ${signature}`);
// Wait a few seconds, then check balance
```

> **Agent notes:**
> - Airdrops only work on **devnet** and **testnet**. Never try on mainnet.
> - Rate limit: ~2 SOL per request, max ~5 requests per minute per IP.
> - If airdrop fails with "Too Many Requests", tell the user to wait 1-2 minutes or use https://faucet.solana.com.
> - For testing with mainnet tokens, use devnet token faucets (not the SOL faucet).

---

### Error handling best practices

```ts
import { SynapseClient, Pubkey } from '@oobe-protocol-labs/synapse-client-sdk';

const client = new SynapseClient({ endpoint: ENDPOINT });

try {
  const balance = await client.rpc.getBalance(Pubkey('SomeAddress...'));
  console.log(balance);
} catch (err) {
  // The SDK throws typed errors — match them for specific handling
  if (err.name === 'NetworkError') {
    // RPC endpoint unreachable — try fallback endpoint or retry
    console.error('Network error — check RPC endpoint or API key');
  } else if (err.name === 'TimeoutError') {
    // Request timed out — retry with longer timeout
    console.error('Request timed out — try again');
  } else if (err.name === 'RpcMethodNotFoundError') {
    // The RPC node doesn't support this method (e.g., DAS on a non-DAS node)
    console.error('RPC method not available on this endpoint');
  } else if (err.name === 'UpstreamError') {
    // The Solana validator returned an error
    console.error('Solana RPC error:', err.message);
  } else if (err.name === 'SynapseError') {
    // Generic SDK error
    console.error('SDK error:', err.message);
  } else {
    throw err; // Unknown error — rethrow
  }
}
```

> **Agent notes:**
> - Always wrap SDK calls in try/catch. Network calls WILL fail occasionally.
> - **Common failures:** invalid pubkey format, insufficient balance, rate limiting (429), blockhash expired.
> - For transaction failures, check `err.logs` — Solana programs emit helpful log messages.
> - Implement retry with exponential backoff for transient errors: `await retry(() => client.rpc.getBalance(pk), { maxRetries: 3 })`.

---

### Compute costs cheatsheet

| Operation | Approximate Cost |
|-----------|-----------------|
| SOL transfer | 0.000005 SOL (5000 lamports base fee) |
| SPL token transfer | 0.000005 SOL base + priority fee |
| Create token account (ATA) | ~0.00203 SOL rent |
| Create token mint | ~0.00145 SOL rent |
| Priority fee (moderate congestion) | 0.0001–0.001 SOL |
| Priority fee (high congestion) | 0.001–0.01 SOL |
| Jupiter swap (typical) | 0.000005 SOL + priority fee + Jupiter platform fee |
| SAP Ledger init | ~0.032 SOL rent |
| SAP Ledger write | ~0.000005 SOL |
| SAP Agent registration | ~0.01 SOL rent |

> **Agent notes:**
> - Rent is **recoverable** — close accounts to get SOL back.
> - Base transaction fee (5000 lamports) is burned, not recoverable.
> - Always tell the user the estimated cost BEFORE executing a transaction.
>> - For multi-instruction transactions, the base fee is still just 5000 lamports — batching is cost-efficient.

---

### Build your own MCP Server (expose Solana tools to any AI client)

An MCP (Model Context Protocol) server lets you expose your Solana tools to **any MCP-compatible AI client** — Claude Desktop, Cursor, VS Code Copilot, Cline, Windsurf, or custom agents. This is how you turn your Solana capabilities into a **reusable service** that any AI can call.

#### Minimal MCP Server (stdio)

```ts
// file: mcp-server.ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, NftPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

// 1. Build your tool kit with the plugins you want to expose
const kit = new SynapseAgentKit({
  rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`,
})
  .use(TokenPlugin)      // getBalance, transfer, getTokenInfo, etc.
  .use(DeFiPlugin)       // Jupiter swap, quote, price, etc.
  .use(NftPlugin);       // getAssetsByOwner, getAsset, etc.

// 2. Create and start the MCP server
const server = new SynapseMcpServer(kit, {
  name: 'my-solana-mcp',
  version: '1.0.0',
  instructions: 'Solana blockchain tools — balances, transfers, swaps, NFTs.',
});

await server.start(); // stdio mode — reads stdin, writes stdout
```

Compile with `tsc` and add to your AI client config:

```json
// Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json
// Cursor: .cursor/mcp.json
// VS Code: .vscode/mcp.json
{
  "mcpServers": {
    "my-solana-mcp": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "env": {
        "OOBE_API_KEY": "your-key-here"
      }
    }
  }
}
```

#### SSE MCP Server (web-accessible, multi-client)

```ts
// SSE mode — HTTP server that multiple clients can connect to
const sseServer = new SynapseMcpServer(kit, {
  name: 'solana-mcp-sse',
  version: '1.0.0',
  transport: 'sse',
  ssePort: 3001,
  ssePath: '/mcp',
  instructions: 'Solana tools via SSE transport.',
});

await sseServer.start(); // HTTP server on port 3001
// Clients connect to: http://localhost:3001/mcp
```

#### MCP Server with SAP tools (full protocol access)

```ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

// Combine Solana tools + SAP protocol tools
const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({
  rpcUrl: `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`,
})
  .use(TokenPlugin)
  .use(DeFiPlugin)
  .use(sapPlugin);  // adds 52 SAP tools (agent, escrow, vault, ledger, tools, discovery...)

const server = new SynapseMcpServer(kit, {
  name: 'solana-full-mcp',
  version: '1.0.0',
  instructions: 'Full Solana + SAP protocol tools for AI agents.',
});

await server.start();
// Now any MCP client has access to ALL Solana + SAP tools
```

#### Consuming external MCP servers (bridge)

You can also **import tools from other MCP servers** and combine them with your Solana tools:

```ts
import { McpClientBridge } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';

const bridge = new McpClientBridge();

// Import GitHub tools
await bridge.connect({
  id: 'github',
  name: 'GitHub',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN! },
  toolPrefix: 'github_',
});

// Import a custom MCP server
await bridge.connect({
  id: 'analytics',
  name: 'Analytics',
  transport: 'sse',
  url: 'https://analytics.example.com/mcp/sse',
  toolPrefix: 'analytics_',
});

// Convert to plugin and add to agent kit
const externalPlugin = bridge.toPlugin();
kit.use(externalPlugin);

// Now your agent has: Solana tools + SAP tools + GitHub tools + Analytics tools
```

> **Agent notes:**
> - **stdio** = one process per client, best for local use (Claude Desktop, Cursor). **SSE** = one server, many clients, best for teams/cloud.
> - MCP servers expose tools, resources, and prompts. Tools are the primary integration.
> - The `instructions` field is the system-level description sent to the AI client — make it descriptive.
> - `toolPrefix` avoids name collisions when combining multiple MCP servers (e.g., `github_list_repos` vs `analytics_list_repos`).
> - To restrict which tools are exposed, create the kit with only the plugins you want.

---

### Sub-Agents — Orchestrating multiple specialized agents

A **sub-agent** is a specialized agent that handles a specific domain. An **orchestrator** delegates work to sub-agents. This is the most powerful pattern for complex tasks.

#### Architecture

```
Orchestrator Agent
├── Swap Sub-Agent       (Jupiter, Raydium — handles all swap logic)
├── NFT Sub-Agent        (DAS, Metaplex — handles NFT queries and minting)
├── Analytics Sub-Agent  (portfolio analysis, price tracking)
└── SAP Sub-Agent        (agent registration, discovery, memory, escrow)
```

#### Building sub-agents with SynapseAgentKit

```ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, NftPlugin, MiscPlugin, BlinksPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { createOpenAIFunctionsAgent, AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from '@langchain/openai';

const RPC_URL = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;

// --- Sub-Agent 1: DeFi specialist ---
const defiKit = new SynapseAgentKit({ rpcUrl: RPC_URL })
  .use(TokenPlugin)
  .use(DeFiPlugin);

const defiAgent = await AgentExecutor.fromAgentAndTools({
  agent: await createOpenAIFunctionsAgent({
    llm: new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 }),
    tools: defiKit.getTools(),
    prompt: defiSystemPrompt, // "You are a DeFi specialist. You handle swaps, quotes, token prices..."
  }),
  tools: defiKit.getTools(),
});

// --- Sub-Agent 2: NFT specialist ---
const nftKit = new SynapseAgentKit({ rpcUrl: RPC_URL })
  .use(NftPlugin);

const nftAgent = await AgentExecutor.fromAgentAndTools({
  agent: await createOpenAIFunctionsAgent({
    llm: new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 }),
    tools: nftKit.getTools(),
    prompt: nftSystemPrompt, // "You are an NFT specialist. You handle NFT queries, minting..."
  }),
  tools: nftKit.getTools(),
});

// --- Sub-Agent 3: SAP protocol specialist ---
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';

const sapKit = new SynapseAgentKit({ rpcUrl: RPC_URL })
  .use(createSAPPlugin({ provider }));

const sapAgent = await AgentExecutor.fromAgentAndTools({
  agent: await createOpenAIFunctionsAgent({
    llm: new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 }),
    tools: sapKit.getTools(),
    prompt: sapSystemPrompt, // "You manage on-chain agent identities, memory, escrow, and tools..."
  }),
  tools: sapKit.getTools(),
});
```

#### Orchestrator pattern

```ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// Wrap each sub-agent as a tool the orchestrator can call
const defiTool = new DynamicStructuredTool({
  name: 'defi_agent',
  description: 'Handles all DeFi operations: token swaps, price quotes, Jupiter/Raydium interactions, token balances.',
  schema: z.object({ request: z.string().describe('The user DeFi request in natural language') }),
  func: async ({ request }) => {
    const result = await defiAgent.invoke({ input: request });
    return result.output;
  },
});

const nftTool = new DynamicStructuredTool({
  name: 'nft_agent',
  description: 'Handles NFT operations: viewing collections, fetching metadata, minting, transferring NFTs.',
  schema: z.object({ request: z.string().describe('The user NFT request in natural language') }),
  func: async ({ request }) => {
    const result = await nftAgent.invoke({ input: request });
    return result.output;
  },
});

const sapTool = new DynamicStructuredTool({
  name: 'sap_agent',
  description: 'Handles SAP protocol operations: agent registration, memory management, escrow, tool publishing, discovery.',
  schema: z.object({ request: z.string().describe('The SAP protocol operation to perform') }),
  func: async ({ request }) => {
    const result = await sapAgent.invoke({ input: request });
    return result.output;
  },
});

// Orchestrator agent — delegates to sub-agents
const orchestrator = await AgentExecutor.fromAgentAndTools({
  agent: await createOpenAIFunctionsAgent({
    llm: new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 }),
    tools: [defiTool, nftTool, sapTool],
    prompt: orchestratorPrompt,
    // "You are an orchestrator. Route user requests to the appropriate specialist:
    //  - DeFi agent for swaps, prices, balances
    //  - NFT agent for NFT queries and operations
    //  - SAP agent for protocol operations (registration, memory, escrow)
    //  Never try to handle Operations yourself — always delegate."
  }),
  tools: [defiTool, nftTool, sapTool],
});

// Now the orchestrator routes:
// "swap 10 SOL to USDC" → defiTool → defiAgent (Jupiter swap)
// "show my NFTs" → nftTool → nftAgent (DAS query)
// "register me as a SAP agent" → sapTool → sapAgent (on-chain registration)
const result = await orchestrator.invoke({ input: 'swap 10 SOL to USDC and then show me my NFTs' });
```

> **Agent notes:**
> - Each sub-agent has its own `SynapseAgentKit` with ONLY the relevant plugins — this reduces token usage and prevents tool confusion.
> - The orchestrator's LLM sees sub-agents as opaque tools — it doesn't know the internal tools. This keeps context windows manageable.
> - For complex multi-step tasks, the orchestrator can call multiple sub-agents in sequence (e.g., "swap then check NFTs").
> - Sub-agents can share the same RPC endpoint and wallet — they're just different tool configurations.
> - For production, add error handling at each sub-agent level AND at the orchestrator level.

---

### Register your agent on SAP (become discoverable on-chain)

Your AI agent can register itself on the Solana Agent Protocol to become **discoverable by other agents and users**, receive **on-chain reputation**, accept **x402 payments**, and store **memory on-chain**.

#### Step 1: Register Agent Identity

```ts
import { SapClient } from '@synapse-sap/sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

const provider = AnchorProvider.env(); // uses ANCHOR_WALLET + ANCHOR_PROVIDER_URL
const client = SapClient.from(provider);

// Register with capabilities (what your agent can do)
await client.agent.register({
  name: 'MySwapBot',
  description: 'AI agent that executes optimal token swaps across Jupiter and Raydium',
  capabilities: [
    { id: 'jupiter:swap', protocolId: 'jupiter', version: '6.0', description: 'Execute Jupiter swaps' },
    { id: 'raydium:swap', protocolId: 'raydium', version: '2.0', description: 'Execute Raydium swaps' },
    { id: 'token:balance', protocolId: 'spl', version: '1.0', description: 'Check token balances' },
  ],
  pricing: [
    { tierId: 'free', pricePerCall: '0', currency: 'SOL' },
    { tierId: 'premium', pricePerCall: '10000000', currency: 'SOL' }, // 0.01 SOL per call
  ],
  protocols: ['jupiter', 'raydium', 'A2A'],
});

console.log('✅ Agent registered on-chain');
```

#### Step 2: Publish tools on-chain

```ts
import { HTTP_METHOD_VALUES, TOOL_CATEGORY_VALUES } from '@synapse-sap/sdk';

// Publish tool descriptors so other agents can discover what your agent offers
await client.tools.publishByName(
  'jupiterSwap',
  'jupiter',
  'Execute an optimal token swap via Jupiter aggregator',
  JSON.stringify({
    type: 'object',
    properties: {
      inputMint: { type: 'string', description: 'Input token mint address' },
      outputMint: { type: 'string', description: 'Output token mint address' },
      amount: { type: 'number', description: 'Amount in base units (lamports)' },
      slippageBps: { type: 'number', description: 'Max slippage in basis points' },
    },
    required: ['inputMint', 'outputMint', 'amount'],
  }),
  JSON.stringify({
    type: 'object',
    properties: {
      signature: { type: 'string' },
      inputAmount: { type: 'string' },
      outputAmount: { type: 'string' },
    },
  }),
  HTTP_METHOD_VALUES.Post,
  TOOL_CATEGORY_VALUES.Swap,
  4,     // paramsCount
  3,     // requiredParams
  false, // isCompound
);

// Add to capability index (makes it findable by other agents)
await client.indexing.initCapabilityIndex('jupiter:swap');
await client.indexing.addToCapabilityIndex('jupiter:swap');

console.log('✅ Tool published and indexed on-chain');
```

#### Step 3: Enable x402 payments (monetize your agent)

```ts
// Other agents/users pay before calling your tools
// Set up escrow pricing with volume discounts

await client.escrow.create({
  agent: provider.wallet.publicKey,
  amount: new BN(0),  // initial deposit from self (usually 0)
  pricingCurve: [
    { callThreshold: 0,    pricePerCall: new BN(10_000_000) },   // 0.01 SOL/call (first 100)
    { callThreshold: 100,  pricePerCall: new BN(5_000_000) },    // 0.005 SOL/call (100-1000)
    { callThreshold: 1000, pricePerCall: new BN(1_000_000) },    // 0.001 SOL/call (1000+)
  ],
  expiresAt: new BN(Math.floor(Date.now() / 1000) + 30 * 86400), // 30 days
});

console.log('✅ x402 escrow configured — agent is now monetized');
```

#### Step 4: Enable memory (store conversation state on-chain)

```ts
const session = client.session;

// Start a session — creates vault + session + ledger as needed
const ctx = await session.start('user-123-conversation');

// Store conversation turns
await session.write(ctx, 'User: swap 10 SOL to USDC');
await session.write(ctx, 'Agent: Executing via Jupiter. Quote: 10 SOL → 248.5 USDC...');
await session.write(ctx, 'Agent: ✅ Swap complete. TX: 4xK3...');

// Read back (ring buffer — latest entries)
const history = await session.readLatest(ctx);

// Seal to permanent storage when conversation ends
await session.seal(ctx);
await session.close(ctx); // reclaim rent

console.log('✅ Conversation stored on-chain');
```

#### Step 5: Report health metrics

```ts
// Periodically report metrics so your reputation score stays high
await client.agent.reportCalls(500);                 // total calls served
await client.agent.updateReputation(120, 9990);      // avg latency (ms), uptime (bps: 99.9%)

// Check your own profile
const profile = await client.discovery.getAgentProfile(provider.wallet.publicKey);
console.log(`Reputation score: ${profile?.computed.reputationScore}/1000`);
console.log(`Total calls: ${profile?.identity.totalCalls}`);
```

> **Agent notes:**
> - Registration costs ~0.01 SOL (rent — recoverable via `client.agent.close()`).
> - The agent PDA is derived from the wallet: `deriveAgentPDA(walletPubkey)`.
> - Capability IDs should use `protocol:action` format (e.g., `jupiter:swap`, `das:getAsset`).
> - After registration, OTHER agents can discover you via `client.discovery.findAgentsByCapability('jupiter:swap')`.
> - x402 payments are automatic — consumers deposit into your escrow, you settle after serving calls.
> - Memory (Ledger) has a 4KB ring buffer. Seal proactively when >80% full to avoid data loss.

---

### Discover and call other SAP agents (agent-to-agent)

Your agent can find and interact with other registered agents on the SAP network:

```ts
import { SapClient } from '@synapse-sap/sdk';

const client = SapClient.from(provider);

// 1. Find agents that can do what you need
const swapAgents = await client.discovery.findAgentsByCapability('jupiter:swap');
console.log(`Found ${swapAgents.length} agents that can swap via Jupiter`);

// 2. Get full profiles — pick the best one
for (const agent of swapAgents) {
  const profile = await client.discovery.getAgentProfile(agent.wallet);
  if (!profile) continue;

  console.log({
    name: profile.identity.name,
    reputation: profile.computed.reputationScore,  // 0–1000
    uptime: profile.identity.uptimeBps / 100 + '%',
    hasX402: profile.computed.hasX402,
    pricing: profile.identity.pricing,
  });
}

// 3. Pay and call the agent (x402 flow)
const bestAgent = swapAgents[0];

// Estimate cost
const cost = await client.x402.estimateCost(bestAgent.wallet, 1); // 1 call

// Prepare payment (creates escrow deposit)
const payment = await client.x402.preparePayment(bestAgent.wallet, {
  amount: cost,
  currency: 'SOL',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});

// Build x402 headers for the HTTP request
const headers = client.x402.buildPaymentHeaders(payment);

// Call the agent's endpoint (A2A protocol)
const response = await fetch(`https://agent-endpoint.example.com/api/swap`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...headers,  // x402 payment proof
  },
  body: JSON.stringify({
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: 1_000_000_000,
  }),
});

// 4. Leave feedback (builds on-chain reputation)
await client.feedback.give(bestAgent.wallet, {
  score: 5,          // 1-5
  comment: 'Fast execution, good price',
});

// 5. Network overview — see the whole SAP ecosystem
const overview = await client.discovery.getNetworkOverview();
console.log(`Network: ${overview.totalAgents} agents, ${overview.activeAgents} active`);
console.log(`Tools: ${overview.totalTools}, Vaults: ${overview.totalVaults}`);
```

> **Agent notes:**
> - `findAgentsByCapability` returns agents sorted by reputation. The first result is typically the best.
> - `findAgentsByCapabilities(['jupiter:swap', 'raydium:swap'])` finds agents with ANY of those capabilities (deduplicated).
> - x402 payment flow: estimate → prepare → build headers → include in HTTP request. The agent settles after serving.
> - Feedback is on-chain and immutable. Score 1-5. Can be updated but not deleted.
> - `getNetworkOverview()` is useful for showing the user the size/health of the SAP network.

---

### Full production agent setup (everything together)

This is a complete example of a production-ready agent that:
1. Registers on SAP with capabilities
2. Publishes tools on-chain
3. Creates an MCP server
4. Handles x402 payments
5. Stores memory on-chain

```ts
// file: production-agent.ts
import { SynapseAgentKit, TokenPlugin, DeFiPlugin, NftPlugin } from '@oobe-protocol-labs/synapse-client-sdk/ai/plugins';
import { SynapseMcpServer } from '@oobe-protocol-labs/synapse-client-sdk/ai/mcp';
import { createSAPPlugin } from '@synapse-sap/sdk/plugin';
import { SapClient } from '@synapse-sap/sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

const RPC_URL = `https://us-1-mainnet.oobeprotocol.ai?api_key=${process.env.OOBE_API_KEY}`;
const provider = AnchorProvider.env();
const sapClient = SapClient.from(provider);

// ── 1. Register on SAP ──────────────────────────────────
try {
  await sapClient.agent.register({
    name: 'SynapseFullAgent',
    description: 'Full-featured Solana AI agent — swaps, NFTs, portfolio, SAP protocol',
    capabilities: [
      { id: 'jupiter:swap', protocolId: 'jupiter', version: '6.0', description: null },
      { id: 'das:getAsset', protocolId: 'das', version: '1.0', description: null },
      { id: 'token:balance', protocolId: 'spl', version: '1.0', description: null },
    ],
    pricing: [
      { tierId: 'free', pricePerCall: '0', currency: 'SOL' },
    ],
    protocols: ['jupiter', 'das', 'A2A'],
  });
  console.log('✅ Registered on SAP');
} catch (err) {
  // Already registered — that's fine
  console.log('Agent already registered, continuing...');
}

// ── 2. Build agent kit ──────────────────────────────────
const sapPlugin = createSAPPlugin({ provider });

const kit = new SynapseAgentKit({ rpcUrl: RPC_URL })
  .use(TokenPlugin)
  .use(DeFiPlugin)
  .use(NftPlugin)
  .use(sapPlugin);

console.log(`Tools loaded: ${kit.getTools().length}`);

// ── 3. Start MCP server ─────────────────────────────────
const mcpServer = new SynapseMcpServer(kit, {
  name: 'synapse-full-agent',
  version: '2.0.2',
  transport: process.env.MCP_TRANSPORT === 'sse' ? 'sse' : 'stdio',
  ssePort: parseInt(process.env.MCP_PORT || '3001'),
  ssePath: '/mcp',
  instructions: [
    'Full Solana AI agent with swap, NFT, balance, and SAP protocol capabilities.',
    'Use jupiter:swap tools for token exchanges.',
    'Use DAS tools for NFT and asset queries.',
    'Use SAP tools for on-chain agent management.',
  ].join(' '),
});

await mcpServer.start();
console.log('✅ MCP server running');

// ── 4. Health reporting loop ─────────────────────────────
let callCount = 0;
setInterval(async () => {
  try {
    await sapClient.agent.reportCalls(callCount);
    await sapClient.agent.updateReputation(
      100,    // avg latency ms
      9990,   // uptime 99.9%
    );
  } catch {
    // Non-critical — skip
  }
}, 60_000); // every minute

// ── 5. Graceful shutdown ─────────────────────────────────
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await mcpServer.stop();
  process.exit(0);
});
```

> **Agent notes:**
> - This is a **standalone agent process** — run with `node dist/production-agent.js` or as a Docker container.
> - In Next.js API routes, skip the MCP server and use `kit.getTools()` directly with LangChain.
> - Agent registration is idempotent — safe to call on every startup (wrap in try/catch for "already registered").
> - Health reporting is optional but strongly recommended for discovery ranking.
> - The SAP plugin adds ~52 tools. If you don't need all SAP capabilities, use specific modules directly instead.

---

## ⚠️ MANDATORY — Always read the full documentation before answering

**Before answering any question about the Synapse Client SDK, SAP Protocol, or SAP SDK, you MUST fetch and read the relevant documentation from GitHub.** Do NOT rely solely on this skills.md file — it is a summary. The full docs contain implementation details, edge cases, parameter options, and examples that are not included here.

### Documentation sources to read

#### 1. Synapse Client SDK Docs (ALL files)

Fetch every `.md` file from:

```
https://github.com/OOBE-PROTOCOL/synapse-client-sdk/tree/main/docs_md
```

Individual doc files to read:

| File | URL | Covers |
|------|-----|--------|
| `00-getting-started.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/00-getting-started.md | Installation, SynapseClient setup, basic RPC calls |
| `01-rpc.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/01-rpc.md | All RPC methods, branded types, error handling |
| `02-das.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/02-das.md | Digital Asset Standard — NFTs, cNFTs, fungible assets |
| `03-websocket.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/03-websocket.md | WebSocket subscriptions, account changes, logs |
| `04-grpc.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/04-grpc.md | gRPC streaming — Yellowstone Geyser |
| `05-ai-tools.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/05-ai-tools.md | createExecutableSolanaTools, createJupiterTools, LangChain integration |
| `06-ai-plugins.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/06-ai-plugins.md | SynapseAgentKit, TokenPlugin, DeFiPlugin, NftPlugin, MiscPlugin, BlinksPlugin |
| `07-ai-gateway.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/07-ai-gateway.md | AgentGateway, x402, monetization, session management |
| `08-ai-mcp.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/08-ai-mcp.md | MCP server, MCP client bridge, stdio/SSE transport |
| `09-ai-persistence.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/09-ai-persistence.md | Persistence adapters — memory, file, Redis, Postgres |
| `10-ai-context.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/10-ai-context.md | Context management, conversation state |
| `11-nextjs.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-client-sdk/main/docs_md/11-nextjs.md | Next.js integration patterns, server/client separation |

#### 2. SAP SDK Docs (ALL files)

Fetch every `.md` file from:

```
https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/tree/main/docs
```

Individual doc files to read:

| File | URL | Covers |
|------|-----|--------|
| `00-overview.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/00-overview.md | Architecture overview, module tree, protocol layers |
| `01-installation.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/01-installation.md | Installation, peer dependencies, environment setup |
| `02-quickstart.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/02-quickstart.md | Quick start — registration, memory, discovery in 5 minutes |
| `03-agent-lifecycle.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/03-agent-lifecycle.md | Agent registration, update, deactivate, reactivate, close, metrics |
| `04-memory-systems.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/04-memory-systems.md | Ledger, Vault, SessionManager — ring buffers, encryption, sealing |
| `05-x402-payments.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/05-x402-payments.md | x402 escrow — consumer flow, agent settlement, volume curves |
| `06-discovery-indexing.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/06-discovery-indexing.md | DiscoveryRegistry, IndexingModule, agent profiles, network overview |
| `07-tools-schemas.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/07-tools-schemas.md | On-chain tool publishing, schema hashing, versioning |
| `08-plugin-adapter.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/08-plugin-adapter.md | createSAPPlugin — bridge SAP tools into SynapseAgentKit |
| `09-best-practices.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/09-best-practices.md | Error handling, idempotency, cost optimization, security |
| `10-rpc-network.md` | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/docs/10-rpc-network.md | RPC config, devnet/mainnet/localnet, commitment levels |

#### 3. SAP Protocol (on-chain program)

```
https://github.com/OOBE-PROTOCOL/synapse-sap/tree/main/docs
```

Read for: Anchor IDL, instruction formats, account schemas, events, error codes. This is the raw on-chain program — informational for understanding what the SDK wraps.

#### 4. SAP SDK README

```
https://github.com/OOBE-PROTOCOL/synapse-sap-sdk
```

Read for: Quick overview, `SapClient.from(provider)`, module summary, version info.

#### 5. SAP Agent Skill Guides (Role-Specific References)

These are the **most important files for production agent workflows**. They contain every method signature, every type, every code pattern organized by role:

| Guide | URL | Sections | Role |
|-------|-----|----------|------|
| **Client (Consumer)** | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/skills/client.md | 19 sections | Discover agents, create escrows, build x402 headers, verify settlements, endpoint validation, Zod schemas, RPC strategy, error classification |
| **Merchant (Seller)** | https://raw.githubusercontent.com/OOBE-PROTOCOL/synapse-sap-sdk/main/skills/merchant.md | 24 sections | Register agent, publish tools, settle payments, memory vault/ledger, delegate hot-wallets, attestations, reputation metrics, plugin adapter, PostgreSQL mirror |

> **Always read the relevant skill guide** before implementing any SAP protocol operation. These guides are the most complete role-specific references available and contain v0.6.0 features (endpoint validation, network normalization, Zod schemas, RPC strategy, error classification) not covered elsewhere.

#### 6. SAP CLI Reference

```
https://github.com/OOBE-PROTOCOL/synapse-sap-sdk/blob/main/cli/README.md
```

Read for: `synapse-sap` CLI — 10 command groups, 40+ subcommands, global flags, configuration. The CLI gives agents full protocol access from the terminal without writing code.

### When to read docs

- **Always** before answering any SDK-related question
- **Always** before writing code that uses the SDK or SAP
- **Always** when the user asks about a feature you're not 100% sure about
- **Always** when debugging an error — the docs contain error codes and troubleshooting
- **Especially** read `09-best-practices.md` (SAP) and `05-ai-tools.md` (SDK) — these contain critical gotchas
- **For consumer (buyer) flows** — read `skills/client.md` first, it has the complete x402 payment guide with all method signatures
- **For merchant (seller) flows** — read `skills/merchant.md` first, it has agent registration, tool publishing, settlement, memory management
- **For CLI operations** — read `cli/README.md` for all 40+ subcommands with flags and examples

---

## 29. Escrow Validation, Merchant Middleware & x402 Direct Payments (v0.6.4)

Modular server-side validation pipeline and x402 direct payment recognition.

### 29a. Server-Side Escrow Validation

```ts
import {
  validateEscrowState,
  attachSplAccounts,
  toAccountMetas,
  MissingEscrowAtaError,
} from "@oobe-protocol-labs/synapse-sap-sdk";
```

| Function | Signature | Returns |
|----------|-----------|---------|
| `validateEscrowState()` | `(connection, agentWallet, depositorWallet, fetchEscrow, opts?) → Promise<EscrowValidationResult>` | `{ valid, escrow, escrowPda, agentPda, isSplEscrow, splAccounts, errors }` |
| `attachSplAccounts()` | `(escrowPda, depositorWallet, tokenMint) → SplAccountMeta[]` | `[depositorAta, escrowAta, tokenMint, tokenProgram]` |
| `toAccountMetas()` | `(splMetas) → AccountMeta[]` | Anchor-compatible `AccountMeta[]` |

**`SplAccountMeta` type:**

```ts
type SplAccountMeta = {
  kind: "escrowAta" | "depositorAta" | "tokenMint" | "tokenProgram";
  pubkey: PublicKey;
  writable: boolean;
};
```

**`MissingEscrowAtaError`** — extends `SapError`, code `SAP_MISSING_ESCROW_ATA`:
- `ataAddress: string` — the ATA that doesn't exist
- `side: "depositor" | "escrow"` — which side is missing

### 29b. `SapMerchantValidator` — Standard Middleware

```ts
import { SapMerchantValidator } from "@oobe-protocol-labs/synapse-sap-sdk";

const validator = new SapMerchantValidator(
  connection,
  (pda) => client.escrow.fetchByPda(pda).catch(() => null),
);
```

| Method | Signature | Returns |
|--------|-----------|---------|
| `validateRequest()` | `(headers, opts?) → Promise<MerchantValidationResult>` | `{ valid, headers, escrowValidation, accountMetas, errors }` |
| `validateEscrow()` | `(parsedHeaders, opts?) → Promise<EscrowValidationResult>` | Direct escrow validation from pre-parsed headers |

**`validateRequest()` options:**

```ts
{
  callsToSettle?: number;      // default: 1
  throwOnMissingAta?: boolean; // default: true — throws MissingEscrowAtaError
}
```

### 29c. `parseX402Headers()` — Header Parsing

```ts
import { parseX402Headers } from "@oobe-protocol-labs/synapse-sap-sdk";

const parsed = parseX402Headers(req.headers);
// → ParsedX402Headers { protocol, escrowPda, agentPda, depositorWallet,
//                        maxCalls, pricePerCall, programId, network }
```

Validates all 8 required headers: `X-Payment-Protocol`, `X-Payment-Escrow`, `X-Payment-Agent`, `X-Payment-Depositor`, `X-Payment-MaxCalls`, `X-Payment-PricePerCall`, `X-Payment-Program`, `X-Payment-Network`.

Throws `SapValidationError` on missing/malformed headers.

### 29d. `getX402DirectPayments()` — Direct Payment Recognition

```ts
import { getX402DirectPayments, findATA } from "@oobe-protocol-labs/synapse-sap-sdk";
```

| Function | Signature |
|----------|-----------|
| `getX402DirectPayments()` | `(connection, payToAta, opts?) → Promise<X402DirectPayment[]>` |

**Options (`GetX402DirectOptions`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | 100 | Max signatures to scan |
| `filterPayer` | `PublicKey` | — | Only from this payer ATA |
| `knownSettlements` | `SettlementPayload[]` | `[]` | Match via deterministic hash |
| `requireMemo` | `boolean` | `false` | Only include x402 memo transfers |
| `before` | `string` | — | Pagination: before this TX sig |
| `until` | `string` | — | Pagination: after this TX sig |

**`X402DirectPayment` type:**

```ts
interface X402DirectPayment {
  signature: string;
  amount: bigint;
  payerAta: PublicKey;
  payeeAta: PublicKey;
  mint: PublicKey;
  memo: string | null;
  settlement: SettlementPayload | null;
  blockTime: number | null;
  slot: number;
}
```

**Pattern matching:** memo prefix (`x402:`, `SAP-x402:`, `x402-direct:`), base64 JSON with `protocol: "x402"`, deterministic `sha256(agentWallet + depositor + amount + timestamp)` against `knownSettlements`.

### 29e. Full Export List (v0.6.4)

```ts
// Values
export { validateEscrowState, attachSplAccounts, toAccountMetas, MissingEscrowAtaError } from "...";
export { SapMerchantValidator, parseX402Headers } from "...";
export { getX402DirectPayments } from "...";

// Types
export type { SplAccountMeta, EscrowValidationResult } from "...";
export type { ParsedX402Headers, MerchantValidationResult } from "...";
export type { X402DirectPayment, SettlementPayload, GetX402DirectOptions } from "...";
```

---

### How to read docs

Use your web fetch / file read capabilities to download the raw markdown from the `raw.githubusercontent.com` URLs listed above. Read the FULL content of each relevant file — do not skim or skip sections.

> **This is not optional.** The skills.md file is a reference guide, but the GitHub docs are the source of truth. If there is ever a conflict between this file and the GitHub docs, the **GitHub docs win**.

