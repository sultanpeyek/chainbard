/**
 * SAP escrow_v2 SELF-PAY round-trip — agent acts as own depositor.
 *
 * Why: settle_calls_v2 with agent ≠ depositor fails PrivilegeEscalation on the
 * escrow PDA (likely a program bug in the lamport-transfer CPI path). Setting
 * agent = depositor = self avoids that path entirely; competitor confirmed via
 * @oobe-protocol-labs/synapse-sap-sdk@^0.6 (see HANDOFF analysis).
 *
 * Phases:
 *   0. update_agent (skip if pricing already set)
 *   1. init_stake (skip if stake exists)
 *   2. create_escrow_v2 (agent=depositor=self, SelfReport, low nonce)
 *   3. settle_calls_v2 (5 declared accounts, agent signs)
 *
 * settle_calls_v2 IDL accounts (deployed v0.18):
 *   [W S]  wallet         (= agent wallet)
 *   [   ]  agent          PDA(sap_agent + wallet)
 *   [W  ]  agent_stats    PDA(sap_stats + agent)
 *   [W  ]  escrow         PDA(sap_escrow_v2 + agent + escrow.depositor + nonce)
 *   [   ]  system_program
 * NO treasury, NO co-signer. Adding them = PrivilegeEscalation.
 *
 * Defaults DRY-RUN. --send to broadcast. --nonce <n> to pick nonce (else first free 0..16).
 */

import { createHash } from 'node:crypto';
import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import { PROGRAM_ID } from '@oobe-protocol-labs/synapse-sap-sdk';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { env, requireEnv, resolveSendRpcUrl, rpcHost } from '../src/env/cli';

const SEND = process.argv.includes('--send');
const nonceArgIdx = process.argv.indexOf('--nonce');
const NONCE_OVERRIDE =
  nonceArgIdx > -1 ? Number.parseInt(process.argv[nonceArgIdx + 1] ?? '', 10) : NaN;

const PROGRAM = new PublicKey(PROGRAM_ID);

const PRICE_PER_CALL = new BN(1_000); // 0.000001 SOL/call (matches competitor)
const MAX_CALLS = new BN(500);
const INITIAL_DEPOSIT = new BN(10_000_000); // 0.01 SOL
const EXPIRES_AT = new BN(0);
const SETTLEMENT_SECURITY_SELF = 0; // SelfReport
const SETTLE_CALLS = new BN(1);
const MIN_STAKE = new BN(100_000_000);

function pda(seeds: (Buffer | Uint8Array)[]) {
  return PublicKey.findProgramAddressSync(
    seeds.map((s) => Buffer.from(s)),
    PROGRAM,
  )[0];
}
function nonceBytes(n: BN) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n.toString()), 0);
  return b;
}
function fmt(lamports: number) {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`;
}
function solscan(sig: string) {
  return `https://solscan.io/tx/${sig}`;
}

const agentPda = (w: PublicKey) => pda([Buffer.from('sap_agent'), w.toBuffer()]);
const statsPda = (a: PublicKey) => pda([Buffer.from('sap_stats'), a.toBuffer()]);
const stakePda = (a: PublicKey) => pda([Buffer.from('sap_stake'), a.toBuffer()]);
const escrowV2Pda = (a: PublicKey, d: PublicKey, n: BN) =>
  pda([Buffer.from('sap_escrow_v2'), a.toBuffer(), d.toBuffer(), nonceBytes(n)]);

async function pollSig(conn: Connection, sig: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await conn.getSignatureStatus(sig, { searchTransactionHistory: true });
    if (value?.err) throw new Error(`tx failed: ${JSON.stringify(value.err)}`);
    if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized')
      return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`tx ${sig} not confirmed within ${timeoutMs}ms`);
}

// Timeout-recovery: SDK/RPC may report "Check signature XXX" w/o confirming.
function extractSubmittedSig(err: unknown): string | null {
  const m = (err as Error)?.message?.match(/Check signature ([1-9A-HJ-NP-Za-km-z]+)/);
  return m?.[1] ?? null;
}

async function sendStep(
  conn: Connection,
  tx: Transaction,
  signers: Keypair[],
  label: string,
): Promise<string> {
  tx.sign(...signers);
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    await pollSig(conn, sig);
    console.log(`      ✓ ${label}  ${solscan(sig)}`);
    return sig;
  } catch (err) {
    const recovered = extractSubmittedSig(err);
    if (recovered) {
      console.log(`      ↻ ${label} submit-recovery for sig ${recovered}`);
      await pollSig(conn, recovered);
      console.log(`      ✓ ${label} (recovered)  ${solscan(recovered)}`);
      return recovered;
    }
    if (err instanceof SendTransactionError) {
      console.error(`      ✗ ${label}: ${err.message}`);
      try {
        const logs = await err.getLogs(conn);
        if (logs?.length) {
          console.error('        --- program logs ---');
          for (const l of logs) console.error(`        ${l}`);
        }
      } catch {}
    }
    throw err;
  }
}

async function buildTx(conn: Connection, feePayer: PublicKey, ixs: any[]): Promise<Transaction> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer, blockhash, lastValidBlockHeight });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  for (const ix of ixs) tx.add(ix);
  return tx;
}

async function pickFreeNonce(
  conn: Connection,
  agentPDA: PublicKey,
  depositor: PublicKey,
): Promise<BN> {
  if (!Number.isNaN(NONCE_OVERRIDE)) {
    const n = new BN(NONCE_OVERRIDE);
    const info = await conn.getAccountInfo(escrowV2Pda(agentPDA, depositor, n));
    if (info) throw new Error(`--nonce ${NONCE_OVERRIDE} already used (escrow PDA exists)`);
    return n;
  }
  for (let i = 0; i < 17; i++) {
    const ep = escrowV2Pda(agentPDA, depositor, new BN(i));
    const info = await conn.getAccountInfo(ep);
    if (!info) return new BN(i);
  }
  throw new Error('all nonces 0..16 occupied');
}

async function main() {
  const rpc = resolveSendRpcUrl(env.SOLANA_RPC_URL);
  const secret = requireEnv('AGENT_SECRET_KEY_BASE58');

  const agent = Keypair.fromSecretKey(bs58.decode(secret));
  const wallet = agent.publicKey;
  const conn = new Connection(rpc, 'confirmed');
  const provider = new AnchorProvider(conn, new Wallet(agent), { commitment: 'confirmed' });

  const agentPDA = agentPda(wallet);
  const stats = statsPda(agentPDA);
  const stake = stakePda(agentPDA);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SAP escrow_v2 SELF-PAY round-trip (agent=depositor=self)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:      ${SEND ? '🔴 SEND' : '🟢 DRY-RUN'}`);
  console.log(`  RPC host:  ${rpcHost(rpc)}`);
  console.log(`  Wallet:    ${wallet.toBase58()}`);
  console.log();

  console.log('  Fetching on-chain IDL …');
  const idl: any = await Program.fetchIdl(PROGRAM, provider);
  if (!idl) throw new Error('No IDL on-chain');
  console.log(`    IDL version: ${idl.metadata?.version ?? idl.version}`);
  const program = new Program(idl as any, provider);

  const [bal, agentInfo, stakeInfo] = await Promise.all([
    conn.getBalance(wallet),
    conn.getAccountInfo(agentPDA),
    conn.getAccountInfo(stake),
  ]);

  if (!agentInfo) throw new Error('Agent PDA missing — run register-agent --send first.');

  console.log();
  console.log(`  Balance:   ${fmt(bal)}`);
  console.log(`  agentPDA:  ${agentPDA.toBase58()}`);
  console.log(`  statsPDA:  ${stats.toBase58()}`);
  console.log(`  stakePDA:  ${stake.toBase58()}  ${stakeInfo ? 'EXISTS' : 'MISSING'}`);

  const nonce = await pickFreeNonce(conn, agentPDA, wallet);
  const escrow = escrowV2Pda(agentPDA, wallet, nonce);
  console.log(`  Nonce:     ${nonce.toString()}`);
  console.log(`  escrow:    ${escrow.toBase58()}  (will create)`);
  console.log();

  // ── Inline pricing tier (only sets if not yet present)
  const tier = {
    tierId: 'standard',
    pricePerCall: PRICE_PER_CALL,
    minPricePerCall: null,
    maxPricePerCall: null,
    rateLimit: 60,
    maxCallsPerSession: 0,
    burstLimit: null,
    tokenType: { sol: {} },
    tokenMint: null,
    tokenDecimals: 9,
    settlementMode: { x402: {} },
    minEscrowDeposit: null,
    batchIntervalSec: null,
    volumeCurve: null,
  };

  let pricingAlreadySet = false;
  try {
    const decoded: any = await (program.account as any).agentAccount.fetch(agentPDA);
    pricingAlreadySet = Array.isArray(decoded.pricing) && decoded.pricing.length > 0;
  } catch {}

  if (!pricingAlreadySet) {
    console.log('  [0] update_agent (set inline pricing)');
    if (SEND) {
      const ix = await (program.methods as any)
        .updateAgent(null, null, null, [tier], null, null, null, null)
        .accountsPartial({
          wallet,
          agent: agentPDA,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const tx = await buildTx(conn, wallet, [ix]);
      await sendStep(conn, tx, [agent], 'update_agent');
    } else {
      console.log('      (dry-run; skipping)');
    }
  } else {
    console.log('  [0] pricing already set; skip update_agent');
  }
  console.log();

  // ── PHASE 1: init_stake
  if (!stakeInfo) {
    console.log('  [1] init_stake (0.1 SOL)');
    if (SEND) {
      const ix = await (program.methods as any)
        .initStake(MIN_STAKE)
        .accountsPartial({
          wallet,
          agent: agentPDA,
          stake,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const tx = await buildTx(conn, wallet, [ix]);
      await sendStep(conn, tx, [agent], 'init_stake');
    }
  } else {
    console.log('  [1] stake exists; skip');
  }
  console.log();

  // ── PHASE 2: create_escrow_v2 (self-pay, SelfReport)
  console.log(`  [2] create_escrow_v2 (deposit ${fmt(INITIAL_DEPOSIT.toNumber())}, SelfReport)`);
  if (SEND) {
    const ix = await (program.methods as any)
      .createEscrowV2(
        nonce,
        PRICE_PER_CALL,
        MAX_CALLS,
        INITIAL_DEPOSIT,
        EXPIRES_AT,
        [], // volume_curve
        null, // token_mint (SOL)
        9, // token_decimals
        SETTLEMENT_SECURITY_SELF, // SelfReport — no co-signer needed
        new BN(0), // dispute_window_slots
        null, // co_signer
        null, // arbiter
      )
      .accountsPartial({
        depositor: wallet,
        agent: agentPDA,
        escrow,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const tx = await buildTx(conn, wallet, [ix]);
    await sendStep(conn, tx, [agent], 'create_escrow_v2');
  }
  console.log();

  // ── PHASE 3: settle_calls_v2 (5 declared accounts, agent signs)
  const serviceHash = Array.from(createHash('sha256').update('self-pay-test').digest());
  console.log(`  [3] settle_calls_v2 (${SETTLE_CALLS.toString()} call, self-settled)`);
  if (SEND) {
    const ix = await (program.methods as any)
      .settleCallsV2(nonce, SETTLE_CALLS, serviceHash)
      .accountsPartial({
        wallet,
        agent: agentPDA,
        agentStats: stats,
        escrow,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const tx = await buildTx(conn, wallet, [ix]);
    await sendStep(conn, tx, [agent], 'settle_calls_v2');
  }
  console.log();

  if (!SEND) {
    console.log('🟢 DRY-RUN complete. Re-run with --send.');
    return;
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ self-pay round-trip complete.');
  console.log(`     Escrow PDA: ${escrow.toBase58()}`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('✗ self-pay roundtrip failed:', err);
  process.exit(1);
});
