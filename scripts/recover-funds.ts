/**
 * Recover funds locked by escrow-roundtrip flow.
 *
 * Recovers:
 *   - escrow_v2 balance (0.01 SOL) → buyer wallet
 *   - escrow_v2 rent (~0.003 SOL) → buyer wallet (via close_escrow_v2)
 *   - stake (0.1 SOL) → agent wallet (request_unstake → wait cooldown → complete_unstake)
 *
 * Phases (each idempotent; rerun safe):
 *   1. withdraw_escrow_v2(balance) — buyer signs
 *   2. close_escrow_v2          — buyer signs (only if balance=0)
 *   3. request_unstake(stakedAmount) — agent signs (only if not already requested)
 *   4. complete_unstake          — agent signs (only after unstakeAvailableAt)
 *
 * Defaults to DRY-RUN. Add --send to broadcast.
 *
 * Env:
 *   AGENT_SECRET_KEY_BASE58
 *   SOLANA_RPC_URL or SYNAPSE_RPC_URL
 * Files:
 *   keys/buyer.json
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import { PROGRAM_ID } from '@oobe-protocol-labs/synapse-sap-sdk';
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
const NONCE = new BN(0);
const PROGRAM = new PublicKey(PROGRAM_ID);

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
function fmt(l: number | bigint | BN) {
  const n = typeof l === 'number' ? l : typeof l === 'bigint' ? Number(l) : l.toNumber();
  return `${(n / LAMPORTS_PER_SOL).toFixed(6)} SOL`;
}
function solscan(sig: string) {
  return `https://solscan.io/tx/${sig}`;
}
function fmtTime(unix: number) {
  return new Date(unix * 1000).toISOString();
}

async function pollSig(conn: Connection, sig: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await conn.getSignatureStatus(sig, { searchTransactionHistory: false });
    if (value?.err) throw new Error(`tx failed: ${JSON.stringify(value.err)}`);
    if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') {
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`tx ${sig} not confirmed`);
}

async function buildTx(conn: Connection, payer: PublicKey, ixs: any[]) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  for (const ix of ixs) tx.add(ix);
  return tx;
}

async function send(conn: Connection, tx: Transaction, signers: Keypair[], label: string) {
  tx.sign(...signers);
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    await pollSig(conn, sig);
    console.log(`      ✓ ${label}  ${solscan(sig)}`);
    return sig;
  } catch (err) {
    if (err instanceof SendTransactionError) {
      console.error(`      ✗ ${label} failed: ${err.message}`);
      try {
        const logs = await err.getLogs(conn);
        if (logs?.length) {
          console.error('        --- logs ---');
          for (const l of logs) console.error(`        ${l}`);
        }
      } catch {}
    }
    throw err;
  }
}

async function main() {
  const rpc = resolveSendRpcUrl(env.SOLANA_RPC_URL);

  const agent = Keypair.fromSecretKey(bs58.decode(requireEnv('AGENT_SECRET_KEY_BASE58')));
  const buyer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(join(process.cwd(), 'keys', 'buyer.json'), 'utf8'))),
  );

  const conn = new Connection(rpc, 'confirmed');
  const agentProvider = new AnchorProvider(conn, new Wallet(agent), { commitment: 'confirmed' });
  const buyerProvider = new AnchorProvider(conn, new Wallet(buyer), { commitment: 'confirmed' });

  const agentPDA = pda([Buffer.from('sap_agent'), agent.publicKey.toBuffer()]);
  const stakePDA = pda([Buffer.from('sap_stake'), agentPDA.toBuffer()]);
  const escrowPDA = pda([
    Buffer.from('sap_escrow_v2'),
    agentPDA.toBuffer(),
    buyer.publicKey.toBuffer(),
    nonceBytes(NONCE),
  ]);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SAP fund recovery — escrow_v2 + stake');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:        ${SEND ? '🔴 SEND (real tx)' : '🟢 DRY-RUN'}`);
  console.log(`  Agent:       ${agent.publicKey.toBase58()}`);
  console.log(`  Buyer:       ${buyer.publicKey.toBase58()}`);
  console.log(`  Escrow PDA:  ${escrowPDA.toBase58()}`);
  console.log(`  Stake PDA:   ${stakePDA.toBase58()}`);
  console.log();

  const idl: any = await Program.fetchIdl(PROGRAM, agentProvider);
  if (!idl) throw new Error('No on-chain IDL');
  console.log(`  IDL version: ${idl.metadata?.version ?? idl.version}`);
  const agentProgram = new Program(idl, agentProvider);
  const buyerProgram = new Program(idl, buyerProvider);

  // ── Fetch state ─────────────────────────────────────────
  const [agLam0, buLam0, escrowInfo, stakeInfo] = await Promise.all([
    conn.getBalance(agent.publicKey),
    conn.getBalance(buyer.publicKey),
    conn.getAccountInfo(escrowPDA),
    conn.getAccountInfo(stakePDA),
  ]);

  console.log();
  console.log(`  Agent wallet: ${fmt(agLam0)}`);
  console.log(`  Buyer wallet: ${fmt(buLam0)}`);
  console.log();

  let escrow: any = null;
  if (escrowInfo) {
    escrow = await (agentProgram.account as any).escrowAccountV2.fetch(escrowPDA);
  }
  let stake: any = null;
  if (stakeInfo) {
    stake = await (agentProgram.account as any).agentStake.fetch(stakePDA);
  }

  const now = Math.floor(Date.now() / 1000);

  // ── PHASE 1: withdraw_escrow_v2 ────────────────────────
  console.log('  [1] withdraw_escrow_v2');
  if (!escrow) {
    console.log('      escrow missing → skip');
  } else if (escrow.balance.isZero?.() || escrow.balance.toString() === '0') {
    console.log('      balance already 0 → skip');
  } else {
    const amt: BN = escrow.balance;
    console.log(`      will withdraw ${fmt(amt)} to buyer`);
    if (SEND) {
      const ix = await (buyerProgram.methods as any)
        .withdrawEscrowV2(amt)
        .accountsPartial({ depositor: buyer.publicKey, escrow: escrowPDA })
        .instruction();
      const tx = await buildTx(conn, buyer.publicKey, [ix]);
      await send(conn, tx, [buyer], 'withdraw_escrow_v2');
    } else {
      console.log('      (dry-run; would send)');
    }
  }
  console.log();

  // ── PHASE 2: close_escrow_v2 ───────────────────────────
  console.log('  [2] close_escrow_v2');
  // Re-fetch escrow state after withdraw
  let canClose = false;
  if (SEND) {
    const info = await conn.getAccountInfo(escrowPDA);
    if (!info) {
      console.log('      escrow already closed → skip');
    } else {
      const fresh: any = await (buyerProgram.account as any).escrowAccountV2.fetch(escrowPDA);
      if (fresh.balance.toString() === '0') canClose = true;
      else console.log(`      escrow balance ${fmt(fresh.balance)} ≠ 0 → cannot close yet`);
    }
  } else if (escrow && escrow.balance.toString() === '0') {
    canClose = true;
  } else if (escrow) {
    canClose = true; // assumes phase 1 will succeed
    console.log('      (dry-run; assumes phase 1 will zero balance)');
  }

  if (canClose) {
    const rentBefore = (await conn.getAccountInfo(escrowPDA))?.lamports ?? 0;
    console.log(`      will close → reclaim ${fmt(rentBefore)} rent to buyer`);
    if (SEND) {
      const ix = await (buyerProgram.methods as any)
        .closeEscrowV2()
        .accountsPartial({ depositor: buyer.publicKey, escrow: escrowPDA })
        .instruction();
      const tx = await buildTx(conn, buyer.publicKey, [ix]);
      await send(conn, tx, [buyer], 'close_escrow_v2');
    } else {
      console.log('      (dry-run; would send)');
    }
  }
  console.log();

  // ── PHASE 3: request_unstake ───────────────────────────
  console.log('  [3] request_unstake');
  if (!stake) {
    console.log('      stake missing → skip');
  } else if (stake.unstakeRequestedAt.toString() !== '0') {
    console.log(
      `      unstake already requested (at ${fmtTime(stake.unstakeRequestedAt.toNumber())}); available at ${fmtTime(stake.unstakeAvailableAt.toNumber())}`,
    );
  } else if (stake.stakedAmount.toString() === '0') {
    console.log('      stakedAmount=0 → nothing to unstake');
  } else {
    const amt = stake.stakedAmount;
    console.log(`      will request unstake ${fmt(amt)}`);
    if (SEND) {
      const ix = await (agentProgram.methods as any)
        .requestUnstake(amt)
        .accountsPartial({ wallet: agent.publicKey, agent: agentPDA, stake: stakePDA })
        .instruction();
      const tx = await buildTx(conn, agent.publicKey, [ix]);
      await send(conn, tx, [agent], 'request_unstake');
    } else {
      console.log('      (dry-run; would send)');
    }
  }
  console.log();

  // ── PHASE 4: complete_unstake ──────────────────────────
  console.log('  [4] complete_unstake');
  if (!stake) {
    console.log('      stake missing → skip');
  } else if (stake.unstakeRequestedAt.toString() === '0') {
    console.log('      no unstake pending → run phase 3 first');
  } else if (stake.unstakeAvailableAt.toNumber() > now) {
    const wait = stake.unstakeAvailableAt.toNumber() - now;
    console.log(
      `      cooldown not met. ${wait}s remaining (available at ${fmtTime(stake.unstakeAvailableAt.toNumber())})`,
    );
  } else {
    console.log(`      cooldown met → will complete unstake (${fmt(stake.unstakeAmount)})`);
    if (SEND) {
      const ix = await (agentProgram.methods as any)
        .completeUnstake()
        .accountsPartial({ wallet: agent.publicKey, agent: agentPDA, stake: stakePDA })
        .instruction();
      const tx = await buildTx(conn, agent.publicKey, [ix]);
      await send(conn, tx, [agent], 'complete_unstake');
    } else {
      console.log('      (dry-run; would send)');
    }
  }
  console.log();

  // ── Summary ───────────────────────────────────────────
  if (SEND) {
    const [agLam1, buLam1] = await Promise.all([
      conn.getBalance(agent.publicKey),
      conn.getBalance(buyer.publicKey),
    ]);
    console.log('  Results:');
    console.log(`    Agent: ${fmt(agLam0)} → ${fmt(agLam1)}  (Δ ${fmt(agLam1 - agLam0)})`);
    console.log(`    Buyer: ${fmt(buLam0)} → ${fmt(buLam1)}  (Δ ${fmt(buLam1 - buLam0)})`);
  } else {
    console.log('🟢 DRY-RUN complete. Re-run with --send to broadcast.');
  }
}

main().catch((e) => {
  console.error('✗ recovery failed:', e);
  process.exit(1);
});
