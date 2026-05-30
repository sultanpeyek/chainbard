/**
 * Scan agent + buyer wallets for SAP txs.
 * Decode SAP instructions, find all PDAs touched, report current lamport balances.
 * Goal: locate any leftover locked funds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnchorProvider, BorshInstructionCoder, Program, Wallet } from '@coral-xyz/anchor';
import { PROGRAM_ID } from '@oobe-protocol-labs/synapse-sap-sdk';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { env, requireEnv, resolveRpcUrl } from '../src/env/cli';

const PROGRAM = new PublicKey(PROGRAM_ID);
const LIMIT = 200;

function fmt(l: number) {
  return `${(l / LAMPORTS_PER_SOL).toFixed(6)} SOL`;
}

async function main() {
  const rpc = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);
  const agent = Keypair.fromSecretKey(bs58.decode(requireEnv('AGENT_SECRET_KEY_BASE58')));
  const buyer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(join(process.cwd(), 'keys', 'buyer.json'), 'utf8'))),
  );
  const conn = new Connection(rpc, 'confirmed');
  const provider = new AnchorProvider(conn, new Wallet(agent), { commitment: 'confirmed' });
  const idl: any = await Program.fetchIdl(PROGRAM, provider);
  if (!idl) throw new Error('No IDL');
  const coder = new BorshInstructionCoder(idl);

  console.log(`Agent: ${agent.publicKey.toBase58()}`);
  console.log(`Buyer: ${buyer.publicKey.toBase58()}`);
  console.log();

  const wallets = [
    { label: 'agent', pk: agent.publicKey },
    { label: 'buyer', pk: buyer.publicKey },
  ];

  const sapPdas = new Map<string, { ixs: Set<string>; firstSlot: number; lastSlot: number }>();
  const allSigs = new Set<string>();

  for (const w of wallets) {
    console.log(`── ${w.label} signature history (last ${LIMIT}) ──`);
    const sigs = await conn.getSignaturesForAddress(w.pk, { limit: LIMIT });
    console.log(`  found ${sigs.length} sigs`);
    for (const s of sigs) allSigs.add(s.signature);
  }
  console.log(`\nTotal unique sigs: ${allSigs.size}\n`);

  let sapTxCount = 0;
  let failedCount = 0;
  let sigsProcessed = 0;
  for (const sig of allSigs) {
    sigsProcessed++;
    if (sigsProcessed % 20 === 0)
      process.stderr.write(`  scanned ${sigsProcessed}/${allSigs.size}\r`);
    let tx;
    try {
      tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
    } catch {
      continue;
    }
    if (!tx) continue;
    if (tx.meta?.err) failedCount++;

    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses,
    });
    const programIdx = keys.staticAccountKeys.findIndex((k) => k.equals(PROGRAM));
    const allKeys = [
      ...keys.staticAccountKeys,
      ...(keys.accountKeysFromLookups?.writable ?? []),
      ...(keys.accountKeysFromLookups?.readonly ?? []),
    ];
    if (programIdx === -1) continue;

    const ixs = tx.transaction.message.compiledInstructions;
    for (const ix of ixs) {
      if (ix.programIdIndex !== programIdx) continue;
      sapTxCount++;
      let decoded;
      try {
        decoded = coder.decode(Buffer.from(ix.data));
      } catch {
        decoded = null;
      }
      const ixName = decoded?.name ?? 'unknown';
      const status = tx.meta?.err ? 'FAIL' : 'ok';
      console.log(`  ${sig.slice(0, 16)}…  slot=${tx.slot}  ${status}  ${ixName}`);
      // Record PDAs (accounts owned by SAP program)
      for (const idx of ix.accountKeyIndexes) {
        const pk = allKeys[idx];
        if (!pk) continue;
        const key = pk.toBase58();
        if (!sapPdas.has(key))
          sapPdas.set(key, { ixs: new Set(), firstSlot: tx.slot, lastSlot: tx.slot });
        const entry = sapPdas.get(key)!;
        entry.ixs.add(ixName);
        entry.lastSlot = Math.max(entry.lastSlot, tx.slot);
      }
    }
  }
  console.log(
    `\n${sapTxCount} SAP ix uses across ${allSigs.size} sigs (${failedCount} failed txs)\n`,
  );

  // For each unique account touched, check ownership + lamports
  console.log('── Per-account state (owned by SAP only) ──');
  const addrs = [...sapPdas.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < addrs.length; i += 100) chunks.push(addrs.slice(i, i + 100));
  const accountInfos: { addr: string; info: any }[] = [];
  for (const c of chunks) {
    const infos = await conn.getMultipleAccountsInfo(c.map((a) => new PublicKey(a)));
    infos.forEach((info, i) => accountInfos.push({ addr: c[i], info }));
  }

  let lockedTotal = 0;
  const locked: { addr: string; lam: number; ixs: string }[] = [];
  for (const { addr, info } of accountInfos) {
    if (!info) continue;
    if (!info.owner.equals(PROGRAM)) continue;
    const entry = sapPdas.get(addr)!;
    locked.push({ addr, lam: info.lamports, ixs: [...entry.ixs].join(',') });
    lockedTotal += info.lamports;
  }
  locked.sort((a, b) => b.lam - a.lam);
  for (const l of locked) {
    console.log(`  ${l.addr}  ${fmt(l.lam).padStart(12)}  [${l.ixs}]`);
  }
  console.log();
  console.log(`Total locked in SAP PDAs: ${fmt(lockedTotal)}`);
}

main().catch((e) => {
  console.error('✗', e);
  process.exit(1);
});
