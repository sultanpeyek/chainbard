/**
 * #80 — demo-cli --kind / --input / resolveInputForKind
 * RED phase: these tests will fail until demo-cli.ts is updated.
 */
import { describe, expect, test } from 'bun:test';
import {
  NFT_PRESET_MINT,
  parseDemoArgs,
  resolveInputForKind,
  TX_PRESET_SIG,
  usageText,
} from '@/modules/demo-cli';

// ── TX_PRESET_SIG ─────────────────────────────────────────────────────────────

describe('TX_PRESET_SIG', () => {
  test('is the verified mainnet sig from issue #80', () => {
    expect(TX_PRESET_SIG).toBe(
      'u4UR1pzady5Lo5krC9dm2UULNuT4SmD9TCu7xqEhR6GYVj3E1JKamnXn7e8CvvfsATzCfdBfYe6pDfx1cScSSqq',
    );
  });
});

// ── parseDemoArgs — new --kind and --input flags ──────────────────────────────

describe('parseDemoArgs — --kind flag', () => {
  test('default kind is wallet', () => {
    const args = parseDemoArgs([]);
    expect(args.kind).toBe('wallet');
  });

  test('--kind wallet is accepted', () => {
    const args = parseDemoArgs(['--kind', 'wallet']);
    expect(args.kind).toBe('wallet');
  });

  test('--kind tx is accepted', () => {
    const args = parseDemoArgs(['--kind', 'tx']);
    expect(args.kind).toBe('tx');
  });

  test('--kind nft is accepted', () => {
    const args = parseDemoArgs(['--kind', 'nft']);
    expect(args.kind).toBe('nft');
  });

  test('--kind token is rejected with a clear error', () => {
    expect(() => parseDemoArgs(['--kind', 'token'])).toThrow(/token/i);
  });

  test('--kind token error message says render is deferred (not "lands in #82")', () => {
    let msg = '';
    try {
      parseDemoArgs(['--kind', 'token']);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('deferred');
    expect(msg).not.toContain('lands in');
  });

  test('--kind=tx inline form is accepted', () => {
    const args = parseDemoArgs(['--kind=tx']);
    expect(args.kind).toBe('tx');
  });

  test('unknown kind value throws', () => {
    expect(() => parseDemoArgs(['--kind', 'bork'])).toThrow(/kind/i);
  });
});

describe('parseDemoArgs — --input flag', () => {
  test('default input is undefined', () => {
    const args = parseDemoArgs([]);
    expect(args.input).toBeUndefined();
  });

  test('--input <value> stores it verbatim', () => {
    const sig =
      'u4UR1pzady5Lo5krC9dm2UULNuT4SmD9TCu7xqEhR6GYVj3E1JKamnXn7e8CvvfsATzCfdBfYe6pDfx1cScSSqq';
    const args = parseDemoArgs(['--input', sig]);
    expect(args.input).toBe(sig);
  });

  test('--input=value inline form works', () => {
    const args = parseDemoArgs(['--input=some-id-123']);
    expect(args.input).toBe('some-id-123');
  });

  test('missing value for --input throws', () => {
    expect(() => parseDemoArgs(['--input'])).toThrow(/missing/i);
  });
});

// ── resolveInputForKind ───────────────────────────────────────────────────────

const BUYER_PUBKEY = '4Nd1mBQtrMJVYVfKf2PX59QBBVVQksPKYWme6bwgkH7m';

describe('resolveInputForKind', () => {
  test('--input always wins regardless of kind', () => {
    const explicit = 'explicit-override-sig';
    expect(resolveInputForKind({ input: explicit, kind: 'wallet' }, BUYER_PUBKEY)).toBe(explicit);
    expect(resolveInputForKind({ input: explicit, kind: 'tx' }, BUYER_PUBKEY)).toBe(explicit);
    expect(resolveInputForKind({ input: explicit, kind: 'nft' }, BUYER_PUBKEY)).toBe(explicit);
  });

  test('wallet kind with no --input → buyer pubkey', () => {
    expect(resolveInputForKind({ kind: 'wallet' }, BUYER_PUBKEY)).toBe(BUYER_PUBKEY);
  });

  test('tx kind with no --input → TX_PRESET_SIG', () => {
    expect(resolveInputForKind({ kind: 'tx' }, BUYER_PUBKEY)).toBe(TX_PRESET_SIG);
  });

  test('nft kind with no --input → NFT_PRESET_MINT (#81 landed)', () => {
    // #81 replaced the throw with the baked-in cNFT preset mint
    expect(resolveInputForKind({ kind: 'nft' }, BUYER_PUBKEY)).toBe(NFT_PRESET_MINT);
  });

  test('default (no kind field) → buyer pubkey', () => {
    expect(resolveInputForKind({}, BUYER_PUBKEY)).toBe(BUYER_PUBKEY);
  });
});

// ── usageText includes --kind and --input ─────────────────────────────────────

describe('usageText', () => {
  test('documents --kind flag', () => {
    expect(usageText()).toContain('--kind');
  });

  test('documents --input flag', () => {
    expect(usageText()).toContain('--input');
  });

  test('mentions wallet|tx|nft in kind description', () => {
    const text = usageText();
    expect(text).toContain('wallet');
    expect(text).toContain('tx');
    expect(text).toContain('nft');
  });
});
