/**
 * SAP agent on-chain check — fetch and pretty-print the registered Agent + AgentStats.
 *
 * Required env:
 *   AGENT_SECRET_KEY_BASE58  — base58 secret of the agent keypair
 *   SYNAPSE_RPC_URL          — mainnet RPC URL
 *
 * Usage:
 *   bun run check-agent
 */
import { Wallet } from '@coral-xyz/anchor';
import { Pdas, PROGRAM_ID, SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { env, requireEnv, resolveRpcUrl, rpcHost } from '../src/env/cli';

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') return value.toString();
  if (
    value &&
    typeof value === 'object' &&
    'toBase58' in value &&
    typeof (value as { toBase58: unknown }).toBase58 === 'function'
  ) {
    return (value as PublicKey).toBase58();
  }
  if (
    value &&
    typeof value === 'object' &&
    'toString' in value &&
    (value as { _bn?: unknown })._bn
  ) {
    return (value as { toString: () => string }).toString();
  }
  return value;
}

const FALLBACK_RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];

async function pickHealthyRpc(primary: string): Promise<string> {
  const candidates = [primary, ...FALLBACK_RPCS];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { result?: string; error?: unknown };
      if (j.result === 'ok' || !j.error) return url;
    } catch {
      // try next
    }
  }
  throw new Error('All RPC candidates unhealthy');
}

async function main() {
  const secretKeyB58 = requireEnv('AGENT_SECRET_KEY_BASE58');
  const primaryRpc = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);
  const rpcUrl = await pickHealthyRpc(primaryRpc);

  const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyB58));
  const wallet = new Wallet(keypair);
  const client = new SapClient({ rpcUrl, wallet });

  const [agentPda] = Pdas.getAgentPDA(keypair.publicKey);
  const [agentStatsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_stats'), agentPda.toBuffer()],
    new PublicKey(PROGRAM_ID),
  );

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SAP Agent Check');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Wallet:           ${keypair.publicKey.toBase58()}`);
  console.log(`  Agent PDA:        ${agentPda.toBase58()}`);
  console.log(`  AgentStats PDA:   ${agentStatsPda.toBase58()}`);
  console.log(`  RPC host:         ${rpcHost(rpcUrl)}`);
  console.log();

  const [agentInfo, statsInfo] = await Promise.all([
    client.connection.getAccountInfo(agentPda),
    client.connection.getAccountInfo(agentStatsPda),
  ]);

  if (!agentInfo) {
    console.error(
      '✗ Agent PDA does NOT exist on-chain. Run `bun run register-agent --send` first.',
    );
    process.exit(1);
  }

  console.log('✅ Agent account found on-chain.');
  console.log(`   Owner:        ${agentInfo.owner.toBase58()}`);
  console.log(`   Lamports:     ${agentInfo.lamports}`);
  console.log(`   Data length:  ${agentInfo.data.length} bytes`);
  console.log(`   Executable:   ${agentInfo.executable}`);
  console.log();

  if (statsInfo) {
    console.log('✅ AgentStats account found on-chain.');
    console.log(`   Owner:        ${statsInfo.owner.toBase58()}`);
    console.log(`   Lamports:     ${statsInfo.lamports}`);
    console.log(`   Data length:  ${statsInfo.data.length} bytes`);
    console.log();
  } else {
    console.warn('⚠ AgentStats PDA missing — registration may be partial.');
  }

  const agent = await client.fetchAccount('agent', agentPda);
  if (agent) {
    console.log('── Agent (decoded) ─────────────────────────────────────');
    console.log(JSON.stringify(agent, jsonReplacer, 2));
    console.log();
  } else {
    console.warn('⚠ Could not decode agent account via SDK.');
  }

  const stats = await client.fetchAccount('agentStats', agentStatsPda);
  if (stats) {
    console.log('── AgentStats (decoded) ────────────────────────────────');
    console.log(JSON.stringify(stats, jsonReplacer, 2));
    console.log();
  }

  console.log(`Explorer: https://explorer.oobeprotocol.ai/agent/${keypair.publicKey.toBase58()}`);
}

main().catch((err) => {
  console.error('✗ Check failed:', err);
  process.exit(1);
});
