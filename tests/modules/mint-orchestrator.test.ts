import { describe, expect, test } from 'bun:test';
import {
  FatalError,
  type MintContext,
  type MintDeps,
  type MintRunStore,
  type RunArgs,
  mintKey,
  RetryableError,
  runMintFlow,
} from '@/modules/mint-orchestrator';
import type { WalletStory } from '@/story-renderer';
import type { X402Verifier } from '@/modules/x402-verifier';
import type { Plan } from '@/modules/director';
import type { AceChatLike } from '@/lib/ace-chat-json';

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const FIXTURE_PLAN: Plan = {
  tone: 'Comedy',
  serpQuery: '',
  imageStyle: 'noir',
  emphasis: 'the whale era',
};

// Minimal stand-in for the raw Ace facade; the Director fake ignores it.
const FAKE_ACE = {} as AceChatLike;

const FIXTURE_STORY: WalletStory = {
  kind: 'wallet',
  input: 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf',
  tone: 'Epic',
  title: 'Test',
  subtitle: 's',
  stats: [],
  sections: [],
  verdict: 'v',
  heroImagePrompt: 'p',
  heroImageUrl: 'https://x/y',
};

const ARGS: RunArgs = {
  input: FIXTURE_STORY.input,
  buyer: 'BuyerXXX1111111111111111111111111111111111',
  paymentSig: 'paySig_001',
  inputHash: 'inputhash_abc',
  expectedMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  expectedAmount: BigInt(300_000),
  expectedDestAta: 'DEST111111111111111111111111111111111111111',
};

function makeStore<S>(): MintRunStore<S> {
  const map = new Map<string, MintContext<S>>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async put(key, ctx) {
      map.set(key, ctx);
    },
  };
}

function okVerifier(): X402Verifier {
  return {
    async verifyPayment() {
      return { ok: true };
    },
    async markUsed() {
      // no-op for tests; real impl writes to dedupe store
    },
  };
}

interface CallLog {
  step: string;
}

function makeDeps(
  overrides: Partial<MintDeps<{ s: number }>> = {},
  log: CallLog[] = [],
): MintDeps<{ s: number }> {
  return {
    verifier: okVerifier(),
    async fetchSpotlights() {
      log.push({ step: 'fetchSpotlights' });
      return { s: 1 };
    },
    async render() {
      log.push({ step: 'render' });
      return { story: FIXTURE_STORY, aceReceipts: ['r1', 'r2', 'r3'] };
    },
    async persistStory() {
      log.push({ step: 'persistStory' });
      return { id: 'db_001' };
    },
    memoWriter: {
      async writeMemo() {
        log.push({ step: 'writeMemo' });
        return 'memo_sig_001';
      },
    },
    hashStory: () => 'storyhash_abc',
    now: () => 1700000000,
    ...overrides,
  };
}

describe('runMintFlow happy path', () => {
  test('runs all steps in order and reaches published', async () => {
    const log: CallLog[] = [];
    const deps = makeDeps({}, log);
    const store = makeStore<{ s: number }>();
    const ctx = await runMintFlow(deps, store, ARGS);

    expect(ctx.state).toBe('published');
    expect(log.map((l) => l.step)).toEqual([
      'fetchSpotlights',
      'render',
      'persistStory',
      'writeMemo',
    ]);
    expect(ctx.effects.memoSig).toBe('memo_sig_001');
    expect(ctx.effects.dbRecordId).toBe('db_001');
  });

  test('persists final context under (inputHash, buyer, paymentSig) key', async () => {
    const store = makeStore<{ s: number }>();
    await runMintFlow(makeDeps(), store, ARGS);
    const saved = await store.get(mintKey(ARGS.inputHash, ARGS.buyer, ARGS.paymentSig));
    expect(saved?.state).toBe('published');
  });
});

describe('runMintFlow verifier failures', () => {
  test('verifier reject → refundable with reason', async () => {
    const deps = makeDeps({
      verifier: {
        async verifyPayment() {
          return { ok: false, reason: 'wrong-amount' };
        },
        async markUsed() {},
      },
    });
    const ctx = await runMintFlow(deps, makeStore(), ARGS);
    expect(ctx.state).toBe('refundable');
    expect(ctx.verifierReason).toBe('wrong-amount');
    expect(ctx.failureReason).toContain('wrong-amount');
  });

  test('verifier reject does not invoke downstream steps', async () => {
    const log: CallLog[] = [];
    const deps = makeDeps(
      {
        verifier: {
          async verifyPayment() {
            return { ok: false, reason: 'stale-slot' };
          },
          async markUsed() {},
        },
      },
      log,
    );
    await runMintFlow(deps, makeStore(), ARGS);
    expect(log.length).toBe(0);
  });
});

describe('runMintFlow error classification', () => {
  test('FatalError → fatal terminal state', async () => {
    const deps = makeDeps({
      async render() {
        throw new FatalError('content-policy: blocked');
      },
    });
    const ctx = await runMintFlow(deps, makeStore(), ARGS);
    expect(ctx.state).toBe('fatal');
    expect(ctx.failureReason).toContain('content-policy');
  });

  test('RetryableError → retryable terminal state', async () => {
    const deps = makeDeps({
      async fetchSpotlights() {
        throw new RetryableError('rpc 503');
      },
    });
    const ctx = await runMintFlow(deps, makeStore(), ARGS);
    expect(ctx.state).toBe('retryable');
  });

  test('plain Error defaults to retryable', async () => {
    const deps = makeDeps({
      async fetchSpotlights() {
        throw new Error('network');
      },
    });
    const ctx = await runMintFlow(deps, makeStore(), ARGS);
    expect(ctx.state).toBe('retryable');
  });
});

describe('runMintFlow idempotency / resume', () => {
  test('re-invocation after published is a no-op (no double-charge, no re-render)', async () => {
    const log: CallLog[] = [];
    const deps = makeDeps({}, log);
    const store = makeStore<{ s: number }>();

    await runMintFlow(deps, store, ARGS);
    expect(log.length).toBe(4);

    await runMintFlow(deps, store, ARGS);
    expect(log.length).toBe(4); // unchanged — no re-execution
  });

  test('resumes after spotlights crash without re-fetching spotlights', async () => {
    const store = makeStore<{ s: number }>();
    let renderCount = 0;
    let memoCount = 0;
    let persistCount = 0;
    let fetchCount = 0;

    // First run: render throws retryable after spotlights succeed.
    const failingDeps = makeDeps({
      async fetchSpotlights() {
        fetchCount++;
        return { s: 1 };
      },
      async render() {
        renderCount++;
        throw new RetryableError('ace 503');
      },
    });
    const first = await runMintFlow(failingDeps, store, ARGS);
    expect(first.state).toBe('retryable');
    expect(fetchCount).toBe(1);
    expect(renderCount).toBe(1);
    expect(first.effects.spotlights).toEqual({ s: 1 });

    // Second run: render now succeeds. Spotlights must NOT be re-fetched.
    const resumingDeps = makeDeps({
      async fetchSpotlights() {
        fetchCount++;
        return { s: 999 };
      },
      async render() {
        renderCount++;
        return { story: FIXTURE_STORY, aceReceipts: ['r'] };
      },
      async persistStory() {
        persistCount++;
        return { id: 'db_resume' };
      },
      memoWriter: {
        async writeMemo() {
          memoCount++;
          return 'memo_resume';
        },
      },
    });
    const second = await runMintFlow(resumingDeps, store, ARGS);

    expect(second.state).toBe('published');
    expect(fetchCount).toBe(1); // not re-fetched
    expect(renderCount).toBe(2); // retried once
    expect(persistCount).toBe(1);
    expect(memoCount).toBe(1);
    expect(second.effects.spotlights).toEqual({ s: 1 }); // original kept
  });

  test('resumes from memo step without re-persisting', async () => {
    const store = makeStore<{ s: number }>();
    const key = mintKey(ARGS.inputHash, ARGS.buyer, ARGS.paymentSig);
    await store.put(key, {
      inputHash: ARGS.inputHash,
      input: ARGS.input,
      buyer: ARGS.buyer,
      paymentSig: ARGS.paymentSig,
      state: 'postingMemo',
      effects: {
        spotlights: { s: 1 },
        story: FIXTURE_STORY,
        aceReceipts: ['r'],
        dbRecordId: 'db_existing',
      },
    });

    const log: CallLog[] = [];
    const deps = makeDeps({}, log);
    const ctx = await runMintFlow(deps, store, ARGS);

    expect(ctx.state).toBe('published');
    expect(log.map((l) => l.step)).toEqual(['writeMemo']);
    expect(ctx.effects.dbRecordId).toBe('db_existing');
  });

  test('different paymentSig is a different run (no collision)', async () => {
    const log: CallLog[] = [];
    const deps = makeDeps({}, log);
    const store = makeStore<{ s: number }>();
    await runMintFlow(deps, store, ARGS);
    await runMintFlow(deps, store, { ...ARGS, paymentSig: 'paySig_002' });
    expect(log.length).toBe(8); // each run executes all four steps
  });
});

describe('runMintFlow Director (buyer brief)', () => {
  test('with brief: direct fires after facts (grounded on spotlights), director once, plan reaches render, memo gets briefHash', async () => {
    const steps: Array<{ id: string; status: string }> = [];
    let directorCalls = 0;
    let directorArgs: {
      spotlights: unknown;
      brief: string;
      kind: string;
      ace: AceChatLike;
    } | null = null;
    let renderedPlan: Plan | undefined;
    let capturedMemo: import('@/modules/sap-memo-writer').MemoArgs | null = null;

    const deps = makeDeps({
      ace: FAKE_ACE,
      async director(spotlights, brief, kind, ace) {
        directorCalls++;
        directorArgs = { spotlights, brief, kind, ace };
        return FIXTURE_PLAN;
      },
      async render({ plan }) {
        renderedPlan = plan;
        return { story: FIXTURE_STORY, aceReceipts: ['r1', 'r2', 'r3'] };
      },
      memoWriter: {
        async writeMemo(memoArgs) {
          capturedMemo = memoArgs;
          return 'memo_sig_001';
        },
      },
      onProgress: (id, status) => {
        steps.push({ id, status });
      },
    });

    const ctx = await runMintFlow(deps, makeStore<{ s: number }>(), {
      ...ARGS,
      brief: 'make it funny, whale energy',
      kind: 'token',
    });

    expect(ctx.state).toBe('published');
    expect(directorCalls).toBe(1);
    expect(
      directorArgs as unknown as {
        spotlights: unknown;
        brief: string;
        kind: string;
        ace: AceChatLike;
      },
    ).toEqual({
      spotlights: { s: 1 },
      brief: 'make it funny, whale energy',
      kind: 'token',
      ace: FAKE_ACE,
    });

    // direct emitted, and its active fires AFTER facts done — the Director must
    // see the fetched spotlights (grounding contract), so it cannot precede the
    // facts step that fetches them.
    const ids = steps.map((s) => s.id);
    expect(ids).toContain('direct');
    const directActive = steps.findIndex((s) => s.id === 'direct' && s.status === 'active');
    const factsDone = steps.findIndex((s) => s.id === 'facts' && s.status === 'done');
    expect(factsDone).toBeGreaterThanOrEqual(0);
    expect(directActive).toBeGreaterThan(factsDone);

    // Plan reaches render.
    expect(renderedPlan).toEqual(FIXTURE_PLAN);
    expect(ctx.effects.plan).toEqual(FIXTURE_PLAN);

    // Memo carries the briefHash (sha256 of the brief, not empty).
    expect(capturedMemo).not.toBeNull();
    const memo = capturedMemo as unknown as import('@/modules/sap-memo-writer').MemoArgs;
    expect(memo.briefHash).not.toBe(EMPTY_SHA256);
    expect(memo.briefHash).toHaveLength(64);
  });

  test('without brief: no direct, director not called, briefHash = sha256("")', async () => {
    const steps: Array<{ id: string; status: string }> = [];
    let directorCalls = 0;
    let renderedPlan: Plan | undefined = FIXTURE_PLAN;
    let capturedMemo: import('@/modules/sap-memo-writer').MemoArgs | null = null;

    const deps = makeDeps({
      ace: FAKE_ACE,
      async director() {
        directorCalls++;
        return FIXTURE_PLAN;
      },
      async render({ plan }) {
        renderedPlan = plan;
        return { story: FIXTURE_STORY, aceReceipts: ['r'] };
      },
      memoWriter: {
        async writeMemo(memoArgs) {
          capturedMemo = memoArgs;
          return 'memo_sig_001';
        },
      },
      onProgress: (id, status) => {
        steps.push({ id, status });
      },
    });

    // brief omitted entirely => no Director, briefHash = sha256('').
    const ctx = await runMintFlow(deps, makeStore<{ s: number }>(), ARGS);

    expect(ctx.state).toBe('published');
    expect(directorCalls).toBe(0);
    expect(steps.some((s) => s.id === 'direct')).toBe(false);
    expect(renderedPlan).toBeUndefined();
    expect(ctx.effects.plan).toBeUndefined();

    const memo = capturedMemo as unknown as import('@/modules/sap-memo-writer').MemoArgs;
    expect(memo.briefHash).toBe(EMPTY_SHA256);
  });
});

describe('runMintFlow side-effect ordering', () => {
  test('memo never written before persist', async () => {
    const events: string[] = [];
    const deps = makeDeps({
      async persistStory() {
        events.push('persist');
        return { id: 'x' };
      },
      memoWriter: {
        async writeMemo() {
          events.push('memo');
          return 'sig';
        },
      },
    });
    await runMintFlow(deps, makeStore(), ARGS);
    expect(events.indexOf('persist')).toBeLessThan(events.indexOf('memo'));
  });

  test('memoArgs reference deps.hashStory result and aceReceipts', async () => {
    let captured: import('@/modules/sap-memo-writer').MemoArgs | null = null;
    const deps = makeDeps({
      memoWriter: {
        async writeMemo(memoArgs) {
          captured = memoArgs;
          return 'sig';
        },
      },
      hashStory: () => 'computedstoryhash',
    });
    await runMintFlow(deps, makeStore(), ARGS);
    expect(captured).not.toBeNull();
    expect((captured as unknown as import('@/modules/sap-memo-writer').MemoArgs).storyHash).toBe(
      'computedstoryhash',
    );
    expect(
      (captured as unknown as import('@/modules/sap-memo-writer').MemoArgs).aceReceipts.length,
    ).toBe(3);
    expect((captured as unknown as import('@/modules/sap-memo-writer').MemoArgs).paymentSig).toBe(
      ARGS.paymentSig,
    );
  });
});
