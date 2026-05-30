import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/pg-proxy';
import type { TickLog } from '@/autonomous-curator';
import {
  createSqlCuratorStoryRepo,
  createSqlRenderedSubjectStore,
  createSqlTickLogRepo,
} from '@/cron-adapters';
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

describe('createSqlCuratorStoryRepo', () => {
  test('upsertCurated inserts into wallet_stories with provenance=curator', async () => {
    const spy = makeDbSpy();
    const repo = createSqlCuratorStoryRepo(spy.db);
    const story = { title: 't', sections: [] };

    await repo.upsertCurated(WALLET, 'wallet', story, 'tick-1');

    expect(spy.calls).toHaveLength(1);
    const c = spy.calls[0];
    expect(c.sql.toLowerCase()).toContain('insert into "wallet_stories"');
    expect(c.sql.toLowerCase()).toContain('on conflict');
    expect(c.params).toContain(WALLET);
    expect(c.params).toContain('curator');
    // Story serialized into JSONB column as JSON string param
    expect(c.params).toContain(JSON.stringify(story));
  });

  test('attachMemo updates wallet_stories memo_sig by input_hash', async () => {
    const spy = makeDbSpy();
    const repo = createSqlCuratorStoryRepo(spy.db);

    await repo.attachMemo(WALLET, 'memo-sig-1');

    expect(spy.calls).toHaveLength(1);
    const c = spy.calls[0];
    expect(c.sql.toLowerCase()).toContain('update "wallet_stories"');
    expect(c.sql.toLowerCase()).toContain('"memo_sig"');
    expect(c.sql.toLowerCase()).toContain('"input_hash"');
    expect(c.params).toContain('memo-sig-1');
  });
});

describe('createSqlRenderedSubjectStore', () => {
  test('hasBeenRendered returns true when row found', async () => {
    const spy = makeDbSpy();
    spy.inject([{ exists: 1 }]);
    const store = createSqlRenderedSubjectStore(spy.db);

    const result = await store.hasBeenRendered(WALLET, 7);

    expect(result).toBe(true);
    expect(spy.calls[0].sql.toLowerCase()).toContain('select');
    expect(spy.calls[0].sql.toLowerCase()).toContain('from "wallet_stories"');
    expect(spy.calls[0].params).toContain(WALLET);
  });

  test('hasBeenRendered returns false when no row', async () => {
    const spy = makeDbSpy();
    spy.inject([]);
    const store = createSqlRenderedSubjectStore(spy.db);

    const result = await store.hasBeenRendered(WALLET, 7);

    expect(result).toBe(false);
  });
});

describe('createSqlTickLogRepo', () => {
  test('insert writes log row with all fields', async () => {
    const spy = makeDbSpy();
    const repo = createSqlTickLogRepo(spy.db);
    const log: TickLog = {
      id: 'tick-1',
      startedAt: new Date('2026-05-28T06:00:00Z'),
      signalSource: 'serp,chat',
      candidatesConsidered: 5,
      pickKind: 'token',
      pickIdentifier: WALLET,
      pickRationale: 'viral',
      pickSourceHit: 'BONK rips 40% on listing news',
      briefHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      aceReceipts: [{ kind: 'llm', model: 'm', promptTokens: 10, completionTokens: 20 }],
      memoSig: 'memo-1',
      webhookPosted: true,
      error: null,
    };

    await repo.insert(log);

    expect(spy.calls).toHaveLength(1);
    const c = spy.calls[0];
    expect(c.sql.toLowerCase()).toContain('insert into "tick_log"');
    expect(c.sql.toLowerCase()).toContain('on conflict');
    expect(c.params).toContain('tick-1');
    expect(c.params).toContain(WALLET);
    // pick_source_hit threads the SERP headline into the audit row (ADR 0014).
    expect(c.params).toContain('BONK rips 40% on listing news');
  });
});
