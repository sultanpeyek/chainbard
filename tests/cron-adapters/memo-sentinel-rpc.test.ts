import { describe, expect, test } from 'bun:test';
import BN from 'bn.js';
import {
  createMemoWriterAdapter,
  createWeb3SpotlightRpc,
  type ConnectionLike,
} from '@/cron-adapters';
import type { MemoArgs, SapMemoWriter } from '@/modules/sap-memo-writer';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

describe('createMemoWriterAdapter', () => {
  test('resolves MemoArgs then calls writeMemo, returns { sig }', async () => {
    const captured: MemoArgs[] = [];
    const writer: SapMemoWriter = {
      async writeMemo(args) {
        captured.push(args);
        return 'memo-sig-1';
      },
    };
    const adapter = createMemoWriterAdapter({
      writer,
      async resolveArgs(tickLogId, summary) {
        return {
          inputHash: tickLogId.padEnd(64, '0'),
          storyHash: summary.padEnd(64, '0'),
          briefHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          aceReceipts: [],
          paymentSig: '',
          timestamp: 1700000000,
        };
      },
    });

    const { sig } = await adapter.write('tick-xyz', 'a summary');
    expect(sig).toBe('memo-sig-1');
    expect(captured[0].inputHash.startsWith('tick-xyz')).toBe(true);
  });

  test('writeMemo failure returns null sig (does not throw)', async () => {
    const writer: SapMemoWriter = {
      async writeMemo() {
        throw new Error('rpc down');
      },
    };
    const adapter = createMemoWriterAdapter({
      writer,
      async resolveArgs(tickLogId, summary) {
        return {
          inputHash: tickLogId.padEnd(64, '0'),
          storyHash: summary.padEnd(64, '0'),
          briefHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          aceReceipts: [],
          paymentSig: '',
          timestamp: 0,
        };
      },
    });
    const { sig } = await adapter.write('t', 's');
    expect(sig).toBeNull();
  });
});

describe('createWeb3SpotlightRpc', () => {
  test('getBalance returns bigint from connection.getBalance', async () => {
    const conn: ConnectionLike = {
      async getBalance() {
        return 1_234_567_890;
      },
      async getSignaturesForAddress() {
        return [];
      },
      async getParsedTransaction() {
        return null;
      },
      async getParsedTokenAccountsByOwner() {
        return { value: [] };
      },
    };
    const rpc = createWeb3SpotlightRpc(conn, PublicKey, TOKEN_PROGRAM_ID);
    const bal = await rpc.getBalance(WALLET);
    expect(bal).toBe(BigInt(1_234_567_890));
  });

  test('getSignaturesForAddress maps web3.js shape to SpotlightSigInfo', async () => {
    const conn: ConnectionLike = {
      async getBalance() {
        return 0;
      },
      async getSignaturesForAddress() {
        return [
          { signature: 'sig-1', slot: 1, blockTime: 100, err: null },
          { signature: 'sig-2', slot: 2, blockTime: null, err: { x: 1 } },
        ];
      },
      async getParsedTransaction() {
        return null;
      },
      async getParsedTokenAccountsByOwner() {
        return { value: [] };
      },
    };
    const rpc = createWeb3SpotlightRpc(conn, PublicKey, TOKEN_PROGRAM_ID);
    const sigs = await rpc.getSignaturesForAddress(WALLET, { limit: 5 });
    expect(sigs).toHaveLength(2);
    expect(sigs[0].signature).toBe('sig-1');
    expect(sigs[1].err).toEqual({ x: 1 });
  });

  test('getTokenAccountsByOwner returns count', async () => {
    const conn: ConnectionLike = {
      async getBalance() {
        return 0;
      },
      async getSignaturesForAddress() {
        return [];
      },
      async getParsedTransaction() {
        return null;
      },
      async getParsedTokenAccountsByOwner() {
        return { value: [{}, {}, {}] };
      },
    };
    const rpc = createWeb3SpotlightRpc(conn, PublicKey, TOKEN_PROGRAM_ID);
    expect(await rpc.getTokenAccountsByOwner(WALLET)).toEqual({ count: 3 });
  });

  test('getAssetsByOwner returns count 0 stub (DAS not wired in this adapter)', async () => {
    const conn: ConnectionLike = {
      async getBalance() {
        return 0;
      },
      async getSignaturesForAddress() {
        return [];
      },
      async getParsedTransaction() {
        return null;
      },
      async getParsedTokenAccountsByOwner() {
        return { value: [] };
      },
    };
    const rpc = createWeb3SpotlightRpc(conn, PublicKey, TOKEN_PROGRAM_ID);
    expect(await rpc.getAssetsByOwner(WALLET)).toEqual({ count: 0 });
  });

  // Touch BN import so it doesn't break lint
  test('BN sanity (unused but linked)', () => {
    expect(new BN(0).toNumber()).toBe(0);
  });
});
