import { describe, expect, test } from 'bun:test';
import {
  postUrl,
  makeInMemoryPostedStore,
  type PostedUrlStore,
  type WebhookHttpClient,
  type WebhookPosterDeps,
} from '@/webhook-poster';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DISCORD_URL = 'https://discord.com/api/webhooks/123/abc';
const TELEGRAM_URL = 'https://api.telegram.org/bot123/sendMessage';
const STORY_URL = 'https://chainbard.vercel.app/B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeHttpClient(
  status: number,
  capture?: Array<{ url: string; body: unknown }>,
): WebhookHttpClient {
  return {
    async post(url, body) {
      capture?.push({ url, body });
      return { status };
    },
  };
}

function makeDeps(
  webhookUrl: string,
  status = 204,
  store?: PostedUrlStore,
  capture?: Array<{ url: string; body: unknown }>,
): WebhookPosterDeps {
  return {
    webhookUrl,
    store: store ?? makeInMemoryPostedStore(),
    http: makeHttpClient(status, capture),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('postUrl — successful post', () => {
  test('returns { ok: true } on 2xx response', async () => {
    const result = await postUrl(STORY_URL, 'wallet', 'Epic Story', makeDeps(DISCORD_URL, 200));
    expect(result.ok).toBe(true);
  });

  test('marks the storyUrl as posted after success', async () => {
    const store = makeInMemoryPostedStore();
    await postUrl(STORY_URL, 'wallet', 'Epic Story', makeDeps(DISCORD_URL, 200, store));
    expect(await store.hasBeenPosted(STORY_URL)).toBe(true);
  });

  test('sends POST to the configured webhook URL', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    await postUrl(STORY_URL, 'wallet', 'Epic Story', makeDeps(DISCORD_URL, 200, undefined, calls));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DISCORD_URL);
  });
});

describe('postUrl — Discord payload', () => {
  test('sends a content field for Discord webhook URLs', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    await postUrl(STORY_URL, 'wallet', 'The Architect', makeDeps(DISCORD_URL, 200, undefined, calls));
    const body = calls[0].body as Record<string, string>;
    expect(typeof body.content).toBe('string');
    expect(body.content).toContain('The Architect');
    expect(body.content).toContain(STORY_URL);
  });

  test('payload includes the story kind', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    await postUrl(STORY_URL, 'wallet', 'Headline', makeDeps(DISCORD_URL, 200, undefined, calls));
    const body = calls[0].body as Record<string, string>;
    expect(body.content).toContain('wallet');
  });
});

describe('postUrl — non-Discord payload', () => {
  test('sends a text field for non-Discord webhook URLs', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    await postUrl(STORY_URL, 'wallet', 'Telegram Story', makeDeps(TELEGRAM_URL, 200, undefined, calls));
    const body = calls[0].body as Record<string, string>;
    expect(typeof body.text).toBe('string');
    expect(body.text).toContain('Telegram Story');
    expect(body.text).toContain(STORY_URL);
  });
});

describe('postUrl — failure', () => {
  test('returns { ok: false } on 4xx response', async () => {
    const result = await postUrl(STORY_URL, 'wallet', 'Headline', makeDeps(DISCORD_URL, 400));
    expect(result.ok).toBe(false);
  });

  test('returns { ok: false } on 5xx response', async () => {
    const result = await postUrl(STORY_URL, 'wallet', 'Headline', makeDeps(DISCORD_URL, 500));
    expect(result.ok).toBe(false);
  });

  test('does not mark URL as posted on failure', async () => {
    const store = makeInMemoryPostedStore();
    await postUrl(STORY_URL, 'wallet', 'Headline', makeDeps(DISCORD_URL, 500, store));
    expect(await store.hasBeenPosted(STORY_URL)).toBe(false);
  });
});

describe('postUrl — idempotency (at-least-once delivery)', () => {
  test('second call with same storyUrl returns ok without re-posting', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const store = makeInMemoryPostedStore();
    const deps = makeDeps(DISCORD_URL, 200, store, calls);

    await postUrl(STORY_URL, 'wallet', 'Story', deps);
    await postUrl(STORY_URL, 'wallet', 'Story', deps); // replay

    // HTTP post called exactly once despite two invocations
    expect(calls).toHaveLength(1);
  });

  test('replay still returns { ok: true }', async () => {
    const store = makeInMemoryPostedStore();
    const deps = makeDeps(DISCORD_URL, 200, store);

    await postUrl(STORY_URL, 'wallet', 'Story', deps);
    const result = await postUrl(STORY_URL, 'wallet', 'Story', deps);

    expect(result.ok).toBe(true);
  });

  test('different storyUrls are each posted independently', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const store = makeInMemoryPostedStore();
    const deps = makeDeps(DISCORD_URL, 200, store, calls);

    const url2 = `${STORY_URL}_v2`;
    await postUrl(STORY_URL, 'wallet', 'Story A', deps);
    await postUrl(url2, 'wallet', 'Story B', deps);

    expect(calls).toHaveLength(2);
  });
});

describe('makeInMemoryPostedStore', () => {
  test('returns false for unseen URL', async () => {
    const store = makeInMemoryPostedStore();
    expect(await store.hasBeenPosted('https://example.com/new')).toBe(false);
  });

  test('returns true after markPosted', async () => {
    const store = makeInMemoryPostedStore();
    await store.markPosted('https://example.com/seen');
    expect(await store.hasBeenPosted('https://example.com/seen')).toBe(true);
  });
});
