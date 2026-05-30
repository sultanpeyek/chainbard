import { describe, expect, test } from 'bun:test';
import { CostCapExceededError, CostGuard } from '@/cost-guard';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeClock(initialMs: number) {
  let now = initialMs;
  return {
    nowMs: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('CostGuard', () => {
  test('under-cap: check returns ok=true with correct spend', () => {
    const guard = new CostGuard(2.0);
    guard.increment(0.5);
    guard.increment(0.3);
    const status = guard.check();
    expect(status.ok).toBe(true);
    expect(status.spent).toBeCloseTo(0.8, 6);
    expect(status.cap).toBe(2.0);
  });

  test('at-cap: check returns ok=false', () => {
    const guard = new CostGuard(2.0);
    guard.increment(2.0);
    const status = guard.check();
    expect(status.ok).toBe(false);
    expect(status.spent).toBe(2.0);
  });

  test('over-cap: total exceeds cap, check returns ok=false', () => {
    const guard = new CostGuard(2.0);
    guard.increment(1.5);
    guard.increment(1.0);
    const status = guard.check();
    expect(status.ok).toBe(false);
    expect(status.spent).toBeCloseTo(2.5, 6);
  });

  test('guardOrThrow throws CostCapExceededError when cap hit', () => {
    const guard = new CostGuard(1.0);
    guard.increment(1.0);
    expect(() => guard.guardOrThrow()).toThrow(CostCapExceededError);
  });

  test('guardOrThrow does not throw when under cap', () => {
    const guard = new CostGuard(1.0);
    guard.increment(0.5);
    expect(() => guard.guardOrThrow()).not.toThrow();
  });

  test('CostCapExceededError carries spent and cap values', () => {
    const guard = new CostGuard(1.0);
    guard.increment(1.5);
    let caught: unknown;
    try {
      guard.guardOrThrow();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CostCapExceededError);
    const err = caught as CostCapExceededError;
    expect(err.spent).toBeCloseTo(1.5, 6);
    expect(err.cap).toBe(1.0);
    expect(err.message).toContain('1.0');
  });

  test('counter resets at UTC midnight (injectable clock)', () => {
    const clock = makeClock(Date.UTC(2024, 0, 15, 23, 59, 59, 999));
    const guard = new CostGuard(2.0, clock);
    guard.increment(1.5);
    expect(guard.check().spent).toBeCloseTo(1.5, 6);

    clock.advance(1); // crosses midnight → Jan 16 00:00:00.000 UTC
    expect(guard.check().spent).toBe(0);
    expect(guard.check().ok).toBe(true);
  });

  test('after daily reset, previously-capped guard allows requests', () => {
    const clock = makeClock(Date.UTC(2024, 0, 15, 12, 0, 0));
    const guard = new CostGuard(2.0, clock);
    guard.increment(2.0);
    expect(() => guard.guardOrThrow()).toThrow(CostCapExceededError);

    clock.advance(DAY_MS); // next day
    expect(() => guard.guardOrThrow()).not.toThrow();
  });

  test('concurrent increments are additive (no double-counting)', () => {
    const guard = new CostGuard(100.0);
    const amounts = [0.1, 0.2, 0.3, 0.4, 0.5];
    for (const amt of amounts) {
      guard.increment(amt);
    }
    const expected = amounts.reduce((a, b) => a + b, 0);
    expect(guard.check().spent).toBeCloseTo(expected, 6);
  });

  test('spent getter reflects current day total', () => {
    const guard = new CostGuard(10.0);
    expect(guard.spent).toBe(0);
    guard.increment(0.75);
    expect(guard.spent).toBeCloseTo(0.75, 6);
  });
});
