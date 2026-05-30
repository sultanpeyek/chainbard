/**
 * Rescue agent rent — close via on-chain IDL (deployed v0.18).
 *
 * Discovery: bundled SDK ships v0.17 IDL with phantom `pricing_menu` account on
 * `update_agent` + `close_agent`. Deployed program (v0.18) removed it. IX-builder
 * sends extra account → ordering corrupts → AccountNotInitialized noise.
 *
 * Fix: fetch on-chain IDL with Program.fetchIdl, build IX from it directly.
 *
 * Steps:
 *   1. reactivate_agent (best-effort)
 *   2. deactivate_agent
 *   3. close_agent (5 accounts: wallet/agent/agent_stats/vault_check/global_registry)
 *
 * Required env:
 *   AGENT_SECRET_KEY_BASE58
 *   SOLANA_RPC_URL (preferred) or SYNAPSE_RPC_URL
 *
 * Usage:
 *   bun run scripts/rescue-agent.ts            # DRY-RUN
 *   bun run scripts/rescue-agent.ts --send     # broadcast
 */
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Pdas, PROGRAM_ID } from '@oobe-protocol-labs/synapse-sap-sdk';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { env, requireEnv, resolveSendRpcUrl } from '../src/env/cli';

const SEND = process.argv.includes('--send');

function pda(seeds: (Buffer | Uint8Array)[]): PublicKey {
  const [k] = PublicKey.findProgramAddressSync(seeds, new PublicKey(PROGRAM_ID));
  return k;
}

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

async function sendStep(connection: Connection, tx: Transaction, label: string): Promise<string> {
  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    await pollSignature(connection, sig);
    console.log(`   ✅ ${label}. Tx: ${sig}`);
    return sig;
  } catch (err) {
    if (err instanceof SendTransactionError) {
      console.error(`✗ ${label} failed: ${err.message}`);
      try {
        const logs = await err.getLogs(connection);
        if (logs?.length) {
          console.error('   --- program logs ---');
          for (const l of logs) console.error(`   ${l}`);
          console.error('   --------------------');
        }
      } catch {}
    }
    throw err;
  }
}

async function buildAndSign(conn: Connection, ix: any, payer: Keypair): Promise<Transaction> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight,
  })
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
    .add(ix);
  tx.sign(payer);
  return tx;
}

async function main() {
  const secretKeyB58 = requireEnv('AGENT_SECRET_KEY_BASE58');
  const rpcUrl = resolveSendRpcUrl(env.SOLANA_RPC_URL);

  const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyB58));
  const conn = new Connection(rpcUrl, 'confirmed');
  const provider = new AnchorProvider(conn, new Wallet(keypair), {
    commitment: 'confirmed',
  });
  const wPk = keypair.publicKey;
  const programId = new PublicKey(PROGRAM_ID);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SAP Agent Rescue — via on-chain IDL (v0.18)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:        ${SEND ? '🔴 SEND (real tx)' : '🟢 DRY-RUN (no tx)'}`);
  console.log(`  Wallet:      ${wPk.toBase58()}`);
  console.log();

  console.log('Fetching on-chain IDL …');
  const idl = await Program.fetchIdl(programId, provider);
  if (!idl) throw new Error('No on-chain IDL found.');
  console.log(`  IDL version: ${(idl as any).metadata?.version || (idl as any).version}`);
  const program = new Program(idl as any, provider);

  const [agentPda] = Pdas.getAgentPDA(wPk);
  const statsPda = pda([Buffer.from('sap_stats'), agentPda.toBuffer()]);
  const vaultPda = pda([Buffer.from('sap_vault'), agentPda.toBuffer()]);
  const pricingPda = pda([Buffer.from('sap_pricing'), agentPda.toBuffer()]);
  const [globalPda] = Pdas.getGlobalPDA();

  console.log(`  Agent PDA:   ${agentPda.toBase58()}`);
  console.log(`  Stats PDA:   ${statsPda.toBase58()}`);
  console.log(`  Vault PDA:   ${vaultPda.toBase58()}`);
  console.log(`  Pricing PDA: ${pricingPda.toBase58()}`);
  console.log(`  Global PDA:  ${globalPda.toBase58()}`);
  console.log();

  const balBefore = await conn.getBalance(wPk);
  console.log(`  Balance before: ${(balBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  const [agentInfo, statsInfo, vaultInfo, pricingInfo] = await Promise.all([
    conn.getAccountInfo(agentPda),
    conn.getAccountInfo(statsPda),
    conn.getAccountInfo(vaultPda),
    conn.getAccountInfo(pricingPda),
  ]);
  if (!agentInfo) {
    console.log('ℹ Agent PDA does not exist. Nothing to rescue.');
    return;
  }
  const reclaimable =
    agentInfo.lamports +
    (statsInfo?.lamports ?? 0) +
    (vaultInfo?.lamports ?? 0) +
    (pricingInfo?.lamports ?? 0);
  console.log(`  Reclaimable rent: ${(reclaimable / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`    agent:        ${(agentInfo.lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(
    `    stats:        ${((statsInfo?.lamports ?? 0) / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
  );
  console.log(
    `    pricing_menu: ${pricingInfo ? `${(pricingInfo.lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL` : '(absent — not in v0.18)'}`,
  );
  console.log(
    `    vault_check:  ${vaultInfo ? `${(vaultInfo.lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL` : '(absent — fine, v0.18 unchecked)'}`,
  );
  console.log();

  console.log('Plan:');
  console.log('  1. reactivate_agent (best-effort, in case already active)');
  console.log('  2. deactivate_agent (required by close)');
  console.log('  3. close_agent (5 accounts, on-chain IDL)');
  console.log();

  if (!SEND) {
    console.log('🟢 DRY-RUN complete. Re-run with --send to broadcast.');
    return;
  }

  // STEP 1: reactivate (best-effort)
  console.log('🔴 Step 1: reactivate_agent (best-effort) …');
  try {
    const ix = await (program.methods as any)
      .reactivateAgent()
      .accounts({
        wallet: wPk,
        agent: agentPda,
        agentStats: statsPda,
        globalRegistry: globalPda,
      })
      .instruction();
    const tx = await buildAndSign(conn, ix, keypair);
    await sendStep(conn, tx, 'reactivated');
  } catch (e: any) {
    console.log(`   (reactivate skipped: ${e.message?.split('\n')[0]?.slice(0, 80) || 'unknown'})`);
  }

  // STEP 2: deactivate
  console.log('🔴 Step 2: deactivate_agent …');
  try {
    const ix = await (program.methods as any)
      .deactivateAgent()
      .accounts({
        wallet: wPk,
        agent: agentPda,
        agentStats: statsPda,
        globalRegistry: globalPda,
      })
      .instruction();
    const tx = await buildAndSign(conn, ix, keypair);
    await sendStep(conn, tx, 'deactivated');
  } catch (e: any) {
    console.log(`   (deactivate skipped: ${e.message?.split('\n')[0]?.slice(0, 80) || 'unknown'})`);
  }

  // STEP 3: close
  console.log('🔴 Step 3: close_agent …');
  const ixClose = await (program.methods as any)
    .closeAgent()
    .accounts({
      wallet: wPk,
      agent: agentPda,
      agentStats: statsPda,
      vaultCheck: vaultPda,
      globalRegistry: globalPda,
    })
    .instruction();
  const txClose = await buildAndSign(conn, ixClose, keypair);
  const sigClose = await sendStep(conn, txClose, 'closed');

  const balAfter = await conn.getBalance(wPk);
  const delta = (balAfter - balBefore) / LAMPORTS_PER_SOL;
  console.log();
  console.log(`  Balance after: ${(balAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  Net delta:     ${delta >= 0 ? '+' : ''}${delta.toFixed(6)} SOL`);
  console.log(`  Solscan: https://solscan.io/tx/${sigClose}`);
}

main().catch((err) => {
  console.error('✗ Rescue failed:', err);
  process.exit(1);
});
