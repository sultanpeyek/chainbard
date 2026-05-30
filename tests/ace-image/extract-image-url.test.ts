import { describe, expect, test } from 'bun:test';
import { extractImageUrl } from '@/lib/ace-image';

describe('extractImageUrl', () => {
  test('flux inline data object', () => {
    expect(extractImageUrl({ data: { image_url: 'https://x/flux.png' } })).toBe(
      'https://x/flux.png',
    );
  });

  test('top-level image_url', () => {
    expect(extractImageUrl({ image_url: 'https://x/top.png' })).toBe('https://x/top.png');
  });

  test('image_urls array', () => {
    expect(extractImageUrl({ data: { image_urls: ['https://x/a.png', 'https://x/b.png'] } })).toBe(
      'https://x/a.png',
    );
  });

  // Midjourney goes through wait:true polling; SDK returns the whole poll state
  // with the payload nested under `response`, and `data` as a 2x2-grid array.
  test('midjourney polled state — response wrapper + array data', () => {
    expect(
      extractImageUrl({
        response: {
          status: 'succeeded',
          data: [{ image_url: 'https://x/mj-grid.png' }],
        },
      }),
    ).toBe('https://x/mj-grid.png');
  });

  test('response wrapper, single image_url', () => {
    expect(extractImageUrl({ response: { status: 'succeeded', image_url: 'https://x/r.png' } })).toBe(
      'https://x/r.png',
    );
  });

  test('response wrapper, image_urls array', () => {
    expect(
      extractImageUrl({ response: { image_urls: ['https://x/r0.png'] } }),
    ).toBe('https://x/r0.png');
  });

  test('raw_image_url fallback inside array element', () => {
    expect(
      extractImageUrl({ response: { data: [{ raw_image_url: 'https://x/raw.png' }] } }),
    ).toBe('https://x/raw.png');
  });

  test('returns undefined when no url present', () => {
    expect(extractImageUrl({ response: { status: 'failed' } })).toBeUndefined();
  });
});
