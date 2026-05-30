import { describe, expect, test } from 'bun:test';
import { parseDemoArgs, usageText } from '@/modules/demo-cli';

describe('parseDemoArgs --tone', () => {
  test('defaults to undefined when --tone is not provided', () => {
    const args = parseDemoArgs([]);
    expect(args.tone).toBeUndefined();
  });

  test('parses --tone Comedy', () => {
    const args = parseDemoArgs(['--tone', 'Comedy']);
    expect(args.tone).toBe('Comedy');
  });

  test('parses --tone=Epic (inline-value form)', () => {
    const args = parseDemoArgs(['--tone=Epic']);
    expect(args.tone).toBe('Epic');
  });

  test('rejects an invalid tone value', () => {
    expect(() => parseDemoArgs(['--tone', 'Gloomy'])).toThrow(/tone/);
  });

  test('--tone can be combined with other flags', () => {
    const args = parseDemoArgs(['--send', '--tone', 'Tragedy', '--target', 'prod']);
    expect(args.send).toBe(true);
    expect(args.tone).toBe('Tragedy');
    expect(args.target).toBe('prod');
  });
});

describe('usageText with --tone', () => {
  test('documents the --tone flag', () => {
    const text = usageText();
    expect(text).toContain('--tone');
  });
});
