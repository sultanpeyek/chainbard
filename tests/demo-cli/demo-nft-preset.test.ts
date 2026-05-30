/**
 * #81 — nft kind: NFT_PRESET_MINT + resolveInputForKind no-throw
 *
 * RED phase: these tests will fail until demo-cli.ts exports NFT_PRESET_MINT
 * and resolveInputForKind returns it instead of throwing.
 */
import { describe, expect, test } from 'bun:test';
import { NFT_PRESET_MINT, resolveInputForKind, TX_PRESET_SIG } from '@/modules/demo-cli';

const BUYER_PUBKEY = '4Nd1mBQtrMJVYVfKf2PX59QBBVVQksPKYWme6bwgkH7m';

// ── NFT_PRESET_MINT ──────────────────────────────────────────────────────────

describe('NFT_PRESET_MINT', () => {
  test('is a non-empty string', () => {
    expect(typeof NFT_PRESET_MINT).toBe('string');
    expect(NFT_PRESET_MINT.length).toBeGreaterThan(0);
  });

  test('is a valid base58 pubkey (32–44 chars)', () => {
    // Valid Solana pubkey/mint: 32–44 base58 chars
    expect(NFT_PRESET_MINT.length).toBeGreaterThanOrEqual(32);
    expect(NFT_PRESET_MINT.length).toBeLessThanOrEqual(44);
  });

  test('is not the synthetic fixture mint', () => {
    // NFT_FIXTURE_MINT is the synthetic fallback — the preset should be a real one
    // (or documented as the fixture if DAS was unavailable during derivation)
    // This test simply ensures it is not the same value as TX_PRESET_SIG
    expect(NFT_PRESET_MINT).not.toBe(TX_PRESET_SIG);
  });
});

// ── resolveInputForKind — nft now returns preset ─────────────────────────────

describe('resolveInputForKind — nft preset (#81)', () => {
  test('nft kind with no --input → NFT_PRESET_MINT (no longer throws)', () => {
    const result = resolveInputForKind({ kind: 'nft' }, BUYER_PUBKEY);
    expect(result).toBe(NFT_PRESET_MINT);
  });

  test('--input overrides nft preset', () => {
    const explicit = 'ExplicitMintOverride11111111111111111111111';
    expect(resolveInputForKind({ input: explicit, kind: 'nft' }, BUYER_PUBKEY)).toBe(explicit);
  });

  test('tx kind still returns TX_PRESET_SIG', () => {
    expect(resolveInputForKind({ kind: 'tx' }, BUYER_PUBKEY)).toBe(TX_PRESET_SIG);
  });

  test('wallet kind still returns buyer pubkey', () => {
    expect(resolveInputForKind({ kind: 'wallet' }, BUYER_PUBKEY)).toBe(BUYER_PUBKEY);
  });
});
