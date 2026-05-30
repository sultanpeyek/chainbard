import { describe, expect, test } from 'bun:test';
import { createSqlRepo, type SqlQueryFn } from '@/story-repo';
import type { WalletStory } from '@/story-renderer';

const story = (input: string): WalletStory => ({
  kind: 'wallet',
  input,
  tone: 'Epic',
  title: `Story ${input}`,
  subtitle: 'sub',
  stats: [],
  sections: [],
  verdict: 'v',
  heroImagePrompt: 'p',
  heroImageUrl: 'https://images.example/hero.jpg',
});

interface Row {
  input_hash: string;
  input: string;
  story: WalletStory;
  provenance: string;
  created_at: Date;
  memo_sig: string | null;
  payment_sig: string | null;
}

/**
 * Mock sql that records the rendered query text and applies a `provenance`
 * filter when the query excludes demo rows. The real Postgres path enforces
 * the same exclusion in SQL; this verifies the repo emits an exclusion query.
 */
function makeSql(rows: Row[]): { sql: SqlQueryFn; lastQuery: () => string } {
  let last = '';
  const sql: SqlQueryFn = async (strings, ..._values) => {
    const query = strings.join(' ').replace(/\s+/g, ' ').trim();
    last = query;
    const excludesDemo = /provenance\s*(<>|!=)\s*'demo'|provenance\s+NOT\s+IN/i.test(query);
    const visible = excludesDemo ? rows.filter((r) => r.provenance !== 'demo') : rows;
    return visible.map((r) => ({
      inputHash: r.input_hash,
      input: r.input,
      story: r.story,
      provenance: r.provenance,
      createdAt: r.created_at,
      memoSig: r.memo_sig,
      paymentSig: r.payment_sig,
    }));
  };
  return { sql, lastQuery: () => last };
}

describe('createSqlRepo.listRecent', () => {
  const rows: Row[] = [
    {
      input_hash: 'h1',
      input: 'BUYER',
      story: story('BUYER'),
      provenance: 'buyer',
      created_at: new Date(),
      memo_sig: null,
      payment_sig: null,
    },
    {
      input_hash: 'h2',
      input: 'DEMO',
      story: story('DEMO'),
      provenance: 'demo',
      created_at: new Date(),
      memo_sig: null,
      payment_sig: null,
    },
    {
      input_hash: 'h3',
      input: 'CURATOR',
      story: story('CURATOR'),
      provenance: 'curator',
      created_at: new Date(),
      memo_sig: null,
      payment_sig: null,
    },
  ];

  test('excludes provenance="demo" rows from the public feed', async () => {
    const { sql } = makeSql(rows);
    const repo = createSqlRepo(sql);
    const recent = await repo.listRecent(10);
    const provenances = recent.map((r) => r.provenance);
    expect(provenances).not.toContain('demo');
    expect(provenances).toContain('buyer');
    expect(provenances).toContain('curator');
  });

  test('query text excludes demo rows', async () => {
    const { sql, lastQuery } = makeSql(rows);
    const repo = createSqlRepo(sql);
    await repo.listRecent(10);
    expect(lastQuery()).toMatch(/provenance\s*(<>|!=)\s*'demo'|provenance\s+NOT\s+IN/i);
  });
});
