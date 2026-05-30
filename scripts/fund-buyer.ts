/**
 * Generate (if missing) + fund a disposable buyer keypair for escrow-deposit e2e tests.
 *
 * Idempotent: re-run safe — if keys/buyer.json exists and is already funded,
 * nothing is sent. `--send` actually moves SOL + USDC; without it, dry-run.
 *
 * Funded amounts (tuned for ~3 hello-world buys):
 *   - 0.005 SOL  (gas + ATA rent if needed)
 *   - 0.05 USDC  (5 buys at 0.01 USDC each)
 *
 * Required env:
 *   AGENT_SECRET_KEY_BASE58  — funding source (the registered agent's keypair)
 *   SOLANA_RPC_URL or SYNAPSE_RPC_URL
 *
 * Usage:
 *   bun run fund-buyer          # dry-run
 *   bun run fund-buyer --send   # gen+save keypair, transfer SOL+USDC
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { env, requireEnv, resolveSendRpcUrl } from '../src/env/cli';

const SEND = process.argv.includes('--send');
const BUYER_KEY_PATH = 'keys/buyer.json';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SOL_AMOUNT = Math.round(0.005 * LAMPORTS_PER_SOL); // 5_000_000
const USDC_ATOMIC = BigInt(50_000); // 0.05 USDC, 6 decimals

function loadAgent(): Keypair {
  const b58 = requireEnv('AGENT_SECRET_KEY_BASE58');
  return Keypair.fromSecretKey(bs58.decode(b58));
}

function loadOrCreateBuyer(): { keypair: Keypair; created: boolean } {
  if (existsSync(BUYER_KEY_PATH)) {
    const arr = JSON.parse(readFileSync(BUYER_KEY_PATH, 'utf8')) as number[];
    return { keypair: Keypair.fromSecretKey(Uint8Array.from(arr)), created: false };
  }
  const kp = Keypair.generate();
  if (SEND) {
    mkdirSync(dirname(BUYER_KEY_PATH), { recursive: true });
    writeFileSync(BUYER_KEY_PATH, JSON.stringify(Array.from(kp.secretKey)));
  }
  return { keypair: kp, created: true };
}

async function main() {
  const agent = loadAgent();
  const rpcUrl = resolveSendRpcUrl(env.SOLANA_RPC_URL);
  const connection = new Connection(rpcUrl, 'confirmed');

  const { keypair: buyer, created } = loadOrCreateBuyer();

  const agentAta = await getAssociatedTokenAddress(USDC_MINT, agent.publicKey);
  const buyerAta = await getAssociatedTokenAddress(USDC_MINT, buyer.publicKey);

  const [agentSol, buyerSol, agentUsdcInfo, buyerUsdcInfo] = await Promise.all([
    connection.getBalance(agent.publicKey),
    connection.getBalance(buyer.publicKey),
    connection.getParsedAccountInfo(agentAta),
    connection.getParsedAccountInfo(buyerAta),
  ]);

  const agentUsdc = readTokenAmount(agentUsdcInfo.value);
  const buyerUsdc = readTokenAmount(buyerUsdcInfo.value);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Buyer wallet provisioning');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode:           ${SEND ? '🔴 SEND' : '🟢 DRY-RUN'}`);
  console.log(`  Keypair file:   ${BUYER_KEY_PATH}${created ? ' (will create)' : ' (exists)'}`);
  console.log();
  console.log(`  Agent pubkey:   ${agent.publicKey.toBase58()}`);
  console.log(`  Agent SOL:      ${(agentSol / LAMPORTS_PER_SOL).toFixed(6)}`);
  console.log(`  Agent USDC:     ${(Number(agentUsdc) / 1e6).toFixed(6)}`);
  console.log();
  console.log(`  Buyer pubkey:   ${buyer.publicKey.toBase58()}`);
  console.log(`  Buyer SOL:      ${(buyerSol / LAMPORTS_PER_SOL).toFixed(6)}`);
  console.log(`  Buyer USDC:     ${(Number(buyerUsdc) / 1e6).toFixed(6)}`);
  console.log();

  const needSol = buyerSol < SOL_AMOUNT;
  const needUsdc = buyerUsdc < USDC_ATOMIC;

  if (!needSol && !needUsdc) {
    console.log('  ✅ Buyer already funded sufficiently. Nothing to do.');
    return;
  }
  console.log(
    `  Plan: SOL ${needSol ? `+${SOL_AMOUNT} lamports` : 'OK'}, USDC ${needUsdc ? `+${USDC_ATOMIC}` : 'OK'}`,
  );

  if (!SEND) {
    console.log('  🟢 Dry-run complete. Re-run with --send to fund.');
    return;
  }

  if (agentSol < SOL_AMOUNT + 5_000_000) {
    console.error(
      `  ✗ Agent SOL insufficient (${agentSol} lamports). Need ≥ ${SOL_AMOUNT + 5_000_000} for fund + fees.`,
    );
    process.exit(1);
  }
  if (needUsdc && agentUsdc < USDC_ATOMIC) {
    console.error(`  ✗ Agent USDC insufficient (${agentUsdc}). Need ≥ ${USDC_ATOMIC}.`);
    process.exit(1);
  }

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
  ];

  if (needSol) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: agent.publicKey,
        toPubkey: buyer.publicKey,
        lamports: SOL_AMOUNT,
      }),
    );
  }

  if (needUsdc) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        agent.publicKey,
        buyerAta,
        buyer.publicKey,
        USDC_MINT,
      ),
      createTransferCheckedInstruction(
        agentAta,
        USDC_MINT,
        buyerAta,
        agent.publicKey,
        USDC_ATOMIC,
        6,
      ),
    );
  }

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: agent.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(),
  );
  tx.sign([agent]);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  console.log(`  → Tx sent: ${sig}`);
  await pollSignature(connection, sig);
  console.log(`  ✅ Confirmed: https://solscan.io/tx/${sig}`);
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

interface ParsedTokenAccount {
  data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } };
}

function readTokenAmount(value: unknown): bigint {
  const parsed = value as ParsedTokenAccount | null;
  const amount = parsed?.data?.parsed?.info?.tokenAmount?.amount;
  return amount ? BigInt(amount) : BigInt(0);
}

main().catch((err) => {
  console.error('✗ Fund failed:', err);
  process.exit(1);
});
