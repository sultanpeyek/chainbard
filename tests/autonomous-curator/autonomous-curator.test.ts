import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  runCuratorTick,
  type CuratorDeps,
  type TickLog,
  type TickLogRepo,
  type CuratorStoryRepo,
  type MemoWriter,
} from '@/autonomous-curator';
import { createHash } from 'node:crypto';
import type { AgentStateRepo } from '@/agent-state-repo';
import { CostCapExceededError, CostGuard } from '@/cost-guard';
import { FundsExhaustedError } from '@/treasury';
import type { DexPair, DexscreenerClient } from '@/dexscreener-resolver';
import type { AceChatLike } from '@/lib/ace-chat-json';
import type { Plan } from '@/modules/director';
import { makeInMemoryPostedStore } from '@/webhook-poster';
import type { AggregatorDeps, SerpClient, AggregatorChatClient, RenderedSubjectStore } from '@/signal-aggregator';
import type { SpotlightRpc, TokenSpotlightSource } from '@/spotlight-fetcher';
import type { ChatClient, ImageClient, SerpClient as RenderSerpClient, TxRenderDeps } from '@/story-renderer';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WALLET_A = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';
const STORY_BASE_URL = 'https://chainbard.vercel.app';
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/test/token';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeSerpMock(): SerpClient {
  return { async search() { return []; } };
}

const TICKER = 'BONK';

function makeChatMock(rationale = 'test rationale'): AggregatorChatClient {
  return {
    async complete<T>({ schema }: { system: string; user: string; schema: z.ZodType<T> }) {
      const candidate = { ticker: TICKER, sourceHitText: `${TICKER} is trending`, rationale };
      const raw = { candidates: [candidate], pick: candidate };
      return { data: schema.parse(raw) as T };
    },
  };
}

// Fake Ace facade: the Director calls `aceChatJson` -> `ace.openai...create`.
// Returns a Plan with a distinctive tone so steering is observable in the
// rendered story, and records each call so "Director invoked" is checkable.
const STEERED_PLAN: Plan = { tone: 'Comedy', serpQuery: '', imageStyle: '', emphasis: 'absurdist' };

function makeAceMock(plan: Plan = STEERED_PLAN): { ace: AceChatLike; calls: unknown[] } {
  const calls: unknown[] = [];
  const ace: AceChatLike = {
    openai: {
      chat: {
        completions: {
          create: async (args) => {
            calls.push(args);
            return {
              choices: [{ message: { content: JSON.stringify(plan) } }],
              model: 'gpt-4o-mini',
            };
          },
        },
      },
    },
  };
  return { ace, calls };
}

// Resolves TICKER → a Solana pair whose mint is `mint`, above the resolver floors.
function makeDexMock(mint = WALLET_A): DexscreenerClient {
  const pairs: DexPair[] = [
    {
      chainId: 'solana',
      dexId: 'raydium',
      pairAddress: `pair_${mint}`,
      baseToken: { address: mint, name: TICKER, symbol: TICKER },
      liquidity: { usd: 50_000 },
      volume: { h24: 20_000 },
      marketCap: 50_000_000, // above the market-cap floor
    },
  ];
  return {
    async search(ticker) {
      return ticker.toLowerCase() === TICKER.toLowerCase() ? pairs : [];
    },
    async pairsForMint(m) {
      return pairs.filter((p) => p.baseToken.address === m);
    },
  };
}

function neverRendered(): RenderedSubjectStore {
  return { async hasBeenRendered() { return false; } };
}

function makeRpcMock(): SpotlightRpc {
  return {
    async getBalance() { return BigInt(1_000_000_000); },
    async getSignaturesForAddress() { return []; },
    async getTransaction() { return null; },
    async getTokenAccountsByOwner() { return { count: 0 }; },
    async getAssetsByOwner() { return { count: 0 }; },
  };
}

// Shared token enrichment source (ADR 0014). Returns market data so the token
// render path produces a usable infographic story, and counts calls so the
// curator's token branch is observable.
function makeTokenSourceMock(): { source: TokenSpotlightSource; mints: string[] } {
  const mints: string[] = [];
  return {
    mints,
    source: {
      async getMintInfo(mint) {
        mints.push(mint);
        return { decimals: 5, supplyRaw: BigInt('100000000000000'), mintRenounced: true, freezeRenounced: true };
      },
      async getAssetInfo() {
        return {
          ticker: TICKER,
          name: 'Bonk',
          spotPriceUsd: 0.000025,
          liquidityUsd: 50_000,
          volume24h: 20_000,
          priceChange24h: 12.5,
        };
      },
      async getLaunchedAt() { return 1_700_000_000; },
    },
  };
}

function makeRenderSerpMock(): RenderSerpClient {
  return { async search() { return { snippets: [] }; } };
}

const FIVE_SECTIONS = [
  { title: 'Origin', body: 'Born on-chain.' },
  { title: 'Companions', body: 'Three counterparties.' },
  { title: 'Eras', body: 'Activity eras.' },
  { title: 'Crowning', body: 'Peak transaction.' },
  { title: 'Drama', body: 'Failed near-miss.' },
];

function makeRenderMock(titleOverride?: string): { chat: ChatClient; image: ImageClient } {
  return {
    chat: {
      async complete<T>({ schema }: { system: string; user: string; schema: z.ZodType<T> }) {
        const data = {
          title: titleOverride ?? 'Wallet Story Title',
          subtitle: 'A wallet tale.',
          stats: [
            { label: 'Balance', value: '1.00 SOL' },
            { label: 'Txs', value: '0' },
            { label: 'Tokens', value: '0' },
          ],
          sections: FIVE_SECTIONS,
          verdict: 'A wallet that endures.',
          heroImagePrompt: 'Desert landscape, no figures.',
          // Token render path requires the structured origin beat; harmless for
          // the wallet schema (zod strips the unknown key).
          origin: { founder: '', firstMint: '', keyEvents: [] },
        };
        return { data: schema.parse(data) as T, promptTokens: 100, completionTokens: 50, model: 'mock' };
      },
    },
    image: {
      async generate() {
        return { url: 'https://images.example/hero.jpg', model: 'mock-image' };
      },
    },
  };
}

function makeTickLogRepo(): { repo: TickLogRepo; logs: TickLog[] } {
  const logs: TickLog[] = [];
  return {
    logs,
    repo: { async insert(log) { logs.push(log); } },
  };
}

function makeStoryRepo(): {
  repo: CuratorStoryRepo;
  calls: Array<[string, string, unknown, string]>;
  memoAttachments: Array<[string, string]>;
} {
  const calls: Array<[string, string, unknown, string]> = [];
  const memoAttachments: Array<[string, string]> = [];
  return {
    calls,
    memoAttachments,
    repo: {
      async upsertCurated(id, kind, story, tickLogId) {
        calls.push([id, kind, story, tickLogId]);
      },
      async attachMemo(id, memoSig) {
        memoAttachments.push([id, memoSig]);
      },
    },
  };
}

function makeMemoWriter(): { writer: MemoWriter; callCount: number } {
  let callCount = 0;
  return {
    get callCount() { return callCount; },
    writer: { async write() { callCount += 1; return { sig: 'memo-sig-xyz' }; } },
  };
}

function makeWebhookCalls(): Array<{ url: string; body: unknown }> {
  return [];
}

function baseDeps(overrides: {
  tickLogRepo?: TickLogRepo;
  storyRepo?: CuratorStoryRepo;
  memoWriter?: MemoWriter;
  render?: { chat: ChatClient; image: ImageClient };
  tokenSource?: TokenSpotlightSource;
  webhookCalls?: Array<{ url: string; body: unknown }>;
  webhookStatus?: number;
  ace?: AceChatLike;
  rationale?: string;
} = {}): CuratorDeps {
  const webhookCalls = overrides.webhookCalls ?? [];
  const webhookStatus = overrides.webhookStatus ?? 204;
  const aggregator: AggregatorDeps = {
    serp: makeSerpMock(),
    chat: overrides.rationale === undefined ? makeChatMock() : makeChatMock(overrides.rationale),
    dex: makeDexMock(),
    recentSubjects: neverRendered(),
  };
  // The aggregator resolves every ticker to kind:'token', so a curator tick
  // routes through the token branch (ADR 0014). The same render mock drives both
  // `render` (wallet) and `tokenRender` (token); tokenRender adds the serp dep.
  // A fresh per-tick CostGuard keeps these renders off the shared defaultCostGuard
  // singleton, so the curator suite never consumes the process-wide budget other
  // render tests rely on (avoids cross-file cost-cap pollution).
  const render = overrides.render ?? makeRenderMock();
  const costGuard = new CostGuard(1000);
  const tokenRender: TxRenderDeps = {
    chat: render.chat,
    image: render.image,
    serp: makeRenderSerpMock(),
    costGuard,
  };
  return {
    aggregator,
    rpc: makeRpcMock(),
    render: { ...render, costGuard },
    tokenSource: overrides.tokenSource ?? makeTokenSourceMock().source,
    tokenRender,
    storyRepo: overrides.storyRepo ?? makeStoryRepo().repo,
    memoWriter: overrides.memoWriter ?? makeMemoWriter().writer,
    webhook: {
      webhookUrl: DISCORD_WEBHOOK,
      store: makeInMemoryPostedStore(),
      http: {
        async post(url, body) {
          webhookCalls.push({ url, body });
          return { status: webhookStatus };
        },
      },
    },
    tickLogRepo: overrides.tickLogRepo ?? makeTickLogRepo().repo,
    storyBaseUrl: STORY_BASE_URL,
    ace: overrides.ace,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runCuratorTick — happy path', () => {
  test('returns { ok: true } with tickLogId and storyUrl', async () => {
    const result = await runCuratorTick(baseDeps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.tickLogId).toBe('string');
      expect(result.storyUrl).toContain(WALLET_A);
      expect(result.storyUrl).toContain(STORY_BASE_URL);
    }
  });

  test('persists tick_log with all required fields', async () => {
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ tickLogRepo: repo }));
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(typeof log.id).toBe('string');
    expect(log.startedAt).toBeInstanceOf(Date);
    expect(typeof log.signalSource).toBe('string');
    expect(typeof log.candidatesConsidered).toBe('number');
    expect(typeof log.pickKind).toBe('string');
    expect(typeof log.pickIdentifier).toBe('string');
    expect(typeof log.pickRationale).toBe('string');
    expect(Array.isArray(log.aceReceipts)).toBe(true);
    expect(log.error).toBeNull();
  });

  test('tick_log records signal source as a non-empty string', async () => {
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ tickLogRepo: repo }));
    expect(logs[0].signalSource.length).toBeGreaterThan(0);
  });

  test('tick_log records memo sig', async () => {
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ tickLogRepo: repo }));
    expect(logs[0].memoSig).toBe('memo-sig-xyz');
  });

  test('tick_log records webhookPosted = true on success', async () => {
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ tickLogRepo: repo }));
    expect(logs[0].webhookPosted).toBe(true);
  });

  test('upserts story to story-repo with curator provenance', async () => {
    const { repo, calls } = makeStoryRepo();
    const { repo: tickRepo } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ storyRepo: repo, tickLogRepo: tickRepo }));
    expect(calls).toHaveLength(1);
    const [identifier, kind, , tickLogId] = calls[0];
    expect(identifier).toBe(WALLET_A);
    expect(kind).toBe('token');
    expect(typeof tickLogId).toBe('string');
  });

  test('attaches the memo sig onto the curated story row', async () => {
    const { repo, memoAttachments } = makeStoryRepo();
    await runCuratorTick(baseDeps({ storyRepo: repo }));
    expect(memoAttachments).toHaveLength(1);
    const [identifier, memoSig] = memoAttachments[0];
    expect(identifier).toBe(WALLET_A);
    expect(memoSig).toBe('memo-sig-xyz');
  });

  test('writes SAP memo exactly once per tick', async () => {
    let count = 0;
    const trackMemo: MemoWriter = {
      async write() { count += 1; return { sig: 'memo' }; },
    };
    await runCuratorTick(baseDeps({ memoWriter: trackMemo }));
    expect(count).toBe(1);
  });

  test('posts webhook with storyUrl containing the pick identifier', async () => {
    const calls = makeWebhookCalls();
    await runCuratorTick(baseDeps({ webhookCalls: calls }));
    expect(calls).toHaveLength(1);
    const body = calls[0].body as Record<string, string>;
    expect(body.content).toContain(WALLET_A);
  });

  test('each tick gets a unique tickLogId', async () => {
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ tickLogRepo: repo }));
    await runCuratorTick(baseDeps({ tickLogRepo: repo }));
    expect(logs[0].id).not.toBe(logs[1].id);
  });
});

describe('runCuratorTick — cost-guard abort', () => {
  // Cost-guard is enforced inside renderStory via the shared defaultCostGuard
  // singleton. The curator catches CostCapExceededError thrown from render and
  // aborts the tick cleanly. We simulate the throw by making the render mock
  // raise CostCapExceededError directly.

  function makeCapHitRender(): { chat: ChatClient; image: ImageClient } {
    return {
      chat: {
        async complete<T>(): Promise<{
          data: T;
          promptTokens: number;
          completionTokens: number;
          model: string;
        }> {
          throw new CostCapExceededError(2.5, 2);
        },
      },
      image: {
        async generate() {
          return { url: '', model: '' };
        },
      },
    };
  }

  test('returns { ok: false } when render throws CostCapExceededError', async () => {
    const result = await runCuratorTick(baseDeps({ render: makeCapHitRender() }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('cap');
    }
  });

  test('persists tick_log with error field on cost-cap abort', async () => {
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ render: makeCapHitRender(), tickLogRepo: repo }));
    expect(logs).toHaveLength(1);
    expect(logs[0].error).not.toBeNull();
  });

  test('does not call memo-writer or webhook when cost-cap aborts', async () => {
    const calls = makeWebhookCalls();
    let memoCalls = 0;
    await runCuratorTick(
      baseDeps({
        render: makeCapHitRender(),
        memoWriter: { async write() { memoCalls += 1; return { sig: null }; } },
        webhookCalls: calls,
      }),
    );
    expect(calls).toHaveLength(0);
    expect(memoCalls).toBe(0);
  });
});

describe('runCuratorTick — webhook failure fails the tick', () => {
  test('returns { ok: false } when webhook responds with non-2xx', async () => {
    const result = await runCuratorTick(baseDeps({ webhookStatus: 500 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('webhook');
    }
  });

  test('persists tick_log with error field when webhook fails', async () => {
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ webhookStatus: 502, tickLogRepo: repo }));
    expect(logs).toHaveLength(1);
    expect(logs[0].error).not.toBeNull();
    expect(logs[0].webhookPosted).toBe(false);
  });
});

describe('runCuratorTick — error handling', () => {
  test('returns { ok: false } and persists error in tick_log when rendering throws', async () => {
    const { repo, logs } = makeTickLogRepo();
    const throwingRender = {
      chat: {
        async complete<T>() {
          throw new Error('render failed');
          return {} as { data: T; promptTokens: number; completionTokens: number; model: string };
        },
      },
      image: { async generate() { return { url: '', model: '' }; } },
    };
    // Pass render THROUGH baseDeps so tokenRender (the active branch) is derived
    // from the throwing chat too.
    const result = await runCuratorTick(baseDeps({ render: throwingRender, tickLogRepo: repo }));
    expect(result.ok).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0].error).toBe('render failed');
  });

  test('tick_log id in result matches the log entry id', async () => {
    const { repo, logs } = makeTickLogRepo();
    const result = await runCuratorTick(baseDeps({ tickLogRepo: repo }));
    expect(result.tickLogId).toBe(logs[0].id);
  });
});

describe('runCuratorTick — rationale steers the Director', () => {
  test('non-empty rationale invokes the Director', async () => {
    const { ace, calls } = makeAceMock();
    await runCuratorTick(baseDeps({ ace }));
    expect(calls.length).toBeGreaterThan(0);
  });

  test('Director plan steers the rendered story tone', async () => {
    const { ace } = makeAceMock();
    const { repo: storyRepo, calls } = makeStoryRepo();
    await runCuratorTick(baseDeps({ ace, storyRepo }));
    expect(calls).toHaveLength(1);
    const story = calls[0][2] as { tone: string };
    expect(story.tone).toBe('Comedy');
  });

  test('tick_log briefHash = sha256(rationale) when rationale present', async () => {
    const { ace } = makeAceMock();
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ ace, tickLogRepo: repo }));
    const expected = createHash('sha256').update('test rationale').digest('hex');
    expect(logs[0].briefHash).toBe(expected);
  });

  test('no Ace dep => Director skipped, today fallback tone (Epic)', async () => {
    // The aggregator always emits a non-empty rationale, so the "Director
    // skipped" path is exercised by the legacy deps shape (no `ace` injected):
    // the tick must keep today's fixed 'Epic' fallback, untouched.
    const { repo: storyRepo, calls: storyCalls } = makeStoryRepo();
    await runCuratorTick(baseDeps({ storyRepo }));
    const story = storyCalls[0][2] as { tone: string };
    expect(story.tone).toBe('Epic');
  });

  test('error-path tick_log records briefHash = sha256("") (no pick yet)', async () => {
    // When the tick aborts before a pick exists, the audit trail still carries
    // a uniform briefHash: sha256 of the empty brief.
    const { repo, logs } = makeTickLogRepo();
    const throwingRender = {
      chat: {
        async complete<T>(): Promise<{
          data: T;
          promptTokens: number;
          completionTokens: number;
          model: string;
        }> {
          throw new Error('render failed');
        },
      },
      image: { async generate() { return { url: '', model: '' }; } },
    };
    await runCuratorTick(baseDeps({ render: throwingRender, tickLogRepo: repo }));
    const expected = createHash('sha256').update('').digest('hex');
    expect(logs[0].briefHash).toBe(expected);
  });

  test('memo content drops the briefHash (ADR 0016 E/7 — trimmed, non-sensitive)', async () => {
    const { ace } = makeAceMock();
    let memoSummary = '';
    const trackMemo: MemoWriter = {
      async write(_id, summary) {
        memoSummary = summary;
        return { sig: 'memo-sig-xyz' };
      },
    };
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ ace, memoWriter: trackMemo, tickLogRepo: repo }));
    // The trimmed memo no longer carries the brief hash; tick_log still records it
    // for the internal audit trail.
    expect(memoSummary).not.toContain(logs[0].briefHash);
    expect(memoSummary).not.toContain('brief:');
  });
});

describe('runCuratorTick — token branch (ADR 0014, the core bug fix)', () => {
  // The aggregator resolves the chat ticker to a Solana mint and emits
  // kind:'token'. The tick MUST route through fetchTokenSpotlights +
  // renderTokenStory (NOT the old hardcoded wallet path).

  test('enriches via the token spotlight source (fetchTokenSpotlights reached)', async () => {
    const { source, mints } = makeTokenSourceMock();
    await runCuratorTick(baseDeps({ tokenSource: source }));
    // getMintInfo is one of the three source methods fetchTokenSpotlights calls;
    // it records the mint, proving the token branch hit the shared source.
    expect(mints).toEqual([WALLET_A]);
  });

  test('renders a token-kind story (renderTokenStory, not renderStory)', async () => {
    const { repo: storyRepo, calls } = makeStoryRepo();
    await runCuratorTick(baseDeps({ storyRepo }));
    expect(calls).toHaveLength(1);
    const [identifier, kind, story] = calls[0];
    expect(identifier).toBe(WALLET_A);
    expect(kind).toBe('token');
    // renderTokenStory stamps kind:'token' + input=mint onto the story; the old
    // wallet renderStory would not.
    expect((story as { kind: string }).kind).toBe('token');
    expect((story as { input: string }).input).toBe(WALLET_A);
  });

  test('does NOT take the wallet path (wallet rpc untouched on a token pick)', async () => {
    let walletRpcCalls = 0;
    const trackingRpc: SpotlightRpc = {
      async getBalance() { walletRpcCalls += 1; return BigInt(0); },
      async getSignaturesForAddress() { walletRpcCalls += 1; return []; },
      async getTransaction() { walletRpcCalls += 1; return null; },
      async getTokenAccountsByOwner() { walletRpcCalls += 1; return { count: 0 }; },
      async getAssetsByOwner() { walletRpcCalls += 1; return { count: 0 }; },
    };
    const deps: CuratorDeps = { ...baseDeps(), rpc: trackingRpc };
    await runCuratorTick(deps);
    expect(walletRpcCalls).toBe(0);
  });

  test('persists pick_source_hit (the SERP headline) on the tick_log row', async () => {
    const { repo, logs } = makeTickLogRepo();
    await runCuratorTick(baseDeps({ tickLogRepo: repo }));
    expect(logs).toHaveLength(1);
    // makeChatMock emits sourceHitText = `${TICKER} is trending`.
    expect(logs[0].pickSourceHit).toBe(`${TICKER} is trending`);
  });

  test('memo content drops the source-hit headline but carries the ACE receipt (ADR 0016 E/7)', async () => {
    let memoSummary = '';
    const trackMemo: MemoWriter = {
      async write(_id, summary) {
        memoSummary = summary;
        return { sig: 'memo-sig-xyz' };
      },
    };
    await runCuratorTick(baseDeps({ memoWriter: trackMemo }));
    // Source-hit headline dropped from the on-chain memo text…
    expect(memoSummary).not.toContain(`${TICKER} is trending`);
    expect(memoSummary).not.toContain('src:');
    // …replaced by the trimmed render id + kind + identifier + service-provenance
    // receipt (every leg). The token render always emits an llm receipt.
    expect(memoSummary).toContain(`token ${WALLET_A}`);
    expect(memoSummary).toContain('ace:');
    expect(memoSummary).toContain('llm:');
  });

  test('Director is consulted for the token pick when a rationale is present', async () => {
    const { ace, calls } = makeAceMock();
    const { repo: storyRepo, calls: storyCalls } = makeStoryRepo();
    await runCuratorTick(baseDeps({ ace, storyRepo }));
    // Director invoked → plan tone steers the token story tone.
    expect(calls.length).toBeGreaterThan(0);
    const story = storyCalls[0][2] as { tone: string };
    expect(story.tone).toBe('Comedy');
  });

  test('receipt is COMPLETE across legs — video + audio receipts captured when the media rail ran (ADR 0016 E/6)', async () => {
    // Stub the x402 video/audio legs so the enrichment fires + collects.
    const video = {
      async generate() {
        return { taskId: 'vid-task-1', service: 'veo' };
      },
      async collect() {
        return 'https://media.example/clip.mp4';
      },
    };
    const audio = {
      async generate() {
        return { taskId: 'aud-task-1', service: 'fish' };
      },
      async collect() {
        return 'https://media.example/voice.mp3';
      },
    };
    const { repo, logs } = makeTickLogRepo();
    let memoSummary = '';
    const trackMemo: MemoWriter = {
      async write(_id, summary) {
        memoSummary = summary;
        return { sig: 'memo-sig-xyz' };
      },
    };
    await runCuratorTick({
      ...baseDeps({ tickLogRepo: repo, memoWriter: trackMemo }),
      video,
      audio,
    });
    // tick_log carries every leg…
    const kinds = logs[0].aceReceipts.map((r) => r.kind);
    expect(kinds).toContain('llm');
    expect(kinds).toContain('image');
    expect(kinds).toContain('video');
    expect(kinds).toContain('audio');
    // …and the trimmed memo carries the COMPLETE service-provenance receipt.
    expect(memoSummary).toContain('video:veo:vid-task-1');
    expect(memoSummary).toContain('audio:fish:aud-task-1');
  });
});

// ── Dormancy / treasury exhaustion (ADR 0015 D7) ──────────────────────────────

// In-memory AgentStateRepo so we can observe setDormant/clearDormant.
function makeAgentState(initialDormant = false): {
  repo: AgentStateRepo;
  state: { dormant: boolean; reason: string | null };
} {
  const state = { dormant: initialDormant, reason: null as string | null };
  return {
    state,
    repo: {
      async isDormant() {
        return state.dormant;
      },
      async setDormant(reason) {
        state.dormant = true;
        state.reason = reason;
      },
      async clearDormant() {
        state.dormant = false;
        state.reason = null;
      },
    },
  };
}

// Render whose chat throws a FundsExhaustedError (the x402 USDC rail ran dry).
function makeFundsExhaustedRender(): { chat: ChatClient; image: ImageClient } {
  return {
    chat: {
      async complete<T>(): Promise<{
        data: T;
        promptTokens: number;
        completionTokens: number;
        model: string;
      }> {
        throw new FundsExhaustedError(
          'x402 USDC transfer failed (insufficient funds): {"InstructionError":[2,{"Custom":1}]} (sig abc)',
        );
      },
    },
    image: { async generate() { return { url: '', model: '' }; } },
  };
}

describe('runCuratorTick — dormancy (ADR 0016 D/F)', () => {
  test('dormant agent → silent no-op (no tick_log, no webhook)', async () => {
    const { repo: agentState } = makeAgentState(true);
    const { repo: tickRepo, logs } = makeTickLogRepo();
    const webhookCalls = makeWebhookCalls();
    const result = await runCuratorTick({
      ...baseDeps({ tickLogRepo: tickRepo, webhookCalls }),
      agentState,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('dormant');
      // Reason is the OPAQUE code (ADR 0016 F) — never balance/floor text.
      expect(result.reason).toBe('dormant');
    }
    expect(logs).toHaveLength(0);
    expect(webhookCalls).toHaveLength(0);
  });

  test('funds-exhaustion during render flips dormant: no error row, no webhook, opaque reason', async () => {
    const { repo: agentState, state } = makeAgentState(false);
    const { repo: tickRepo, logs } = makeTickLogRepo();
    const webhookCalls = makeWebhookCalls();
    const result = await runCuratorTick({
      ...baseDeps({ render: makeFundsExhaustedRender(), tickLogRepo: tickRepo, webhookCalls }),
      agentState,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.step).toBe('dormant');
    expect(state.dormant).toBe(true);
    // The persisted dormancy reason is the OPAQUE code (ADR 0016 F) — never the
    // underlying balance/floor or error text.
    expect(state.reason).toBe('dormant');
    expect(logs).toHaveLength(0); // dormancy writes NO error tick_log row
    expect(webhookCalls).toHaveLength(0);
  });

  test('non-funds render error takes the normal error path, NOT dormancy', async () => {
    const { repo: agentState, state } = makeAgentState(false);
    const { repo: tickRepo, logs } = makeTickLogRepo();
    const throwingRender = {
      chat: {
        async complete<T>(): Promise<{
          data: T;
          promptTokens: number;
          completionTokens: number;
          model: string;
        }> {
          throw new Error('render failed');
        },
      },
      image: { async generate() { return { url: '', model: '' }; } },
    };
    const result = await runCuratorTick({
      ...baseDeps({ render: throwingRender, tickLogRepo: tickRepo }),
      agentState,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.step).not.toBe('dormant');
    expect(state.dormant).toBe(false); // NOT flipped dormant
    expect(logs).toHaveLength(1); // normal error row IS written
    expect(logs[0].error).toBe('render failed');
  });
});
