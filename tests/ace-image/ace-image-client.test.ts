import { describe, expect, test } from 'bun:test';
import {
  type AceImageGenerate,
  buildProviderChainImageClient,
} from '@/lib/ace-image-client';

const PLACEHOLDER = 'https://chainbard.test/mark.svg';
const MODELS = { seedream: 'doubao-seedream-4-0-250828', 'nano-banana': 'nano-banana' };

type GenCall = Record<string, unknown>;

/** Mock ace.images.generate: per-call resolver receives the opts, returns a task. */
function makeAce(impl: (opts: GenCall) => Promise<unknown>): {
  ace: AceImageGenerate;
  calls: GenCall[];
} {
  const calls: GenCall[] = [];
  return {
    calls,
    ace: {
      images: {
        async generate(opts) {
          calls.push(opts);
          return impl(opts);
        },
      },
    },
  };
}

const baseOpts = (providers: string[]) => ({
  providers,
  models: MODELS,
  size: '1344x768',
  timeoutMs: 50,
  placeholderUrl: PLACEHOLDER,
});

describe('buildProviderChainImageClient', () => {
  test('primary success → returns extracted url + provider as model', async () => {
    const { ace, calls } = makeAce(async () => ({ data: { image_url: 'https://x/nb.png' } }));
    const client = buildProviderChainImageClient(ace, baseOpts(['nano-banana', 'seedream']));
    const result = await client.generate('an infographic');
    expect(result).toEqual({ url: 'https://x/nb.png', model: 'nano-banana' });
    // Primary succeeded → fallback never called.
    expect(calls).toHaveLength(1);
  });

  test('nano-banana opts: model, no explicit size, no wait', async () => {
    const { ace, calls } = makeAce(async () => ({ data: { image_url: 'https://x/nb.png' } }));
    await buildProviderChainImageClient(ace, baseOpts(['nano-banana'])).generate('p');
    expect(calls[0]).toEqual({ prompt: 'p', provider: 'nano-banana', model: 'nano-banana' });
    expect('size' in calls[0]).toBe(false);
    expect('wait' in calls[0]).toBe(false);
  });

  test('seedream opts: explicit landscape size, no wait', async () => {
    const { ace, calls } = makeAce(async () => ({ data: { image_url: 'https://x/sd.png' } }));
    await buildProviderChainImageClient(ace, baseOpts(['seedream'])).generate('p');
    expect(calls[0]).toEqual({
      prompt: 'p',
      provider: 'seedream',
      model: 'doubao-seedream-4-0-250828',
      size: '1344x768',
    });
  });

  test('midjourney opts: --ar aspect, mode/quality, split_images, wait', async () => {
    const { ace, calls } = makeAce(async () => ({
      response: { data: [{ image_url: 'https://x/mj.png' }] },
    }));
    const client = buildProviderChainImageClient(ace, {
      ...baseOpts(['midjourney']),
      midjourney: { mode: 'fast', quality: '.25', aspect: '16:9' },
    });
    const result = await client.generate('p');
    expect(calls[0]).toEqual({
      prompt: 'p --ar 16:9',
      provider: 'midjourney',
      mode: 'fast',
      quality: '.25',
      split_images: true,
      wait: true,
    });
    expect(result.url).toBe('https://x/mj.png');
  });

  test('primary throws → falls back to next provider', async () => {
    const { ace, calls } = makeAce(async (opts) => {
      if (opts.provider === 'nano-banana') throw new Error('boom');
      return { data: { image_url: 'https://x/sd.png' } };
    });
    const client = buildProviderChainImageClient(ace, baseOpts(['nano-banana', 'seedream']));
    const result = await client.generate('p');
    expect(result).toEqual({ url: 'https://x/sd.png', model: 'seedream' });
    expect(calls.map((c) => c.provider)).toEqual(['nano-banana', 'seedream']);
  });

  test('primary timeout → falls back to next provider', async () => {
    const { ace } = makeAce(async (opts) => {
      if (opts.provider === 'nano-banana') {
        // Outlast the 50ms timeout budget.
        await new Promise((r) => setTimeout(r, 200));
        return { data: { image_url: 'https://x/slow.png' } };
      }
      return { data: { image_url: 'https://x/sd.png' } };
    });
    const client = buildProviderChainImageClient(ace, baseOpts(['nano-banana', 'seedream']));
    const result = await client.generate('p');
    expect(result).toEqual({ url: 'https://x/sd.png', model: 'seedream' });
  });

  test('all providers fail → deterministic placeholder', async () => {
    const { ace } = makeAce(async () => {
      throw new Error('down');
    });
    const client = buildProviderChainImageClient(ace, baseOpts(['nano-banana', 'seedream']));
    const result = await client.generate('p');
    expect(result).toEqual({ url: PLACEHOLDER, model: 'placeholder' });
  });

  test('provider returns no parseable url → tries next, then placeholder', async () => {
    const { ace, calls } = makeAce(async () => ({ response: { status: 'failed' } }));
    const client = buildProviderChainImageClient(ace, baseOpts(['nano-banana', 'seedream']));
    const result = await client.generate('p');
    expect(result).toEqual({ url: PLACEHOLDER, model: 'placeholder' });
    // No url from either → both attempted before placeholder.
    expect(calls.map((c) => c.provider)).toEqual(['nano-banana', 'seedream']);
  });

  test('extractImageUrl wiring: unwraps polled response.data array', async () => {
    const { ace } = makeAce(async () => ({
      response: { status: 'succeeded', data: [{ raw_image_url: 'https://x/raw.png' }] },
    }));
    const client = buildProviderChainImageClient(ace, baseOpts(['seedream']));
    const result = await client.generate('p');
    expect(result.url).toBe('https://x/raw.png');
  });
});
