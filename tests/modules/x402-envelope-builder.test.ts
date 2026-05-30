import { describe, expect, test } from 'bun:test';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { buildX402Envelope } from '@/modules/x402-envelope-builder';

// On-curve buyer pubkey (a real wallet authority is always on-curve, so its USDC
// ATA derives without TokenOwnerOffCurveError).
const BUYER = new PublicKey('GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMz');
const PAY_TO = '9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48';
const FACILITATOR = '3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BLOCKHASH = '11111111111111111111111111111111';

const REQUIREMENTS = {
  scheme: 'exact',
  network: 'solana',
  maxAmountRequired: '300000',
  payTo: PAY_TO,
  asset: USDC,
  extra: { decimals: 6, feePayer: FACILITATOR },
};

// Mock connection — never hits the network.
function makeConnection(
  blockhash = BLOCKHASH,
  simValue: { err: unknown; logs?: string[] | null } = { err: null },
) {
  return {
    async getLatestBlockhash() {
      return { blockhash, lastValidBlockHeight: 1000 };
    },
    async simulateTransaction() {
      return { value: simValue };
    },
  };
}

// Mock wallet-standard signer. Records what it was asked to sign and returns the
// tx unchanged (the builder serializes whatever this returns).
function makeSigner() {
  const calls: VersionedTransaction[] = [];
  const signer = async (tx: VersionedTransaction) => {
    calls.push(tx);
    return tx;
  };
  return { signer, calls };
}

// Decode the returned header back into its tx for assertions.
function decode(header: string) {
  const envelope = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  const tx = VersionedTransaction.deserialize(
    Buffer.from(envelope.payload.transaction, 'base64'),
  );
  return { envelope, tx, message: tx.message };
}

async function build(overrides: Partial<Parameters<typeof buildX402Envelope>[0]> = {}) {
  const { signer, calls } = makeSigner();
  const header = await buildX402Envelope({
    requirements: REQUIREMENTS,
    signTransaction: signer,
    buyerPubkey: BUYER,
    connection: makeConnection(),
    ...overrides,
  });
  return { header, calls };
}

describe('buildX402Envelope', () => {
  test('returns base64 of exactly { x402Version, scheme, network, payload:{ transaction } }', async () => {
    const { header } = await build();
    const { envelope } = decode(header);
    expect(envelope.x402Version).toBe(2);
    expect(envelope.scheme).toBe('exact');
    expect(envelope.network).toBe('solana');
    expect(typeof envelope.payload.transaction).toBe('string');
    // The route's decodeEnvelope reads payload.transaction — no serializedTransaction.
    expect(envelope.payload.serializedTransaction).toBeUndefined();
    expect(Object.keys(envelope.payload)).toEqual(['transaction']);
  });

  test('fee-payer (payerKey) === facilitator pubkey from requirements.extra.feePayer', async () => {
    const { header } = await build();
    const { message } = decode(header);
    expect(message.staticAccountKeys[0].toBase58()).toBe(FACILITATOR);
  });

  test('buyer is the signer the client signs (signTransaction called once, buyer is a required signer)', async () => {
    const { header, calls } = await build();
    expect(calls.length).toBe(1);
    const { message } = decode(header);
    const requiredSigners = message.staticAccountKeys
      .slice(0, message.header.numRequiredSignatures)
      .map((k) => k.toBase58());
    expect(requiredSigners).toContain(BUYER.toBase58());
  });

  test('TransferChecked targets payTo USDC ATA / USDC mint at amount=maxAmountRequired, decimals 6', async () => {
    const { header } = await build();
    const { message } = decode(header);

    const payToAta = getAssociatedTokenAddressSync(
      new PublicKey(USDC),
      new PublicKey(PAY_TO),
    ).toBase58();
    const buyerAta = getAssociatedTokenAddressSync(new PublicKey(USDC), BUYER).toBase58();

    // Locate the SPL Token TransferChecked instruction (program id = TOKEN_PROGRAM).
    const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const keys = message.staticAccountKeys.map((k) => k.toBase58());
    const transfer = message.compiledInstructions.find(
      (ix) =>
        keys[ix.programIdIndex] === TOKEN_PROGRAM &&
        // TransferChecked discriminator is 12 (0x0c); ATA-create is on the ATA program.
        ix.data[0] === 12,
    );
    if (!transfer) throw new Error('no TransferChecked instruction found');

    // createTransferCheckedInstruction account order: source, mint, destination, owner.
    const [srcIdx, mintIdx, destIdx, ownerIdx] = transfer.accountKeyIndexes;
    expect(keys[srcIdx]).toBe(buyerAta);
    expect(keys[mintIdx]).toBe(USDC);
    expect(keys[destIdx]).toBe(payToAta);
    expect(keys[ownerIdx]).toBe(BUYER.toBase58());

    // amount is a little-endian u64 in bytes [1..9); decimals byte is at [9].
    const view = new DataView(transfer.data.buffer, transfer.data.byteOffset, transfer.data.byteLength);
    expect(view.getBigUint64(1, true)).toBe(BigInt(REQUIREMENTS.maxAmountRequired));
    expect(transfer.data[9]).toBe(6);
  });

  test('dry-run simulate err with insufficient-funds logs throws before signing (message contains "insufficient")', async () => {
    const { signer, calls } = makeSigner();
    const connection = makeConnection(BLOCKHASH, {
      err: { InstructionError: [3, { Custom: 1 }] },
      logs: ['Program log: Error: insufficient funds'],
    });
    await expect(
      buildX402Envelope({
        requirements: REQUIREMENTS,
        signTransaction: signer,
        buyerPubkey: BUYER,
        connection,
      }),
    ).rejects.toThrow(/insufficient/);
    // PRE-payment failure: never reached the wallet signer.
    expect(calls.length).toBe(0);
  });

  test('matches the reference scripts/test-x402-payment.ts tx byte-for-byte (minus signatures)', async () => {
    // Independent reconstruction using the exact reference recipe, asserting the
    // builder compiles an identical v0 message.
    const amount = BigInt(REQUIREMENTS.maxAmountRequired);
    const usdcMint = new PublicKey(USDC);
    const payToPubkey = new PublicKey(PAY_TO);
    const buyerAta = getAssociatedTokenAddressSync(usdcMint, BUYER);
    const payToAta = getAssociatedTokenAddressSync(usdcMint, payToPubkey);

    const { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } =
      await import('@solana/spl-token');

    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
      createAssociatedTokenAccountIdempotentInstruction(BUYER, payToAta, payToPubkey, usdcMint),
      createTransferCheckedInstruction(buyerAta, usdcMint, payToAta, BUYER, amount, 6),
    ];
    const expectedMsg = new TransactionMessage({
      payerKey: new PublicKey(FACILITATOR),
      recentBlockhash: BLOCKHASH,
      instructions,
    }).compileToV0Message();

    const { header } = await build();
    const { message } = decode(header);
    expect(Buffer.from(message.serialize())).toEqual(
      Buffer.from((expectedMsg as VersionedMessage).serialize()),
    );
  });
});
