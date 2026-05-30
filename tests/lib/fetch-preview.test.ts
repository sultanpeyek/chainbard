import { describe, expect, test } from 'bun:test';
import { fetchPreview } from '@/lib/fetch-preview';
import type { PreviewResult } from '@/modules/preview-facts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeFetch(response: Response | (() => never)) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const doFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (typeof response === 'function') return response();
    return response;
  }) as unknown as typeof fetch;
  return { doFetch, calls };
}

describe('fetchPreview', () => {
  test('returns the parsed PreviewResult on 200', async () => {
    const body: PreviewResult = { kind: 'wallet', facts: [{ label: 'SOL balance', value: '12' }] };
    const { doFetch, calls } = makeFetch(jsonResponse(200, body));

    const outcome = await fetchPreview('  SoMeWallet  ', doFetch);

    expect(outcome).toEqual({ ok: true, result: body });
    // input is trimmed before POST
    expect(JSON.parse((calls[0].init?.body as string) ?? '{}')).toEqual({ input: 'SoMeWallet' });
    expect(calls[0].url).toBe('/api/preview');
  });

  test('rejects empty input without calling fetch', async () => {
    const { doFetch, calls } = makeFetch(jsonResponse(200, {}));
    const outcome = await fetchPreview('   ', doFetch);
    expect(outcome.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test('maps a 400 to a "not a Solana identifier" reason', async () => {
    const { doFetch } = makeFetch(jsonResponse(400, { error: 'input required' }));
    const outcome = await fetchPreview('garbage', doFetch);
    expect(outcome).toEqual({ ok: false, reason: "That doesn't look like a Solana identifier." });
  });

  test('maps a 502 to a generic unavailable reason', async () => {
    const { doFetch } = makeFetch(jsonResponse(502, { error: 'preview unavailable' }));
    const outcome = await fetchPreview('SoMeWallet', doFetch);
    expect(outcome).toEqual({ ok: false, reason: 'Preview unavailable right now.' });
  });

  test('maps a thrown fetch (offline) to a network-error reason', async () => {
    const { doFetch } = makeFetch(() => {
      throw new Error('Failed to fetch');
    });
    const outcome = await fetchPreview('SoMeWallet', doFetch);
    expect(outcome).toEqual({ ok: false, reason: 'Network error — check your connection.' });
  });

  test('treats a malformed 200 body as unavailable', async () => {
    const { doFetch } = makeFetch(jsonResponse(200, { not: 'a preview' }));
    const outcome = await fetchPreview('SoMeWallet', doFetch);
    expect(outcome).toEqual({ ok: false, reason: 'Preview unavailable right now.' });
  });
});
