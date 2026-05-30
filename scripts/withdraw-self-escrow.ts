/**
 * Withdraw stranded self-pay escrow (session-3 leftover).
 *
 * Recovers SOL from escrow PDA `J5P67nrh5h6ujPJVYepMBZVAFfBQNyy5VWkihMkCh1q4`
 * back to the OLD agent wallet `8Uh3JmYdCXezhmdB3M7KdNiVT4AoiP5AY2b26eDJZoPW`.
 * Depositor must sign (self-pay) → uses `keys/agent-old.json`.
 *
 * Settle-adjacent IX → inline-IDL pattern (Program.fetchIdl + accountsPartial)
 * per memory `sap_sdk_idl_mismatch.md`. SDK helper avoided.
 *
 * Defaults to DRY-RUN. Add --send to broadcast.
 *
 * Usage:
 *   bun run scripts/withdraw-self-escrow.ts          # dry-run
 *   bun run scripts/withdraw-self-escrow.ts --send   # real tx
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnchorProvider, type BN, Program, Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { env, resolveSendRpcUrl, rpcHost } from '../src/env/cli';

const PROGRAM = new PublicKey('SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ');
const ESCROW = new PublicKey('J5P67nrh5h6ujPJVYepMBZVAFfBQNyy5VWkihMkCh1q4');
const EXPECTED_DEPOSITOR = new PublicKey('8Uh3JmYdCXezhmdB3M7KdNiVT4AoiP5AY2b26eDJZoPW');

const SEND = process.argv.includes('--send');

function loadKeypair(path: string): Keypair {
  const bytes = JSON.parse(readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function fmt(lamports: number | BN): string {
  const n = typeof lamports === 'number' ? lamports : lamports.toNumber();
  return `${(n / LAMPORTS_PER_SOL).toFixed(6)} SOL (${n} lamports)`;
}

async function main() {
  const rpc = resolveSendRpcUrl(env.SOLANA_RPC_URL);

  const oldAgent = loadKeypair(join(process.cwd(), 'keys', 'agent-old.json'));

  if (!oldAgent.publicKey.equals(EXPECTED_DEPOSITOR)) {
    console.error('✗ keys/agent-old.json does NOT match expected depositor.');
    console.error(`  loaded:   ${oldAgent.publicKey.toBase58()}`);
    console.error(`  expected: ${EXPECTED_DEPOSITOR.toBase58()}`);
    process.exit(1);
  }

  const conn = new Connection(rpc, 'confirmed');
  const provider = new AnchorProvider(conn, new Wallet(oldAgent), { commitment: 'confirmed' });

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Withdraw self-pay escrow → OLD agent wallet');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:        ${SEND ? '🔴 SEND (real tx)' : '🟢 DRY-RUN'}`);
  console.log(`  Depositor:   ${oldAgent.publicKey.toBase58()}`);
  console.log(`  Escrow PDA:  ${ESCROW.toBase58()}`);
  console.log(`  RPC host:    ${rpcHost(rpc)}`);
  console.log();

  const idl: any = await Program.fetchIdl(PROGRAM, provider);
  if (!idl) throw new Error('No on-chain IDL');
  console.log(`  IDL version: ${idl.metadata?.version ?? idl.version}`);
  const program = new Program(idl, provider);

  const escrowInfo = await conn.getAccountInfo(ESCROW);
  if (!escrowInfo) {
    console.log('  Escrow account missing on-chain → nothing to withdraw.');
    return;
  }

  const escrow: any = await (program.account as any).escrowAccountV2.fetch(ESCROW);
  const balance: BN = escrow.balance;

  console.log(`  Escrow depositor: ${escrow.depositor?.toBase58?.() ?? '(unknown field)'}`);
  console.log(`  Escrow balance:   ${fmt(balance)}`);
  console.log(`  Rent (closeable separately): ${fmt(escrowInfo.lamports)}`);
  console.log();

  if (balance.isZero()) {
    console.log('  Balance is 0 → no withdraw needed. (Use close_escrow_v2 to reclaim rent.)');
    return;
  }

  if (escrow.depositor && !escrow.depositor.equals(oldAgent.publicKey)) {
    console.error('✗ Escrow depositor ≠ loaded keypair. Aborting.');
    process.exit(1);
  }

  const walletLamportsBefore = await conn.getBalance(oldAgent.publicKey);
  console.log(`  Old wallet balance (pre):  ${fmt(walletLamportsBefore)}`);

  console.log('  → withdraw_escrow_v2(balance) (inline IDL)');

  if (!SEND) {
    console.log();
    console.log('🟢 DRY-RUN complete. Re-run with --send to broadcast.');
    return;
  }

  const ix = await (program.methods as any)
    .withdrawEscrowV2(balance)
    .accountsPartial({ depositor: oldAgent.publicKey, escrow: ESCROW })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: oldAgent.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([oldAgent]);

  console.log('🔴 Sending …');
  const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

  const walletLamportsAfter = await conn.getBalance(oldAgent.publicKey);
  console.log();
  console.log('✅ withdraw_escrow_v2 confirmed.');
  console.log(`   Tx:      https://solscan.io/tx/${sig}`);
  console.log(`   Wallet:  ${fmt(walletLamportsBefore)} → ${fmt(walletLamportsAfter)}`);
  console.log();
  console.log('Next: sweep recovered SOL to new agent wallet, e.g.');
  console.log('  solana transfer <NEW_AGENT_PUBKEY> ALL \\');
  console.log(
    '    --from keys/agent-old.json --allow-unfunded-recipient --fee-payer keys/agent-old.json',
  );
}

main().catch((err) => {
  console.error('✗ Withdraw failed:', err);
  process.exit(1);
});
