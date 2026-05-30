# SAP (Synapse Agent Protocol) — operator notes

> Distilled from `@oobe-protocol-labs/synapse-sap-sdk` v0.17.0. Authoritative
> source: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk
>
> ⚠️ **Caveat**: the upstream README documents a
> `SapConnection.fromKeypair(...)` convenience API +
> `client.agent.register({...})` returning a tx signature. That API is **not**
> in the published v0.17.0 npm package — only in unreleased source. The
> published package exposes a lower-level module API where each instruction
> method (e.g. `client.agent.registerAgent(ctx)`) returns a
> `TransactionInstruction`, and the caller must build + send the tx. The
> sections below reflect what the README claims; see `scripts/register-agent.ts`
> for the **actual published-API** usage.

## What it is

Solana program for agent identity, escrow, x402 settlement, attestation, ledger
memory.

- **Program ID**: `SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`
- **Global Registry**: `9odFrYBBZq6UQC6aGyzMPNXWJQn55kMtfigzhLg6S6L5`
- **Mainnet RPC** (via Synapse):
  `https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=...`

## Entry point (published API, v0.17.0)

```ts
import {SapClient} from '@oobe-protocol-labs/synapse-sap-sdk'
import {Wallet} from '@coral-xyz/anchor'
import {Keypair} from '@solana/web3.js'

const wallet = new Wallet(keypair)
const client = new SapClient({rpcUrl: process.env.SYNAPSE_RPC_URL!, wallet})

// Or: createSapClient(rpcUrl, wallet)
```

Modules exposed by `client`:
`agent, attestation, digest, dispute, escrow, global, indexing, misc, session, staking, subscription, tools, vault`.

Each module method returns a `TransactionInstruction`. Build + send via:

```ts
const tx = await client.buildTransaction([ix], wallet.publicKey)
const sig = await client.sendTransaction(tx, [keypair])
```

## PDA helpers

```ts
import {Pdas} from '@oobe-protocol-labs/synapse-sap-sdk'

const [agentPda] = Pdas.getAgentPDA(wallet)
const [agentStatsPda] = Pdas.getAgentStatsPDA(wallet)
const [globalRegistryPda] = Pdas.getGlobalPDA()
const [stakePda] = Pdas.getAgentStakePDA(wallet)
const [vaultPda] = Pdas.getVaultPDA(agentPda)
```

## Capability shape (snake_case on the wire)

```ts
interface Capability {
  id: string
  description: string | null
  protocol_id: string | null // snake_case!
  version: string | null
}
```

## Agent module — `client.agent` (published API)

```ts
// Returns TransactionInstruction; caller builds + sends the tx.
const ix = await client.agent.registerAgent({
  signer: keypair,
  wallet: keypair.publicKey,
  agent: agentPda,
  agentStats: agentStatsPda,
  globalRegistry: globalRegistryPda,
  name: 'Bot',
  description: 'AI agent',
  capabilities: [
    { id: 'swap', description: null, protocol_id: 'jupiter', version: '1.0.0' },
  ],
  pricing: [],
  protocols: ['jupiter'],
  agentId: null,
  agentUri: null,
  x402Endpoint: null,
});

const tx = await client.buildTransaction([ix], keypair.publicKey);
const sig = await client.sendTransaction(tx, [keypair]);

// Other instructions follow the same pattern:
await client.agent.updateAgent({ ... });
await client.agent.deactivateAgent({ ... });
await client.agent.reactivateAgent({ ... });
await client.agent.closeAgent({ ... });
```

## Escrow — `client.escrow`

```ts
await client.escrow.create(agentWallet, {
  pricePerCall: new BN(1_000_000), // lamports for SOL escrow
  maxCalls: new BN(100),
  initialDeposit: new BN(100_000_000),
  expiresAt: new BN(0), // 0 = no expiry
  volumeCurve: [],
  tokenMint: null, // null = SOL; else SPL mint pubkey
  tokenDecimals: 9,
})

await client.escrow.deposit(agentWallet, new BN(50_000_000))
await client.escrow.settle(depositorWallet, 10, serviceHash)
await client.escrow.settleBatch(depositorWallet, [
  {callsToSettle: new BN(5), serviceHash: hash1},
])
await client.escrow.withdraw(agentWallet, new BN(10_000_000))
```

**For escrow-deposit hedge**: open escrow with USDC mint, settle as buyers consume calls.

## x402 Registry — `client.x402`

```ts
const ctx = await client.x402.preparePayment(agentWallet, {
  tierId: 'standard',
  maxCalls: 100,
  initialDeposit: new BN(100_000_000),
})

const headers = client.x402.buildPaymentHeaders(ctx)
// → { 'X-402-Token': '...', 'X-402-Agent': '...', ... }

const cost = await client.x402.estimateCost(agentWallet, 50)
const receipt = await client.x402.settle(depositor, 5, serviceData)
const balance = await client.x402.getBalance(agentWallet, depositorWallet)
```

> NOTE: This is the **SAP-native x402** (internal escrow-backed). The Ace Data
> facilitator x402 (AceData x402 volume) is a separate HTTP envelope flow — see
> `docs/acedata.md`.

## Discovery — `client.discovery`

```ts
const agents = await client.discovery.findAgentsByProtocol('jupiter')
const swappers = await client.discovery.findAgentsByCapability('jupiter:swap')
const profile = await client.discovery.getAgentProfile(agentWallet)
// → { agent, stats, tools, feedback, attestations }

const sentinelProfile = await client.discovery.getAgentProfile(
  new PublicKey('Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph'),
)
```

## Builder (fluent) — `client.builder`

```ts
await client.builder
  .agent('Bot')
  .description('...')
  .x402Endpoint('https://api.example.com/x402')
  .addCapability('foo:bar', {protocol: 'foo'})
  .addPricingTier({tierId: 'standard', pricePerCall: 1000, rateLimit: 60})
  .register()
```

## Costs (mainnet, observed)

- Agent register: ~0.03+ SOL (rent + tx fees)
- Ledger init: ~0.032 SOL rent
- Ledger seal page: ~0.031 SOL
- Per-tx fee: ~0.000005 SOL (base) + priority

## Verification

- Explorer: https://explorer.oobeprotocol.ai
- Search by agent name or wallet pubkey
- Network overview: `client.discovery.getNetworkOverview()`
