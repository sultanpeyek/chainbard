import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { AceChatJsonError } from '@/lib/ace-chat-json';
import {
  type AceLike,
  createAceAggregatorChatClient,
  createAceAggregatorSerpClient,
  createAceRenderChatClient,
  createAceRendererSerpClient,
} from '@/cron-adapters';

function makeAce(overrides: Partial<AceLike> = {}): AceLike {
  return {
    openai: {
      chat: {
        completions: {
          async create() {
            return { choices: [{ message: { content: '{}' } }] };
          },
        },
      },
      images: {
        async generate() {
          return { data: [{ url: 'https://images.example/x.png' }] };
        },
      },
    },
    search: {
      async google() {
        return { organic: [] };
      },
    },
    ...overrides,
  } as AceLike;
}

describe('createAceAggregatorSerpClient', () => {
  test('maps Ace organic results into SerpHit[]', async () => {
    const ace = makeAce({
      search: {
        async google() {
          return {
            organic: [
              { title: 'Solana viral', snippet: 'big wallet', link: 'https://a' },
              { title: 't2', snippet: 's2', link: 'https://b' },
            ],
          };
        },
      },
    });
    const serp = createAceAggregatorSerpClient(ace);
    const hits = await serp.search('viral wallets');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({ title: 'Solana viral', snippet: 'big wallet', url: 'https://a' });
  });

  test('throws when ace.search.google absent', async () => {
    const ace = makeAce({ search: undefined });
    const serp = createAceAggregatorSerpClient(ace);
    await expect(serp.search('x')).rejects.toThrow(/search\.google/);
  });
});

describe('createAceRendererSerpClient', () => {
  test('returns { snippets } stripped of empties', async () => {
    const ace = makeAce({
      search: {
        async google() {
          return {
            organic: [
              { snippet: 'one' },
              { snippet: '' },
              { snippet: 'two' },
            ],
          };
        },
      },
    });
    const serp = createAceRendererSerpClient(ace);
    const out = await serp.search('q');
    expect(out.snippets).toEqual(['one', 'two']);
  });
});

describe('createAceAggregatorChatClient', () => {
  test('parses JSON content against schema', async () => {
    const ace = makeAce({
      openai: {
        chat: {
          completions: {
            async create() {
              return {
                choices: [{ message: { content: JSON.stringify({ n: 42 }) } }],
              };
            },
          },
        },
        images: {} as never,
      },
    });
    const chat = createAceAggregatorChatClient(ace);
    const schema = z.object({ n: z.number() });
    const out = await chat.complete({ system: 's', user: 'u', schema });
    expect(out.data.n).toBe(42);
  });

  test('empty content → AceChatJsonError after wrapper retry', async () => {
    let calls = 0;
    const ace = makeAce({
      openai: {
        chat: {
          completions: {
            async create() {
              calls += 1;
              return { choices: [{ message: { content: '' } }] };
            },
          },
        },
        images: {} as never,
      },
    });
    const chat = createAceAggregatorChatClient(ace);
    await expect(
      chat.complete({ system: 's', user: 'u', schema: z.object({}) }),
    ).rejects.toThrow(AceChatJsonError);
    expect(calls).toBe(2); // wrapper retries on the default → retry model
  });
});

describe('createAceRenderChatClient', () => {
  test('returns data + usage + model', async () => {
    const ace = makeAce({
      openai: {
        chat: {
          completions: {
            async create() {
              return {
                choices: [{ message: { content: JSON.stringify({ x: 1 }) } }],
                usage: { prompt_tokens: 10, completion_tokens: 20 },
                model: 'claude-sonnet-test',
              };
            },
          },
        },
        images: {} as never,
      },
    });
    const chat = createAceRenderChatClient(ace);
    const out = await chat.complete({
      system: 's',
      user: 'u',
      schema: { parse: (v: unknown) => v as { x: number } } as unknown as z.ZodType<{ x: number }>,
    });
    expect(out.data).toEqual({ x: 1 });
    expect(out.promptTokens).toBe(10);
    expect(out.completionTokens).toBe(20);
    expect(out.model).toBe('claude-sonnet-test');
  });
});

// The cron image client is now the shared provider-chain client
// (buildProviderChainImageClient, ADR 0014); its behaviour is covered by
// tests/ace-image/ace-image-client.test.ts. The old dall-e-3 createAceImageClient was
// removed, so there is nothing cron-specific left to assert here.
