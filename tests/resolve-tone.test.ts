import { describe, expect, test } from 'bun:test';
import { resolveTone } from '@/lib/resolve-tone';

describe('resolveTone', () => {
  test('returns explicit tone when valid', () => {
    expect(resolveTone('Comedy', 'wallet')).toBe('Comedy');
    expect(resolveTone('Tragedy', 'tx')).toBe('Tragedy');
    expect(resolveTone('Elegy', 'nft')).toBe('Elegy');
    expect(resolveTone('Forensic', 'token')).toBe('Forensic');
    expect(resolveTone('Epic', 'wallet')).toBe('Epic');
  });

  test('falls back to inferToneFromKind when explicit tone is undefined', () => {
    // wallet default is Epic
    expect(resolveTone(undefined, 'wallet')).toBe('Epic');
    // tx default is Forensic
    expect(resolveTone(undefined, 'tx')).toBe('Forensic');
    // nft default is Elegy
    expect(resolveTone(undefined, 'nft')).toBe('Elegy');
    // token default is Comedy
    expect(resolveTone(undefined, 'token')).toBe('Comedy');
  });

  test('falls back to inferToneFromKind when explicit tone is not in TONES', () => {
    expect(resolveTone('Gloomy', 'wallet')).toBe('Epic');
    expect(resolveTone('', 'nft')).toBe('Elegy');
    expect(resolveTone('invalid', 'tx')).toBe('Forensic');
  });
});
