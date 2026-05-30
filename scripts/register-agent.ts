/**
 * SAP mainnet agent registration — Days 3-4 hello-world.
 *
 * Defaults to DRY-RUN. Add --send to broadcast the tx.
 *
 * Required env (see .env.example):
 *   AGENT_SECRET_KEY_BASE58  — base58 secret of the agent keypair (NOT personal wallet)
 *   SYNAPSE_RPC_URL          — Synapse mainnet RPC with api_key
 *
 * Optional:
 *   TEST_AGENT_NAME, TEST_AGENT_DESCRIPTION (see .env.example)
 *
 * Usage:
 *   bun run register-agent              # dry-run: print plan, check balance, exit
 *   bun run register-agent --send       # broadcasts the register tx
 */
import { Wallet } from '@coral-xyz/anchor';
import { Pdas, PROGRAM_ID, SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { env, requireEnv, resolveSendRpcUrl, rpcHost } from '../src/env/cli';

const SEND = process.argv.includes('--send');

async function main() {
  const secretKeyB58 = requireEnv('AGENT_SECRET_KEY_BASE58');
  const rpcUrl = resolveSendRpcUrl(env.SOLANA_RPC_URL);

  const name = env.TEST_AGENT_NAME?.trim() || 'hello-pey-test-001';
  const description =
    env.TEST_AGENT_DESCRIPTION?.trim() ||
    'Throwaway test registration; will be deactivated after concept lock';

  const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyB58));
  const wallet = new Wallet(keypair);
  const client = new SapClient({ rpcUrl, wallet });

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SAP Agent Registration — mainnet');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:        ${SEND ? '🔴 SEND (real tx)' : '🟢 DRY-RUN (no tx)'}`);
  console.log(`  Agent name:  ${name}`);
  console.log(`  Description: ${description}`);
  console.log(`  Pubkey:      ${keypair.publicKey.toBase58()}`);
  console.log(`  RPC host:    ${rpcHost(rpcUrl)}`);
  console.log(`  Program ID:  ${PROGRAM_ID}`);
  console.log();

  const lamports = await client.connection.getBalance(keypair.publicKey);
  const sol = lamports / LAMPORTS_PER_SOL;
  console.log(`  Balance:     ${sol.toFixed(6)} SOL`);

  if (sol < 0.04) {
    console.error('✗ Balance too low. Fund the agent with ≥ 0.05 SOL before registering.');
    console.error('  Registration burns ~0.02–0.04 SOL in rent + tx fees.');
    if (SEND) process.exit(1);
  }
  console.log();

  // Compute PDAs
  const [agentPda] = Pdas.getAgentPDA(keypair.publicKey);
  // SDK bug: getAgentStatsPDA(wallet) uses wallet, but IDL seeds with agent PDA.
  const [agentStatsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_stats'), agentPda.toBuffer()],
    new PublicKey(PROGRAM_ID),
  );
  const [globalRegistryPda] = Pdas.getGlobalPDA();

  console.log(`  Agent PDA:        ${agentPda.toBase58()}`);
  console.log(`  AgentStats PDA:   ${agentStatsPda.toBase58()}`);
  console.log(`  GlobalRegistry:   ${globalRegistryPda.toBase58()}`);
  console.log();

  // Pre-flight: does the agent already exist?
  const existing = await client.connection.getAccountInfo(agentPda);
  if (existing) {
    console.log('ℹ Agent PDA already exists on chain.');
    console.log(
      `   Explorer: https://explorer.oobeprotocol.ai/agent/${keypair.publicKey.toBase58()}`,
    );
    console.log('   Use updateAgent / deactivateAgent to change metadata.');
    return;
  }

  const registrationArgs = {
    signer: keypair,
    wallet: keypair.publicKey,
    agent: agentPda,
    agentStats: agentStatsPda,
    globalRegistry: globalRegistryPda,
    name,
    description,
    capabilities: [{ id: 'test:hello', description: null, protocol_id: 'test', version: '0.0.1' }],
    pricing: [],
    protocols: ['test'],
    agentId: null,
    agentUri: null,
    x402Endpoint: null,
  };

  console.log('  Registration payload:');
  console.log(
    JSON.stringify(
      {
        name: registrationArgs.name,
        description: registrationArgs.description,
        capabilities: registrationArgs.capabilities,
        pricing: registrationArgs.pricing,
        protocols: registrationArgs.protocols,
      },
      null,
      4,
    ),
  );
  console.log();

  if (!SEND) {
    console.log('🟢 DRY-RUN complete. Re-run with --send to broadcast.');
    return;
  }

  console.log('🔴 Building register_agent instruction …');
  const ix = await client.agent.registerAgent(registrationArgs);

  console.log('🔴 Building transaction …');
  const tx = await client.buildTransaction([ix], keypair.publicKey);
  tx.sign([keypair]);

  console.log('🔴 Sending …');
  const sig = await client.connection.sendTransaction(tx, {
    skipPreflight: true,
    maxRetries: 3,
  });

  console.log();
  console.log('✅ Agent registered.');
  console.log(`   Tx sig:    ${sig}`);
  console.log(`   Solscan:   https://solscan.io/tx/${sig}`);
  console.log(
    `   Explorer:  https://explorer.oobeprotocol.ai/agent/${keypair.publicKey.toBase58()}`,
  );
  console.log();
  console.log('   Allow 10–30s for the Explorer index to pick up the new agent.');
}

main().catch((err) => {
  console.error('✗ Registration failed:', err);
  process.exit(1);
});
