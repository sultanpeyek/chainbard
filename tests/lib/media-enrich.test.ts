import { describe, expect, test } from 'bun:test';
import type { AudioClient } from '@/lib/ace-audio-client';
import type { MediaResult, VideoClient } from '@/lib/ace-video-client';
import { enrichStoryMedia, type MediaEnrichableStory } from '@/lib/media-enrich';

// ── Fakes ──────────────────────────────────────────────────────────────────────

function makeVideo(opts: {
  handle?: MediaResult | null;
  url?: string | null;
  capture?: { prompts: string[] };
  throwOn?: 'generate' | 'collect';
}): VideoClient {
  return {
    async generate(prompt) {
      opts.capture?.prompts.push(prompt);
      if (opts.throwOn === 'generate') throw new Error('video gen boom');
      // 'handle' present (even null) wins; absent → the default handle.
      return 'handle' in opts ? opts.handle! : { taskId: 'vid-task', service: 'veo' };
    },
    async collect() {
      if (opts.throwOn === 'collect') throw new Error('video collect boom');
      return 'url' in opts ? opts.url! : 'https://cdn.example/video.mp4';
    },
  };
}

function makeAudio(opts: {
  handle?: MediaResult | null;
  url?: string | null;
  capture?: { narrations: string[] };
}): AudioClient {
  return {
    async generate(narration) {
      opts.capture?.narrations.push(narration);
      return opts.handle ?? { taskId: 'aud-task', service: 'fish' };
    },
    async collect() {
      return opts.url ?? 'https://cdn.example/audio.mp3';
    },
  };
}

function baseStory(): MediaEnrichableStory {
  return { subtitle: 'A wallet tale.', sections: [{ body: 'Opening section body.' }] };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('enrichStoryMedia — all kinds (ADR 0016 D)', () => {
  test('stamps video + audio urls + providers onto the story and returns receipts', async () => {
    const story = baseStory();
    const receipts = await enrichStoryMedia(story, 'key-1', {
      video: makeVideo({}),
      audio: makeAudio({}),
    });
    expect(story.videoUrl).toBe('https://cdn.example/video.mp4');
    expect(story.videoProvider).toBe('veo');
    expect(story.audioUrl).toBe('https://cdn.example/audio.mp3');
    expect(story.audioProvider).toBe('fish');

    const video = receipts.find((r) => r.kind === 'video');
    const audio = receipts.find((r) => r.kind === 'audio');
    expect(video?.kind).toBe('video');
    expect(audio?.kind).toBe('audio');
    if (video?.kind === 'video') {
      expect(video.provider).toBe('veo');
      expect(video.taskId).toBe('vid-task');
      expect(video.url).toBe('https://cdn.example/video.mp4');
    }
  });

  test('video prompt is the abstract data-motion prompt (no living beings)', async () => {
    const capture = { prompts: [] as string[] };
    await enrichStoryMedia(baseStory(), 'key-2', { video: makeVideo({ capture }) });
    expect(capture.prompts).toHaveLength(1);
    expect(capture.prompts[0]).toContain('data-motion');
    expect(capture.prompts[0]).toContain('no living beings');
  });

  test('audio narration is the subtitle + first section body (TTS spoken-word)', async () => {
    const capture = { narrations: [] as string[] };
    await enrichStoryMedia(baseStory(), 'key-3', { audio: makeAudio({ capture }) });
    expect(capture.narrations).toHaveLength(1);
    expect(capture.narrations[0]).toBe('A wallet tale. Opening section body.');
  });

  test('mirrors collected media to Blob with kind-prefixed keys', async () => {
    const keys: string[] = [];
    const story = baseStory();
    await enrichStoryMedia(story, 'INPUTHASH', {
      video: makeVideo({}),
      audio: makeAudio({}),
      blobStore: async (_url, key) => {
        keys.push(key);
        return `https://blob.example/${key}`;
      },
    });
    expect(keys).toEqual(['video/INPUTHASH.mp4', 'audio/INPUTHASH.mp3']);
    expect(story.videoUrl).toBe('https://blob.example/video/INPUTHASH.mp4');
    expect(story.audioUrl).toBe('https://blob.example/audio/INPUTHASH.mp3');
  });

  test('fail-soft: a thrown generate never throws out and leaves the leg absent', async () => {
    const story = baseStory();
    const receipts = await enrichStoryMedia(story, 'key-4', {
      video: makeVideo({ throwOn: 'generate' }),
      audio: makeAudio({}),
    });
    // video failed → no videoUrl, no video receipt; audio still attached
    expect(story.videoUrl).toBeUndefined();
    expect(receipts.some((r) => r.kind === 'video')).toBe(false);
    expect(story.audioUrl).toBe('https://cdn.example/audio.mp3');
  });

  test('a null handle skips the leg (no receipt, no url)', async () => {
    const story = baseStory();
    const receipts = await enrichStoryMedia(story, 'key-5', {
      video: makeVideo({ handle: null }),
    });
    expect(story.videoUrl).toBeUndefined();
    expect(receipts).toHaveLength(0);
  });

  test('collect returning null pushes a receipt (url null) but stamps no url', async () => {
    const story = baseStory();
    const receipts = await enrichStoryMedia(story, 'key-6', {
      video: makeVideo({ url: null }),
    });
    expect(story.videoUrl).toBeUndefined();
    const video = receipts.find((r) => r.kind === 'video');
    expect(video?.kind).toBe('video');
    if (video?.kind === 'video') expect(video.url).toBeNull();
  });

  test('no clients → no-op, empty receipts', async () => {
    const story = baseStory();
    const receipts = await enrichStoryMedia(story, 'key-7', {});
    expect(receipts).toHaveLength(0);
    expect(story.videoUrl).toBeUndefined();
    expect(story.audioUrl).toBeUndefined();
  });
});
