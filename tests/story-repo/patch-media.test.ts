import { describe, expect, test } from 'bun:test';
import { computeInputHash, createSqlRepo, type SqlQueryFn } from '@/story-repo';
import type { WalletStory } from '@/story-renderer';

const WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

const FIXTURE_STORY: WalletStory = {
  kind: 'wallet',
  input: WALLET,
  tone: 'Epic',
  title: 'The Architect of Quiet Bridges',
  subtitle: 'sub',
  stats: [
    { label: 'a', value: '1' },
    { label: 'b', value: '2' },
    { label: 'c', value: '3' },
  ],
  sections: [
    { title: '1', body: 'a' },
    { title: '2', body: 'b' },
    { title: '3', body: 'c' },
    { title: '4', body: 'd' },
    { title: '5', body: 'e' },
  ],
  verdict: 'v',
  heroImagePrompt: 'p',
  heroImageUrl: 'https://images.example/hero.jpg',
};

// Mock sql that records the rendered UPDATE query + the values it received, and
// applies a shallow `story || merge` jsonb merge to a single in-memory row so the
// SELECT round-trip reflects the patch.
function makeSql(): {
  sql: SqlQueryFn;
  updates: Array<{ query: string; values: unknown[] }>;
  row: { story: Record<string, unknown> };
} {
  const row = { story: { ...FIXTURE_STORY } as unknown as Record<string, unknown> };
  const updates: Array<{ query: string; values: unknown[] }> = [];
  const sql: SqlQueryFn = async (strings, ...values) => {
    const query = strings.join('?').replace(/\s+/g, ' ').trim();
    if (query.startsWith('UPDATE')) {
      updates.push({ query, values });
      const merge = JSON.parse(values[0] as string) as Record<string, unknown>;
      row.story = { ...row.story, ...merge };
    }
    if (query.startsWith('SELECT')) {
      return [
        {
          inputHash: values[0] as string,
          input: WALLET,
          story: row.story,
          provenance: 'buyer',
          createdAt: new Date(),
          memoSig: null,
          paymentSig: null,
          brief: null,
          briefHash: null,
        },
      ];
    }
    return [];
  };
  return { sql, updates, row };
}

describe('createSqlRepo.patchMedia (ADR 0016 D)', () => {
  test('merges both media legs into the story jsonb', async () => {
    const { sql } = makeSql();
    const repo = createSqlRepo(sql);
    const inputHash = computeInputHash(WALLET);
    await repo.patchMedia(inputHash, {
      videoUrl: 'https://cdn/v.mp4',
      videoProvider: 'veo',
      audioUrl: 'https://cdn/a.mp3',
      audioProvider: 'fish',
    });
    const result = await repo.getByInputHash(inputHash);
    const s = result!.story as unknown as Record<string, unknown>;
    expect(s.videoUrl).toBe('https://cdn/v.mp4');
    expect(s.videoProvider).toBe('veo');
    expect(s.audioUrl).toBe('https://cdn/a.mp3');
    expect(s.audioProvider).toBe('fish');
    // existing fields untouched by the shallow merge
    expect(s.title).toBe(FIXTURE_STORY.title);
  });

  test('only-video patch leaves audio keys absent (no overwrite-with-null)', async () => {
    const { sql, updates } = makeSql();
    const repo = createSqlRepo(sql);
    const inputHash = computeInputHash(WALLET);
    await repo.patchMedia(inputHash, { videoUrl: 'https://cdn/v.mp4', videoProvider: 'veo' });
    // the merge payload carries ONLY the supplied keys
    const merge = JSON.parse(updates[0].values[0] as string) as Record<string, unknown>;
    expect(Object.keys(merge).sort()).toEqual(['videoProvider', 'videoUrl']);
    expect(merge.audioUrl).toBeUndefined();
    const result = await repo.getByInputHash(inputHash);
    const s = result!.story as unknown as Record<string, unknown>;
    expect(s.videoUrl).toBe('https://cdn/v.mp4');
    expect(s.audioUrl).toBeUndefined();
  });

  test('an empty patch (no media generated) issues no UPDATE', async () => {
    const { sql, updates } = makeSql();
    const repo = createSqlRepo(sql);
    await repo.patchMedia(computeInputHash(WALLET), {});
    expect(updates).toHaveLength(0);
  });

  test('a patch of all-undefined fields issues no UPDATE', async () => {
    const { sql, updates } = makeSql();
    const repo = createSqlRepo(sql);
    await repo.patchMedia(computeInputHash(WALLET), {
      videoUrl: undefined,
      audioUrl: undefined,
    });
    expect(updates).toHaveLength(0);
  });
});
