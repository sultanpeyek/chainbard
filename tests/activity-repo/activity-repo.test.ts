import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { listTicks } from '@/activity-repo';
import type { Db } from '@/db';
import { schema } from '@/db';

type Call = { sql: string; params: unknown[]; method: string };

function makeDbSpy(): {
  db: Db;
  calls: Call[];
  inject: (rows: unknown[]) => void;
} {
  const calls: Call[] = [];
  let nextRows: unknown[] = [];
  const db = drizzle(
    async (sqlText, params, method) => {
      calls.push({ sql: sqlText, params, method });
      const rows = nextRows;
      nextRows = [];
      return { rows: rows as unknown[][] };
    },
    { schema },
  ) as unknown as Db;
  return { db, calls, inject: (rows) => (nextRows = rows) };
}

const WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

describe('listTicks', () => {
  test('selects from tick_log ordered by started_at desc', async () => {
    const spy = makeDbSpy();
    spy.inject([]);

    await listTicks(spy.db);

    expect(spy.calls).toHaveLength(1);
    const c = spy.calls[0];
    expect(c.sql.toLowerCase()).toContain('from "tick_log"');
    expect(c.sql.toLowerCase()).toContain('order by');
    expect(c.sql.toLowerCase()).toContain('"started_at" desc');
  });

  test('returns empty array when no rows', async () => {
    const spy = makeDbSpy();
    spy.inject([]);

    const ticks = await listTicks(spy.db);

    expect(ticks).toEqual([]);
  });

  test('maps a row to the ActivityTick shape', async () => {
    const spy = makeDbSpy();
    // drizzle pg-proxy returns rows as ordered value arrays; the select order
    // is the order of the columns declared in the select below.
    spy.inject([
      [
        'tick-1',
        '2026-05-28T06:00:00.000Z',
        'serp,chat',
        5,
        'wallet',
        WALLET,
        'looked viral',
        'viral on serp',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        JSON.stringify([{ kind: 'llm', model: 'm', promptTokens: 10, completionTokens: 20 }]),
        'memo-sig',
        true,
        null,
      ],
    ]);

    const ticks = await listTicks(spy.db);

    expect(ticks).toHaveLength(1);
    const t = ticks[0];
    expect(t.id).toBe('tick-1');
    expect(t.pickKind).toBe('wallet');
    expect(t.pickIdentifier).toBe(WALLET);
    expect(t.pickRationale).toBe('looked viral');
    expect(t.pickSourceHit).toBe('viral on serp');
    expect(t.briefHash).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(t.memoSig).toBe('memo-sig');
    expect(t.webhookPosted).toBe(true);
    expect(t.error).toBeNull();
    expect(t.aceReceipts).toEqual([
      { kind: 'llm', model: 'm', promptTokens: 10, completionTokens: 20 },
    ]);
  });
});
