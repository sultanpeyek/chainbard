/**
 * Register the production `chainbard` SAP agent.
 *
 * 4 capabilities (one per story kind), single USDC x402 pricing tier,
 * x402Endpoint = https://chainbard.vercel.app/api/mint/story.
 *
 * Uses INLINE-IDL pattern (Program.fetchIdl + accountsPartial) because
 * SDK 0.18.1 bundled IDL (v0.25) is AHEAD of deployed program (v0.18).
 * Bundled IDL declares a `pricing_menu` account in register_agent that
 * the deployed program doesn't have → SDK builder fails with 3012.
 * See memory `sap_sdk_idl_mismatch.md`.
 *
 * Required env:
 *   AGENT_SECRET_KEY_BASE58  — NEW agent keypair (base58 secret)
 *   SYNAPSE_RPC_URL          — Synapse mainnet RPC w/ api_key
 *
 * Defaults to DRY-RUN. Add --send to broadcast.
 *
 * Usage:
 *   bun run scripts/register-chainbard.ts          # dry-run
 *   bun run scripts/register-chainbard.ts --send   # real tx
 */
import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { env, requireEnv, resolveSendRpcUrl, rpcHost } from '../src/env/cli';

const SEND = process.argv.includes('--send');

const PROGRAM = new PublicKey('SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ');

// USDC mainnet mint
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

// $0.01 per call in USDC base units (6 decimals → 10_000)
const PRICE_PER_CALL = new BN(10_000);

const X402_ENDPOINT = 'https://chainbard.vercel.app/api/mint/story';

const AGENT_NAME = 'chainbard';
const AGENT_DESCRIPTION =
  'Hybrid Solana story-minter — autonomous curator + reactive x402 endpoint. ' +
  'Pay-per-mint USDC via x402; provenance-aware OG cards; ≥3 Ace services per story.';

const CAPABILITIES = [
  {
    id: 'story:wallet',
    description: 'Mint provenance story for a Solana wallet',
    protocolId: 'story',
    version: '0.1.0',
  },
  {
    id: 'story:tx',
    description: 'Mint provenance story for a transaction',
    protocolId: 'story',
    version: '0.1.0',
  },
  {
    id: 'story:nft',
    description: 'Mint provenance story for an NFT mint',
    protocolId: 'story',
    version: '0.1.0',
  },
  {
    id: 'story:token',
    description: 'Mint provenance story for a fungible token',
    protocolId: 'story',
    version: '0.1.0',
  },
];

// Anchor 0.30 IDL coder camelCases IDL field names → enum/pricing/cap fields must be camelCase.
// TokenType variants are tag-style enums: { sol: {} } / { usdc: {} } / { spl: {} }
const TOKEN_TYPE_USDC = { usdc: {} };
// SettlementMode variants: { instant: {} } / { escrow: {} } / { batched: {} } / { x402: {} }
const SETTLEMENT_MODE_X402 = { x402: {} };

async function main() {
  const secretKeyB58 = requireEnv('AGENT_SECRET_KEY_BASE58');
  const rpcUrl = resolveSendRpcUrl(env.SOLANA_RPC_URL);

  const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyB58));
  const conn = new Connection(rpcUrl, 'confirmed');
  const provider = new AnchorProvider(conn, new Wallet(keypair), { commitment: 'confirmed' });

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SAP Agent Registration — chainbard (mainnet, inline-IDL)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:          ${SEND ? '🔴 SEND (real tx)' : '🟢 DRY-RUN'}`);
  console.log(`  Name:          ${AGENT_NAME}`);
  console.log(`  Pubkey:        ${keypair.publicKey.toBase58()}`);
  console.log(`  RPC host:      ${rpcHost(rpcUrl)}`);
  console.log(`  Program ID:    ${PROGRAM.toBase58()}`);
  console.log(`  x402 endpoint: ${X402_ENDPOINT}`);
  console.log();

  const lamports = await conn.getBalance(keypair.publicKey);
  const sol = lamports / LAMPORTS_PER_SOL;
  console.log(`  Balance:       ${sol.toFixed(6)} SOL`);
  if (sol < 0.04) {
    console.error('✗ Balance too low. Fund the new agent with ≥ 0.05 SOL before --send.');
    if (SEND) process.exit(1);
  }
  console.log();

  // Fetch deployed IDL (v0.18) — bypasses SDK's stale bundled IDL (v0.25)
  const idl: any = await Program.fetchIdl(PROGRAM, provider);
  if (!idl) throw new Error('No on-chain IDL');
  console.log(`  Deployed IDL:  v${idl.metadata?.version ?? idl.version}`);
  const program = new Program(idl, provider);

  // PDAs (deployed program seeds)
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_agent'), keypair.publicKey.toBuffer()],
    PROGRAM,
  );
  const [agentStatsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_stats'), agentPda.toBuffer()],
    PROGRAM,
  );
  const [globalRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_global')],
    PROGRAM,
  );

  console.log(`  Agent PDA:        ${agentPda.toBase58()}`);
  console.log(`  AgentStats PDA:   ${agentStatsPda.toBase58()}`);
  console.log(`  GlobalRegistry:   ${globalRegistryPda.toBase58()}`);
  console.log();

  const existing = await conn.getAccountInfo(agentPda);
  if (existing) {
    console.log('ℹ Agent PDA already exists. Use updateAgent to change metadata.');
    console.log(
      `   Explorer: https://explorer.oobeprotocol.ai/agent/${keypair.publicKey.toBase58()}`,
    );
    return;
  }

  const capabilities = CAPABILITIES.map((c) => ({
    id: c.id,
    description: c.description,
    protocolId: c.protocolId,
    version: c.version,
  }));

  const pricing = [
    {
      tierId: 'x402-standard',
      pricePerCall: PRICE_PER_CALL,
      minPricePerCall: null,
      maxPricePerCall: null,
      rateLimit: 10,
      maxCallsPerSession: 1000,
      burstLimit: 20,
      tokenType: TOKEN_TYPE_USDC,
      tokenMint: USDC_MINT,
      tokenDecimals: USDC_DECIMALS,
      settlementMode: SETTLEMENT_MODE_X402,
      minEscrowDeposit: null,
      batchIntervalSec: null,
      volumeCurve: null,
    },
  ];

  console.log('  Registration payload:');
  console.log(
    JSON.stringify(
      {
        name: AGENT_NAME,
        description: AGENT_DESCRIPTION,
        capabilities,
        pricing: pricing.map((p) => ({
          tierId: p.tierId,
          pricePerCall: p.pricePerCall.toString(),
          rateLimit: p.rateLimit,
          tokenType: p.tokenType,
          tokenMint: p.tokenMint.toBase58(),
          settlementMode: p.settlementMode,
        })),
        protocols: ['story', 'x402'],
        x402Endpoint: X402_ENDPOINT,
      },
      null,
      2,
    ),
  );
  console.log();

  if (!SEND) {
    console.log('🟢 DRY-RUN complete. Re-run with --send to broadcast.');
    return;
  }

  console.log('🔴 Building register_agent instruction (inline IDL)…');
  const ix = await (program.methods as any)
    .registerAgent(
      AGENT_NAME,
      AGENT_DESCRIPTION,
      capabilities,
      pricing,
      ['story', 'x402'],
      null, // agentId
      null, // agentUri
      X402_ENDPOINT,
    )
    .accountsPartial({
      wallet: keypair.publicKey,
      agent: agentPda,
      agentStats: agentStatsPda,
      globalRegistry: globalRegistryPda,
    })
    .instruction();

  console.log('🔴 Building transaction …');
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([keypair]);

  console.log('🔴 Sending (preflight ON — surfaces program errors)…');
  const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  console.log();
  console.log('✅ chainbard registered.');
  console.log(`   Tx:        https://solscan.io/tx/${sig}`);
  console.log(
    `   Explorer:  https://explorer.oobeprotocol.ai/agent/${keypair.publicKey.toBase58()}`,
  );
  console.log();
  console.log('   Allow 10–30s for Explorer to index.');
}

main().catch((err) => {
  console.error('✗ Registration failed:', err);
  process.exit(1);
});
