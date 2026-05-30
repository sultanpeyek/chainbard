import { describe, expect, test } from 'bun:test';
import {
  buildCronReceipt,
  buildCronRequest,
  buildCronTriggerPlan,
  parseCronResult,
} from '@/modules/demo-cli';

describe('buildCronTriggerPlan', () => {
  test('ready when CRON_SECRET present', () => {
    const plan = buildCronTriggerPlan({ CRON_SECRET: 'sekret' });
    expect(plan.ready).toBe(true);
    expect(plan.cronSecret).toBe('sekret');
    expect(plan.blockers).toEqual([]);
    // narration covers what the tick will do
    expect(plan.narration.join(' ')).toMatch(/autonomous-tick/i);
  });

  test('not ready when CRON_SECRET missing; lists it as a blocker', () => {
    const plan = buildCronTriggerPlan({});
    expect(plan.ready).toBe(false);
    expect(plan.blockers.join(' ')).toMatch(/CRON_SECRET/);
  });

  test('narration points at ace:debug for verbose detail and never mentions DEMO_SKIP_SENTINEL', () => {
    const plan = buildCronTriggerPlan({ CRON_SECRET: 's' });
    const joined = plan.narration.join(' ');
    expect(joined).toMatch(/ace:debug/);
    expect(joined).not.toMatch(/DEMO_SKIP_SENTINEL/i);
    expect(joined).not.toMatch(/sentinel/i);
  });
});

describe('buildCronRequest', () => {
  test('POSTs the tick route with the CRON_SECRET bearer', () => {
    const req = buildCronRequest('http://localhost:3000', 'sekret');
    expect(req.url).toBe('http://localhost:3000/api/cron/autonomous-tick');
    expect(req.method).toBe('POST');
    expect(req.headers.Authorization).toBe('Bearer sekret');
  });
});

describe('parseCronResult', () => {
  test('extracts storyUrl + tickLogId from the minimal success body', () => {
    const out = parseCronResult({
      tickLogId: 'tick-1',
      storyUrl: 'https://chainbard.vercel.app/abc',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected ok');
    expect(out.storyUrl).toBe('https://chainbard.vercel.app/abc');
    expect(out.tickLogId).toBe('tick-1');
  });

  test('maps a dormant body to a dormant failure step', () => {
    const out = parseCronResult({ dormant: true });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('expected failure');
    expect(out.step).toBe('dormant');
  });

  test('extracts the step from a failed tick (no reason/internals echoed)', () => {
    const out = parseCronResult({ ok: false, step: 'spotlight' });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('expected failure');
    expect(out.step).toBe('spotlight');
    // the route never echoes a reason/cost — the outcome carries none
    expect((out as Record<string, unknown>).reason).toBeUndefined();
  });
});

describe('buildCronReceipt', () => {
  test('renders only the tick id + public story URL (no rationale/receipts/sigs)', () => {
    const lines = buildCronReceipt({ ok: true, tickLogId: 't1', storyUrl: 'https://x/y' });
    const joined = lines.join('\n');
    expect(joined).toMatch(/tick:\s+t1/);
    expect(joined).toMatch(/story:\s+https:\/\/x\/y/);
    // scorched: no rationale, receipt breakdown, or on-chain proof lines
    expect(joined).not.toMatch(/rationale|sentinel|memo|webhook|ace:/i);
  });
});
