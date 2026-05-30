import { describe, expect, test } from 'bun:test';
import {
  createSapMemoWriter,
  type MemoArgs,
  parseMemoPayload,
  serializeMemoPayload,
} from '@/modules/sap-memo-writer';

const ARGS: MemoArgs = {
  inputHash: 'a'.repeat(64),
  storyHash: 'b'.repeat(64),
  briefHash: 'a'.repeat(64),
  aceReceipts: ['ace_chat_sig_001', 'ace_serp_sig_002', 'ace_img_sig_003'],
  paymentSig: 'pay_sig_xyz',
  timestamp: 1_700_000_000,
};

describe('serializeMemoPayload', () => {
  test('JSON shape stable and round-trips', () => {
    const s = serializeMemoPayload(ARGS);
    const parsed = parseMemoPayload(s);
    expect(parsed).toEqual({ ...ARGS, v: 2, kind: 'chainbard.mint' });
    expect(parsed.v).toBe(2);
    expect(parsed.briefHash).toBe('a'.repeat(64));
  });

  test('throws on invalid JSON', () => {
    expect(() => parseMemoPayload('not json')).toThrow();
  });

  test('throws on missing required field', () => {
    expect(() => parseMemoPayload(JSON.stringify({ v: 2, kind: 'chainbard.mint' }))).toThrow();
  });

  test('throws on missing briefHash', () => {
    const { briefHash: _briefHash, ...rest } = ARGS;
    expect(() => parseMemoPayload(JSON.stringify({ v: 2, kind: 'chainbard.mint', ...rest }))).toThrow();
  });
});

describe('createSapMemoWriter', () => {
  test('forwards serialized payload to sender, returns sig', async () => {
    let captured: string | null = null;
    const writer = createSapMemoWriter({
      async sendMemo(payload) {
        captured = payload;
        return 'memo_sig_001';
      },
    });
    const sig = await writer.writeMemo(ARGS);
    expect(sig).toBe('memo_sig_001');
    expect(captured).not.toBeNull();
    expect(parseMemoPayload(captured as unknown as string).paymentSig).toBe('pay_sig_xyz');
  });

  test('propagates sender errors', async () => {
    const writer = createSapMemoWriter({
      async sendMemo() {
        throw new Error('rpc dead');
      },
    });
    await expect(writer.writeMemo(ARGS)).rejects.toThrow('rpc dead');
  });

  test('payload fits in single memo tx (< 566 bytes when reasonable)', () => {
    const s = serializeMemoPayload(ARGS);
    expect(s.length).toBeLessThan(566);
  });
});
