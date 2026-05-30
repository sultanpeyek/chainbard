// ── Satisfy app-wide env validation (route transitively loads '@/env') ──────────
process.env.ACE_API_KEY ??= 'test';
process.env.AGENT_SECRET_KEY_BASE58 ??= 'test';
process.env.CRON_SECRET ??= 'test';
process.env.DATABASE_URL ??= 'https://test.invalid/db';
process.env.DEMO_SECRET ??= 'test';

import { describe, expect, test } from 'bun:test';
import type { AudioClient } from '@/lib/ace-audio-client';
import type { VideoClient } from '@/lib/ace-video-client';
import type { MediaPatch, StoryRepo, WalletStoryRow } from '@/story-repo';

const { attachMediaForInput, POST } = await import('@/app/api/workflow/media-attach/route');

// ── Stub clients (injected — no @solana/web3.js / bs58 / Ace SDK touched) ────────

function stubClients(opts: { video?: boolean; audio?: boolean } = { video: true, audio: true }): {
  video?: VideoClient;
  audio?: AudioClient;
  blobStore: (url: string, key: string) => Promise<string>;
} {
  const video: VideoClient = {
    async generate() {
      return { taskId: 'vid', service: 'veo' };
    },
    async collect() {
      return 'https://cdn/v.mp4';
    },
  };
  const audio: AudioClient = {
    async generate() {
      return { taskId: 'aud', service: 'fish' };
    },
    async collect() {
      return 'https://cdn/a.mp3';
    },
  };
  return {
    video: opts.video ? video : undefined,
    audio: opts.audio ? audio : undefined,
    blobStore: async (url: string) => url,
  };
}

// ── Fake repo ────────────────────────────────────────────────────────────────────

function makeRepo(row: WalletStoryRow | null): {
  repo: StoryRepo;
  patches: Array<{ inputHash: string; patch: MediaPatch }>;
} {
  const patches: Array<{ inputHash: string; patch: MediaPatch }> = [];
  const repo: StoryRepo = {
    async getByInputHash() {
      return row;
    },
    async listRecent() {
      return [];
    },
    async upsert() {},
    async attachReceipts() {},
    async patchMedia(inputHash, patch) {
      patches.push({ inputHash, patch });
    },
  };
  return { repo, patches };
}

const INPUT = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

function makeRow(): WalletStoryRow {
  return {
    inputHash: 'hash',
    input: INPUT,
    story: {
      kind: 'wallet',
      input: INPUT,
      tone: 'Epic',
      title: 't',
      subtitle: 'A wallet tale.',
      stats: [],
      sections: [{ title: '1', body: 'first body' }],
      verdict: 'v',
      heroImagePrompt: 'p',
      heroImageUrl: 'https://images.example/hero.jpg',
    } as unknown as WalletStoryRow['story'],
    provenance: 'buyer',
    createdAt: new Date(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('media-attach route — attachMediaForInput (ADR 0016 D)', () => {
  test('generates media and patches the row with both legs', async () => {
    const { repo, patches } = makeRepo(makeRow());
    await attachMediaForInput(INPUT, repo, async () => stubClients());
    expect(patches).toHaveLength(1);
    expect(patches[0].patch.videoUrl).toBe('https://cdn/v.mp4');
    expect(patches[0].patch.videoProvider).toBe('veo');
    expect(patches[0].patch.audioUrl).toBe('https://cdn/a.mp3');
    expect(patches[0].patch.audioProvider).toBe('fish');
  });

  test('video-only run patches only the video leg', async () => {
    const { repo, patches } = makeRepo(makeRow());
    await attachMediaForInput(INPUT, repo, async () => stubClients({ video: true, audio: false }));
    expect(patches[0].patch.videoUrl).toBe('https://cdn/v.mp4');
    expect(patches[0].patch.audioUrl).toBeUndefined();
  });

  test('a missing story row is a clean no-op (no patch, no client build)', async () => {
    const { repo, patches } = makeRepo(null);
    let built = false;
    await attachMediaForInput(INPUT, repo, async () => {
      built = true;
      return stubClients();
    });
    expect(patches).toHaveLength(0);
    expect(built).toBe(false);
  });

  test('route exports a POST handler (serve wiring is well-formed)', () => {
    expect(typeof POST).toBe('function');
  });
});
