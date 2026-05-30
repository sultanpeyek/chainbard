/**
 * SAP agent close — reclaim rent.
 *
 * Two-step: deactivate_agent → close_agent. Rent (~0.04 SOL) refunded to wallet.
 *
 * Prereqs (enforced on-chain):
 *   - active_escrows must be 0
 *   - agent.is_active must be false (deactivate first)
 *
 * Defaults to DRY-RUN. Add --send to broadcast.
 *
 * Required env:
 *   AGENT_SECRET_KEY_BASE58
 *   SYNAPSE_RPC_URL
 *
 * Usage:
 *   bun run close-agent
 *   bun run close-agent --send
 */
import { Wallet } from '@coral-xyz/anchor';
import { Pdas, PROGRAM_ID, SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import {
  type Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { env, requireEnv, resolveSendRpcUrl } from '../src/env/cli';

async function pollSignature(connection: Connection, sig: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatus(sig, {
      searchTransactionHistory: false,
    });
    if (value?.err) throw new Error(`tx failed: ${JSON.stringify(value.err)}`);
    if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') {
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`tx ${sig} not confirmed within ${timeoutMs}ms (HTTP poll)`);
}

const SEND = process.argv.includes('--send');
const SKIP_DEACTIVATE = process.argv.includes('--skip-deactivate');

function pda(seeds: (Buffer | Uint8Array)[]): PublicKey {
  const [k] = PublicKey.findProgramAddressSync(seeds, new PublicKey(PROGRAM_ID));
  return k;
}

async function sendWithLogs(connection: Connection, tx: any, label: string): Promise<string> {
  try {
    return await connection.sendTransaction(tx, { maxRetries: 3 });
  } catch (err) {
    if (err instanceof SendTransactionError) {
      console.error(`✗ ${label} sim failed: ${err.message}`);
      try {
        const logs = await err.getLogs(connection);
        if (logs?.length) {
          console.error('   --- program logs ---');
          for (const l of logs) console.error(`   ${l}`);
          console.error('   --------------------');
        } else {
          console.error('   (no logs returned by RPC)');
        }
      } catch (logErr) {
        console.error('   getLogs() failed:', logErr);
      }
    }
    throw err;
  }
}

async function main() {
  const secretKeyB58 = requireEnv('AGENT_SECRET_KEY_BASE58');
  const rpcUrl = resolveSendRpcUrl(env.SOLANA_RPC_URL);

  const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyB58));
  const wallet = new Wallet(keypair);
  const client = new SapClient({ rpcUrl, wallet });

  const [agentPda] = Pdas.getAgentPDA(keypair.publicKey);
  const agentStatsPda = pda([Buffer.from('sap_stats'), agentPda.toBuffer()]);
  const vaultCheckPda = pda([Buffer.from('sap_vault'), agentPda.toBuffer()]);
  const pricingMenuPda = pda([Buffer.from('sap_pricing'), agentPda.toBuffer()]);
  const [globalRegistryPda] = Pdas.getGlobalPDA();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SAP Agent Close — reclaim rent');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:        ${SEND ? '🔴 SEND (real tx)' : '🟢 DRY-RUN (no tx)'}`);
  console.log(`  Wallet:      ${keypair.publicKey.toBase58()}`);
  console.log(`  Agent PDA:   ${agentPda.toBase58()}`);
  console.log(`  Stats PDA:   ${agentStatsPda.toBase58()}`);
  console.log(`  Vault PDA:   ${vaultCheckPda.toBase58()}`);
  console.log(`  Pricing PDA: ${pricingMenuPda.toBase58()}`);
  console.log();

  const balBefore = await client.connection.getBalance(keypair.publicKey);
  console.log(`  Balance before: ${(balBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  const agentInfo = await client.connection.getAccountInfo(agentPda);
  if (!agentInfo) {
    console.log('ℹ Agent PDA does not exist on-chain. Nothing to close.');
    return;
  }
  console.log(`  Agent rent: ${(agentInfo.lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  const statsInfo = await client.connection.getAccountInfo(agentStatsPda);
  const vaultInfo = await client.connection.getAccountInfo(vaultCheckPda);
  const pricingInfo = await client.connection.getAccountInfo(pricingMenuPda);
  const reclaimable =
    (agentInfo.lamports +
      (statsInfo?.lamports ?? 0) +
      (vaultInfo?.lamports ?? 0) +
      (pricingInfo?.lamports ?? 0)) /
    LAMPORTS_PER_SOL;
  console.log(`  Total reclaimable (rent): ~${reclaimable.toFixed(6)} SOL`);
  console.log();

  if (!SEND) {
    console.log('Plan:');
    console.log('  1. deactivate_agent  — sets is_active=false');
    console.log('  2. close_agent       — refunds rent → wallet');
    console.log();
    console.log('🟢 DRY-RUN complete. Re-run with --send to broadcast.');
    return;
  }

  if (SKIP_DEACTIVATE) {
    console.log('🔵 Step 1: deactivate_agent SKIPPED (--skip-deactivate flag)');
  } else {
    console.log('🔴 Step 1: deactivate_agent …');
    const deactivateIx = await client.agent.deactivateAgent({
      signer: keypair,
      wallet: keypair.publicKey,
      agent: agentPda,
      agentStats: agentStatsPda,
      globalRegistry: globalRegistryPda,
    });
    const txDeactivate = await client.buildTransaction([deactivateIx], keypair.publicKey);
    txDeactivate.sign([keypair]);
    const sigDeactivate = await sendWithLogs(client.connection, txDeactivate, 'deactivate_agent');
    await pollSignature(client.connection, sigDeactivate);
    console.log(`   ✅ deactivated. Tx: ${sigDeactivate}`);
  }

  console.log('🔴 Step 2: close_agent …');
  const closeIx = await client.agent.closeAgent({
    signer: keypair,
    wallet: keypair.publicKey,
    agent: agentPda,
    agentStats: agentStatsPda,
    vaultCheck: vaultCheckPda,
    pricingMenu: pricingMenuPda,
    globalRegistry: globalRegistryPda,
  });
  const txClose = await client.buildTransaction([closeIx], keypair.publicKey);
  txClose.sign([keypair]);
  const sigClose = await sendWithLogs(client.connection, txClose, 'close_agent');
  await pollSignature(client.connection, sigClose);
  console.log(`   ✅ closed. Tx: ${sigClose}`);
  console.log();

  const balAfter = await client.connection.getBalance(keypair.publicKey);
  const delta = (balAfter - balBefore) / LAMPORTS_PER_SOL;
  console.log(`  Balance after: ${(balAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  Net delta:     ${delta >= 0 ? '+' : ''}${delta.toFixed(6)} SOL`);
  console.log();
  console.log(`  Solscan: https://solscan.io/tx/${sigClose}`);
}

main().catch((err) => {
  console.error('✗ Close failed:', err);
  process.exit(1);
});
