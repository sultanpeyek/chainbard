import { describe, expect, test } from 'bun:test';
import {
  computeInputHash,
  createSqlRepo,
  type Provenance,
  type SqlQueryFn,
  type WalletStoryRow,
} from '@/story-repo';
import type { WalletStory } from '@/story-renderer';

const WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

const FIXTURE_STORY: WalletStory = {
  kind: 'wallet',
  input: WALLET,
  tone: 'Epic',
  title: 'The Architect of Quiet Bridges',
  subtitle: 'A wallet that arrived in the silence of 2020.',
  stats: [
    { label: 'First seen', value: 'Mar 16, 2020' },
    { label: 'Txs', value: '47,219' },
    { label: 'SOL flowed', value: '1.2M' },
  ],
  sections: [
    { title: 'Origin', body: 'Born in 2020.' },
    { title: 'Companions', body: 'Three counterparties.' },
    { title: 'Eras', body: 'Five eras.' },
    { title: 'Crowning', body: 'The peak tx.' },
    { title: 'Drama', body: 'A near-miss.' },
  ],
  verdict: 'A wallet that endures.',
  heroImagePrompt: 'Desert dawn, stone bridges, no figures.',
  heroImageUrl: 'https://images.example/hero.jpg',
};

function makeStore(): Map<string, WalletStoryRow> {
  return new Map();
}

function makeSql(store: Map<string, WalletStoryRow>): SqlQueryFn {
  return async function sql(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<WalletStoryRow[]> {
    const query = strings.join('?').trim();
    if (query.startsWith('SELECT') || query.startsWith('select')) {
      const hash = values[0] as string;
      const row = store.get(hash);
      return row ? [row] : [];
    }
    if (query.startsWith('INSERT') || query.startsWith('insert')) {
      const [inputHash, input, storyJson, provenance, brief, briefHash] = values as [
        string,
        string,
        string,
        Provenance,
        string | null,
        string | null,
      ];
      const existing = store.get(inputHash);
      // Models `ON CONFLICT DO UPDATE SET story, provenance, brief, brief_hash`:
      // on re-mint the story + provenance + brief columns are replaced (latest-
      // paid-wins), but createdAt and the receipt columns (owned by
      // attachReceipts) are preserved.
      store.set(inputHash, {
        inputHash,
        input,
        story: JSON.parse(storyJson) as WalletStory,
        provenance,
        createdAt: existing?.createdAt ?? new Date(),
        memoSig: existing?.memoSig ?? null,
        paymentSig: existing?.paymentSig ?? null,
        brief: brief ?? null,
        briefHash: briefHash ?? null,
      });
    }
    if (query.startsWith('UPDATE') || query.startsWith('update')) {
      const [memoSig, paymentSig, inputHash] = values as [string, string, string];
      const existing = store.get(inputHash);
      if (existing) {
        store.set(inputHash, { ...existing, memoSig, paymentSig });
      }
    }
    return [];
  };
}

describe('computeInputHash', () => {
  test('produces a 64-char hex string', () => {
    const hash = computeInputHash(WALLET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('same input produces the same hash', () => {
    expect(computeInputHash(WALLET)).toBe(computeInputHash(WALLET));
  });

  test('different inputs produce different hashes', () => {
    expect(computeInputHash(WALLET)).not.toBe(computeInputHash('other'));
  });
});

describe('createSqlRepo', () => {
  test('getByInputHash returns null when nothing is stored', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const result = await repo.getByInputHash(computeInputHash(WALLET));
    expect(result).toBeNull();
  });

  test('upsert then getByInputHash returns the stored row', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);
    await repo.upsert({ inputHash, input: WALLET, story: FIXTURE_STORY, provenance: 'seed' });
    const result = await repo.getByInputHash(inputHash);
    expect(result).not.toBeNull();
    expect(result!.inputHash).toBe(inputHash);
    expect(result!.input).toBe(WALLET);
    expect(result!.provenance).toBe('seed');
    expect(result!.story.kind).toBe('wallet');
    expect(result!.story.tone).toBe('Epic');
  });

  test('upsert overwrites story + provenance on conflict (DO UPDATE), preserving receipts', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);
    await repo.upsert({ inputHash, input: WALLET, story: FIXTURE_STORY, provenance: 'seed' });
    await repo.attachReceipts(inputHash, { memoSig: 'memo-1', paymentSig: 'pay-1' });

    const reStory: WalletStory = { ...FIXTURE_STORY, title: 'A Newer Chronicle' };
    await repo.upsert({ inputHash, input: WALLET, story: reStory, provenance: 'demo' });

    const result = await repo.getByInputHash(inputHash);
    // re-mint replaces the displayed story + provenance ...
    expect(result!.story.title).toBe('A Newer Chronicle');
    expect(result!.provenance).toBe('demo');
    // ... but does not clobber receipts (attachReceipts owns those columns)
    expect(result!.memoSig).toBe('memo-1');
    expect(result!.paymentSig).toBe('pay-1');
  });

  test('stores and retrieves all story fields via JSON round-trip', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);
    await repo.upsert({ inputHash, input: WALLET, story: FIXTURE_STORY, provenance: 'curator' });
    const result = await repo.getByInputHash(inputHash);
    expect(result!.story.title).toBe(FIXTURE_STORY.title);
    // Narrow to wallet kind before accessing wallet-specific fields
    if (result!.story.kind !== 'wallet') throw new Error('expected wallet story');
    expect(result!.story.sections).toHaveLength(5);
    expect(result!.story.heroImageUrl).toBe(FIXTURE_STORY.heroImageUrl);
  });

  test('attachReceipts persists memoSig + paymentSig for buyer mint', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);
    await repo.upsert({ inputHash, input: WALLET, story: FIXTURE_STORY, provenance: 'buyer' });
    await repo.attachReceipts(inputHash, {
      memoSig: 'memo-sig-abc',
      paymentSig: 'pay-sig-xyz',
    });
    const result = await repo.getByInputHash(inputHash);
    expect(result!.memoSig).toBe('memo-sig-abc');
    expect(result!.paymentSig).toBe('pay-sig-xyz');
  });

  test('getByInputHash resolves a demo row (share page renders demo by URL)', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);
    await repo.upsert({ inputHash, input: WALLET, story: FIXTURE_STORY, provenance: 'demo' });
    const result = await repo.getByInputHash(inputHash);
    expect(result).not.toBeNull();
    expect(result!.provenance).toBe('demo');
  });

  test('seed rows have null receipts until attached', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);
    await repo.upsert({ inputHash, input: WALLET, story: FIXTURE_STORY, provenance: 'seed' });
    const result = await repo.getByInputHash(inputHash);
    expect(result!.memoSig).toBeNull();
    expect(result!.paymentSig).toBeNull();
  });

  test('upsert persists + returns the buyer brief and its hash', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);
    const brief = 'make it read like a heist thriller';
    const briefHash = computeInputHash(brief);
    await repo.upsert({
      inputHash,
      input: WALLET,
      story: FIXTURE_STORY,
      provenance: 'buyer',
      brief,
      briefHash,
    });
    const result = await repo.getByInputHash(inputHash);
    expect(result!.brief).toBe(brief);
    expect(result!.briefHash).toBe(briefHash);
  });

  test('re-upsert same input_hash with a new brief overwrites (latest-paid-wins)', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);

    const firstBrief = 'epic and reverent';
    await repo.upsert({
      inputHash,
      input: WALLET,
      story: FIXTURE_STORY,
      provenance: 'buyer',
      brief: firstBrief,
      briefHash: computeInputHash(firstBrief),
    });

    const newBrief = 'dry forensic ledger';
    await repo.upsert({
      inputHash,
      input: WALLET,
      story: FIXTURE_STORY,
      provenance: 'buyer',
      brief: newBrief,
      briefHash: computeInputHash(newBrief),
    });

    const result = await repo.getByInputHash(inputHash);
    expect(result!.brief).toBe(newBrief);
    expect(result!.briefHash).toBe(computeInputHash(newBrief));
  });

  test('a briefless row reads null brief + briefHash', async () => {
    const store = makeStore();
    const repo = createSqlRepo(makeSql(store));
    const inputHash = computeInputHash(WALLET);
    await repo.upsert({ inputHash, input: WALLET, story: FIXTURE_STORY, provenance: 'seed' });
    const result = await repo.getByInputHash(inputHash);
    expect(result!.brief).toBeNull();
    expect(result!.briefHash).toBeNull();
  });
});
