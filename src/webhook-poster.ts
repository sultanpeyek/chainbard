// ── Boundary interfaces ───────────────────────────────────────────────────────

/** Tracks which story URLs have already been posted (idempotency store). */
export interface PostedUrlStore {
  hasBeenPosted(storyUrl: string): Promise<boolean>;
  markPosted(storyUrl: string): Promise<void>;
}

/** Thin HTTP client boundary — mock in tests, use fetch in production. */
export interface WebhookHttpClient {
  post(url: string, body: unknown): Promise<{ status: number }>;
}

export interface WebhookPosterDeps {
  webhookUrl: string;
  store: PostedUrlStore;
  http: WebhookHttpClient;
}

// ── Payload builders ──────────────────────────────────────────────────────────

function isDiscordUrl(url: string): boolean {
  return url.includes('discord.com/api/webhooks') || url.includes('discordapp.com/api/webhooks');
}

function buildPayload(
  storyUrl: string,
  kind: string,
  headline: string,
  webhookUrl: string,
): unknown {
  if (isDiscordUrl(webhookUrl)) {
    return { content: `New ${kind} story: **${headline}**\n${storyUrl}` };
  }
  // Generic / Telegram-compatible payload
  return { text: `New ${kind} story: ${headline}\n${storyUrl}` };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Posts a story URL to the operator-configured webhook.
 * Safe under at-least-once delivery: re-calls with the same storyUrl are no-ops.
 */
export async function postUrl(
  storyUrl: string,
  kind: string,
  headline: string,
  deps: WebhookPosterDeps,
): Promise<{ ok: boolean }> {
  // Idempotency gate — replay returns ok without re-posting
  if (await deps.store.hasBeenPosted(storyUrl)) {
    return { ok: true };
  }

  const payload = buildPayload(storyUrl, kind, headline, deps.webhookUrl);
  const { status } = await deps.http.post(deps.webhookUrl, payload);

  if (status < 200 || status >= 300) {
    return { ok: false };
  }

  await deps.store.markPosted(storyUrl);
  return { ok: true };
}

// ── In-memory store (tests + local dev) ──────────────────────────────────────

export function makeInMemoryPostedStore(): PostedUrlStore {
  const posted = new Set<string>();
  return {
    async hasBeenPosted(url) {
      return posted.has(url);
    },
    async markPosted(url) {
      posted.add(url);
    },
  };
}

// ── Fetch-backed HTTP client (production) ─────────────────────────────────────

export function makeFetchHttpClient(): WebhookHttpClient {
  return {
    async post(url, body) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status };
    },
  };
}
