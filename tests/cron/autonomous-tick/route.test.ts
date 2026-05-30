import { beforeAll, describe, expect, mock, spyOn, test } from 'bun:test';

// ── Mock all route dependencies before route module loads ──────────────────────

let runCuratorTickImpl: () => Promise<unknown> = async () => ({
  ok: true,
  tickLogId: 'tick-1',
  storyUrl: 'https://chainbard.vercel.app/abc',
});

mock.module('@/autonomous-curator', () => ({
  runCuratorTick: () => runCuratorTickImpl(),
}));

mock.module('@/cron-adapters', () => ({
  createCronAdaptersFromEnv: async () => ({
    deps: {},
    storyBaseUrl: 'https://chainbard.vercel.app',
  }),
}));

mock.module('@/modules/sap-discovery', () => ({
  discoverSapAgents: async () => [],
  summarizeDiscovery: () => '0 agents',
}));

mock.module('@/webhook-poster', () => ({
  makeFetchHttpClient: () => ({}),
  makeInMemoryPostedStore: () => ({}),
}));

// ── Load route handler after env + mocks are in place ─────────────────────────

let GET: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.WEBHOOK_URL = 'https://discord.test/webhook';
  process.env.DATABASE_URL = 'postgres://test';
  process.env.ACE_API_KEY = 'test-ace-key';

  const { GET: handler } = await import('@/app/api/cron/autonomous-tick/route');
  GET = handler;
});

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/autonomous-tick', {
    headers: { Authorization: 'Bearer test-cron-secret' },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('autonomous-tick route — error envelope', () => {
  test('happy path returns ONLY a minimal { tickLogId, storyUrl } with 200', async () => {
    // ADR 0016 F: the public route returns a minimal body, never the full
    // CuratorResult (no rationale / receipts / sigs).
    runCuratorTickImpl = async () => ({
      ok: true,
      tickLogId: 'tick-1',
      storyUrl: 'https://chainbard.vercel.app/abc',
      // These MUST NOT leak into the response body.
      pick: { kind: 'token', identifier: 'abc', rationale: 'secret rationale' },
      receipts: [{ kind: 'llm', model: 'gpt-4o', promptTokens: 1, completionTokens: 1 }],
      memoSig: 'MemoSecretSig',
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ tickLogId: 'tick-1', storyUrl: 'https://chainbard.vercel.app/abc' });
    expect(body.ok).toBeUndefined();
    expect(body.pick).toBeUndefined();
    expect(body.receipts).toBeUndefined();
    expect(body.memoSig).toBeUndefined();
  });

  test('dormant result returns ONLY { dormant: true } with 200', async () => {
    runCuratorTickImpl = async () => ({
      ok: false,
      step: 'dormant',
      reason: 'dormant',
      tickLogId: 'tick-dormant',
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ dormant: true });
  });

  test('runCuratorTick throws StepError → 500 with minimal { ok:false, step } (no reason leak)', async () => {
    const err = Object.assign(new Error('No valid account found'), { step: 'spotlight' });
    runCuratorTickImpl = async () => {
      throw err;
    };
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    // ADR 0016 F: only the step surfaces — the raw reason (provider/cost text) never leaks.
    expect(body).toEqual({ ok: false, step: 'spotlight' });
    expect(body.reason).toBeUndefined();
  });

  test('runCuratorTick throws bare Error → 500 step:"unknown" (no reason in body), logs {step,reason,stack}', async () => {
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    runCuratorTickImpl = async () => {
      throw new Error('boom');
    };
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: false, step: 'unknown' });
    expect(body.reason).toBeUndefined();
    // The full reason + stack still go to the server log (operator-only), just not the body.
    expect(errSpy.mock.calls.length).toBeGreaterThan(0);
    const logPayload = errSpy.mock.calls[0][1] as {
      step: string;
      reason: string;
      stack: string | undefined;
    };
    expect(logPayload.step).toBe('unknown');
    expect(logPayload.reason).toBe('boom');
    expect(typeof logPayload.stack).toBe('string');
    errSpy.mockRestore();
  });
});
