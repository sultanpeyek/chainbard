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

function row(input: string, provenance: string, createdAt: Date): Row {
  return {
    input_hash: input,
    input,
    story: story(input),
    provenance,
    created_at: createdAt,
    memo_sig: null,
    payment_sig: null,
  };
}

/**
 * Mock the `sql` boundary by interpreting the rendered query as real Postgres
 * would: apply the `provenance <> 'demo'` exclusion, `ORDER BY created_at DESC`,
 * and the bound `LIMIT`. This exercises listRecent's actual query through its
 * public interface without reaching into production internals.
 */
function makeSql(rows: Row[]): SqlQueryFn {
  return async (strings, ...values) => {
    const query = strings.join(' ').replace(/\s+/g, ' ').trim();
    let visible = [...rows];
    if (/provenance\s*(<>|!=)\s*'demo'|provenance\s+NOT\s+IN/i.test(query)) {
      visible = visible.filter((r) => r.provenance !== 'demo');
    }
    if (/ORDER\s+BY\s+created_at\s+DESC/i.test(query)) {
      visible.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    }
    if (/LIMIT/i.test(query)) {
      const limit = values[values.length - 1] as number;
      visible = visible.slice(0, limit);
    }
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
}

describe('createSqlRepo.listRecent (recent stories feed)', () => {
  // Mixed created_at order so DESC ordering is observable, not coincidental.
  const rows: Row[] = [
    row('SEED', 'seed', new Date('2026-05-20T00:00:00Z')),
    row('DEMO', 'demo', new Date('2026-05-29T00:00:00Z')),
    row('BUYER', 'buyer', new Date('2026-05-25T00:00:00Z')),
    row('CURATOR', 'curator', new Date('2026-05-22T00:00:00Z')),
  ];

  test('excludes demo rows from the feed', async () => {
    const repo = createSqlRepo(makeSql(rows));
    const recent = await repo.listRecent(10);
    expect(recent.map((r) => r.provenance)).not.toContain('demo');
    expect(recent.map((r) => r.input)).toEqual(['BUYER', 'CURATOR', 'SEED']);
  });

  test('orders newest-first by created_at', async () => {
    const repo = createSqlRepo(makeSql(rows));
    const recent = await repo.listRecent(10);
    const times = recent.map((r) => r.createdAt.getTime());
    const descending = [...times].sort((a, b) => b - a);
    expect(times).toEqual(descending);
    // BUYER (05-25) is newer than CURATOR (05-22), which is newer than SEED (05-20).
    expect(recent.map((r) => r.input)).toEqual(['BUYER', 'CURATOR', 'SEED']);
  });

  test('honors the limit (after demo exclusion and ordering)', async () => {
    const repo = createSqlRepo(makeSql(rows));
    const recent = await repo.listRecent(2);
    expect(recent).toHaveLength(2);
    // The two newest non-demo rows.
    expect(recent.map((r) => r.input)).toEqual(['BUYER', 'CURATOR']);
  });
});
