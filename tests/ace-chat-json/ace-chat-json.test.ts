import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { AceChatJsonError, aceChatJson, repairJson } from '@/lib/ace-chat-json';
import type { AceChatLike } from '@/lib/ace-chat-json';
import { chatOutputSchema } from '@/story-renderer';

type CreateArgs = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format:
    | { type: 'json_object' }
    | {
        type: 'json_schema';
        json_schema: { name: string; schema: Record<string, unknown>; strict: boolean };
      };
  max_tokens: number;
};

type CreateResp = {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
};

function makeAce(responses: Array<CreateResp | Error>): {
  ace: AceChatLike;
  calls: CreateArgs[];
} {
  const calls: CreateArgs[] = [];
  let i = 0;
  const ace: AceChatLike = {
    openai: {
      chat: {
        completions: {
          create: async (args) => {
            calls.push(args);
            const r = responses[i++];
            if (r === undefined) throw new Error('makeAce: no response queued');
            if (r instanceof Error) throw r;
            return r;
          },
        },
      },
    },
  };
  return { ace, calls };
}

const Schema = z.object({ status: z.string(), count: z.number() });

describe('aceChatJson — happy path', () => {
  test('returns parsed schema-validated object on first call', async () => {
    const { ace } = makeAce([
      {
        choices: [{ message: { content: '{"status":"ok","count":3}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'gpt-4o-mini',
      },
    ]);
    const result = await aceChatJson({
      ace,
      system: 'sys',
      user: 'usr',
      schema: Schema,
    });
    expect(result.data).toEqual({ status: 'ok', count: 3 });
    expect(result.attempts).toBe(1);
    expect(result.model).toBe('gpt-4o-mini');
  });
});

describe('aceChatJson — request shape', () => {
  test('forces JSON prefix onto system message, sets response_format and max_tokens', async () => {
    const { ace, calls } = makeAce([
      {
        choices: [{ message: { content: '{"status":"ok","count":1}' } }],
        model: 'gpt-4o-mini',
      },
    ]);
    await aceChatJson({
      ace,
      system: 'You are a story generator.',
      user: 'go',
      schema: Schema,
    });
    expect(calls).toHaveLength(1);
    const sys = calls[0].messages[0];
    expect(sys.role).toBe('system');
    expect(sys.content.startsWith('You MUST respond with a single JSON object only.')).toBe(true);
    expect(sys.content).toContain('You are a story generator.');
    // Structured outputs: the wrapper sends the schema shape so the model can't
    // freelance its own keys (response_format json_object only forces valid JSON).
    const rf = calls[0].response_format;
    expect(rf.type).toBe('json_schema');
    if (rf.type !== 'json_schema') throw new Error('expected json_schema');
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['status', 'count'],
    });
    expect(typeof calls[0].max_tokens).toBe('number');
    expect(calls[0].max_tokens).toBeGreaterThanOrEqual(1000);
  });

  test('embeds the schema shape (exact key names) into the system message', async () => {
    const Story = z.object({
      title: z.string(),
      subtitle: z.string(),
      sections: z.array(z.object({ title: z.string(), body: z.string() })).length(2),
    });
    const { ace, calls } = makeAce([
      {
        choices: [
          {
            message: {
              content:
                '{"title":"t","subtitle":"s","sections":[{"title":"a","body":"b"},{"title":"c","body":"d"}]}',
            },
          },
        ],
        model: 'gpt-4o-mini',
      },
    ]);
    await aceChatJson({ ace, system: 'gen', user: 'go', schema: Story });
    const sys = calls[0].messages[0].content;
    // The proxy/SDK can drop response_format, so the required key names must
    // also live in the system prompt or the model freelances its own keys.
    expect(sys).toContain('subtitle');
    expect(sys).toContain('sections');
    expect(sys).toContain('body');
    // still leads with the forced-json prefix and keeps the caller's system
    expect(sys.startsWith('You MUST respond with a single JSON object only.')).toBe(true);
    expect(sys).toContain('gen');
  });

  test('truncated JSON on first call → retries with retry model, returns parsed result', async () => {
    const { ace, calls } = makeAce([
      {
        choices: [{ message: { content: '{"status":"ok","count":0.5' } }],
        model: 'gpt-4o-mini',
      },
      {
        choices: [{ message: { content: '{"status":"ok","count":7}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
        model: 'gpt-4o',
      },
    ]);
    const result = await aceChatJson({
      ace,
      system: 's',
      user: 'u',
      schema: Schema,
    });
    expect(result.data).toEqual({ status: 'ok', count: 7 });
    expect(result.attempts).toBe(2);
    expect(result.model).toBe('gpt-4o');
    expect(calls).toHaveLength(2);
    expect(calls[0].model).toBe('gpt-4o-mini');
    expect(calls[1].model).toBe('gpt-4o');
  });

  test('prose-wrapped response on first call → retries with retry model', async () => {
    const { ace, calls } = makeAce([
      {
        choices: [
          { message: { content: 'Here is your JSON:\n\n{"status":"ok","count":4}' } },
        ],
        model: 'gpt-4o-mini',
      },
      {
        choices: [{ message: { content: '{"status":"ok","count":4}' } }],
        model: 'gpt-4o',
      },
    ]);
    const result = await aceChatJson({ ace, system: 's', user: 'u', schema: Schema });
    expect(result.data).toEqual({ status: 'ok', count: 4 });
    expect(result.attempts).toBe(2);
    expect(calls[1].model).toBe('gpt-4o');
  });

  test('both calls fail to parse → throws AceChatJsonError with both raw payloads', async () => {
    const { ace, calls } = makeAce([
      {
        choices: [{ message: { content: 'not json #1' } }],
        model: 'gpt-4o-mini',
      },
      {
        choices: [{ message: { content: 'not json #2 either' } }],
        model: 'gpt-4o',
      },
    ]);
    let caught: unknown;
    try {
      await aceChatJson({ ace, system: 's', user: 'u', schema: Schema });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AceChatJsonError);
    const err = caught as AceChatJsonError;
    expect(err.rawAttempt1).toBe('not json #1');
    expect(err.rawAttempt2).toBe('not json #2 either');
    expect(err.attempt1Model).toBe('gpt-4o-mini');
    expect(err.attempt2Model).toBe('gpt-4o');
    expect(calls).toHaveLength(2);
  });

  test('schema mismatch on first call → retries with retry model', async () => {
    const { ace, calls } = makeAce([
      {
        choices: [{ message: { content: '{"status":"ok","count":"three"}' } }],
        model: 'gpt-4o-mini',
      },
      {
        choices: [{ message: { content: '{"status":"ok","count":3}' } }],
        model: 'gpt-4o',
      },
    ]);
    const result = await aceChatJson({ ace, system: 's', user: 'u', schema: Schema });
    expect(result.data).toEqual({ status: 'ok', count: 3 });
    expect(result.attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });

  test('schema mismatch on second call → throws AceChatJsonError with both raws', async () => {
    const { ace } = makeAce([
      {
        choices: [{ message: { content: '{"status":"ok","count":"three"}' } }],
        model: 'gpt-4o-mini',
      },
      {
        choices: [{ message: { content: '{"status":"ok","count":"four"}' } }],
        model: 'gpt-4o',
      },
    ]);
    let caught: unknown;
    try {
      await aceChatJson({ ace, system: 's', user: 'u', schema: Schema });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AceChatJsonError);
    const err = caught as AceChatJsonError;
    expect(err.rawAttempt1).toBe('{"status":"ok","count":"three"}');
    expect(err.rawAttempt2).toBe('{"status":"ok","count":"four"}');
  });

  describe('env override ACE_CHAT_MODEL=gpt-4o', () => {
    let prev: string | undefined;
    beforeEach(() => {
      prev = process.env.ACE_CHAT_MODEL;
      process.env.ACE_CHAT_MODEL = 'gpt-4o';
    });
    afterEach(() => {
      if (prev === undefined) delete process.env.ACE_CHAT_MODEL;
      else process.env.ACE_CHAT_MODEL = prev;
    });

    test('happy path uses gpt-4o on first call', async () => {
      const { ace, calls } = makeAce([
        {
          choices: [{ message: { content: '{"status":"ok","count":1}' } }],
          model: 'gpt-4o',
        },
      ]);
      const result = await aceChatJson({ ace, system: 's', user: 'u', schema: Schema });
      expect(result.attempts).toBe(1);
      expect(calls).toHaveLength(1);
      expect(calls[0].model).toBe('gpt-4o');
    });

    test('failure → throws AceChatJsonError without a retry (only one call)', async () => {
      const { ace, calls } = makeAce([
        {
          choices: [{ message: { content: 'not json' } }],
          model: 'gpt-4o',
        },
      ]);
      let caught: unknown;
      try {
        await aceChatJson({ ace, system: 's', user: 'u', schema: Schema });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AceChatJsonError);
      const err = caught as AceChatJsonError;
      expect(err.rawAttempt1).toBe('not json');
      expect(err.rawAttempt2).toBe('');
      expect(err.attempt1Model).toBe('gpt-4o');
      expect(calls).toHaveLength(1);
    });
  });

  test('optional schema fields become nullable in strict schema; null values stripped before validation', async () => {
    const OptSchema = z.object({ name: z.string(), note: z.string().optional() });
    const { ace, calls } = makeAce([
      {
        // strict mode returns the omitted optional as null
        choices: [{ message: { content: '{"name":"x","note":null}' } }],
        model: 'gpt-4o-mini',
      },
    ]);
    const result = await aceChatJson({ ace, system: 's', user: 'u', schema: OptSchema });
    expect(result.data).toEqual({ name: 'x' });
    expect(result.attempts).toBe(1);
    const rf = calls[0].response_format;
    if (rf.type !== 'json_schema') throw new Error('expected json_schema');
    // optional `note` is required in strict mode but nullable
    expect(rf.json_schema.schema).toMatchObject({ required: ['name', 'note'] });
    const note = (rf.json_schema.schema.properties as Record<string, unknown>).note as {
      anyOf: Array<{ type?: string }>;
    };
    expect(note.anyOf.some((s) => s.type === 'null')).toBe(true);
  });

  test('respects custom maxTokens override', async () => {
    const { ace, calls } = makeAce([
      {
        choices: [{ message: { content: '{"status":"ok","count":1}' } }],
        model: 'gpt-4o-mini',
      },
    ]);
    await aceChatJson({
      ace,
      system: 's',
      user: 'u',
      schema: Schema,
      maxTokens: 4096,
    });
    expect(calls[0].max_tokens).toBe(4096);
  });
});

// The Ace gateway is an OpenAI-*compatible* proxy that does NOT enforce real
// structured outputs, so a model can return structurally-broken JSON. This is a
// faithful reduction of the production payload that 500'd the curator tick:
//   - every stat uses `=` instead of `:` as the key/value separator
//   - the 5th section object is missing its closing `}` before the array `]`
//   - heroImagePrompt's value embeds `=`, `|` and `:` that must NOT be rewritten
const FARTCOIN_RAW =
  '{"title":"Fartcoin Ascends","subtitle":"meme momentum",' +
  '"stats":[{"label":"PRICE","value="$0.1377"},{"label":"MCAP","value="$137.70M"},{"label":"24H","value="-8.67%"}],' +
  '"sections":[{"title":"A","body":"one"},{"title":"B","body":"two"},{"title":"C","body":"three"},' +
  '{"title":"D","body":"four"},{"title":"The Road Ahead","body":"market dynamics."],' +
  '"verdict":"a memecoin with immutable scarcity",' +
  '"heroImagePrompt":"Infographic embedding FACTS exactly: PRICE=$0.1377 | MCAP=$137.70M | 24H=-8.67%. No mascots."}';

describe('repairJson', () => {
  test('the production payload is genuinely invalid JSON (repro)', () => {
    expect(() => JSON.parse(FARTCOIN_RAW)).toThrow();
  });

  test('repairs `=` separators and the missing brace into schema-valid JSON', () => {
    const story = chatOutputSchema.parse(JSON.parse(repairJson(FARTCOIN_RAW)));
    expect(story.stats[0]).toEqual({ label: 'PRICE', value: '$0.1377' });
    expect(story.sections).toHaveLength(5);
    expect(story.sections[4].title).toBe('The Road Ahead');
  });

  test('leaves `=`, `|`, `:` that live INSIDE string values untouched', () => {
    const story = chatOutputSchema.parse(JSON.parse(repairJson(FARTCOIN_RAW)));
    expect(story.heroImagePrompt).toContain('PRICE=$0.1377 | MCAP=$137.70M | 24H=-8.67%');
    expect(story.heroImagePrompt).toContain('FACTS exactly:');
  });

  test('strips a markdown code fence and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n{"status":"ok","count":3}\n```\nHope that helps!';
    expect(JSON.parse(repairJson(raw))).toEqual({ status: 'ok', count: 3 });
  });

  test('closes a truncated object (unterminated string + missing brace)', () => {
    expect(JSON.parse(repairJson('{"status":"ok","note":"half'))).toEqual({
      status: 'ok',
      note: 'half',
    });
  });

  test('returns input unchanged when there is no JSON to anchor on', () => {
    expect(repairJson('totally not json')).toBe('totally not json');
  });
});

describe('aceChatJson — repair fallback', () => {
  test('both attempts return broken JSON → salvages a schema-valid story (no 500)', async () => {
    const { ace, calls } = makeAce([
      { choices: [{ message: { content: FARTCOIN_RAW } }], model: 'gpt-4o-mini' },
      {
        choices: [{ message: { content: FARTCOIN_RAW } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'gpt-4o',
      },
    ]);
    const result = await aceChatJson({ ace, system: 's', user: 'u', schema: chatOutputSchema });
    expect(result.attempts).toBe(2);
    expect(result.model).toBe('gpt-4o');
    expect(result.data.stats[0]).toEqual({ label: 'PRICE', value: '$0.1377' });
    expect(result.data.sections).toHaveLength(5);
    expect(calls).toHaveLength(2);
  });

  test('a clean retry is still preferred over repairing the first payload', async () => {
    // Attempt 1 is repairable, but a fresh re-generation succeeding cleanly must
    // win — repair is a last resort, not the primary path. So `attempts` is 2.
    const { ace } = makeAce([
      { choices: [{ message: { content: FARTCOIN_RAW } }], model: 'gpt-4o-mini' },
      { choices: [{ message: { content: '{"status":"ok","count":7}' } }], model: 'gpt-4o' },
    ]);
    const result = await aceChatJson({ ace, system: 's', user: 'u', schema: Schema });
    expect(result.data).toEqual({ status: 'ok', count: 7 });
    expect(result.attempts).toBe(2);
  });

  test('unrepairable garbage still throws and the error keeps the ORIGINAL raws', async () => {
    const { ace } = makeAce([
      { choices: [{ message: { content: 'not json #1' } }], model: 'gpt-4o-mini' },
      { choices: [{ message: { content: 'not json #2' } }], model: 'gpt-4o' },
    ]);
    let caught: unknown;
    try {
      await aceChatJson({ ace, system: 's', user: 'u', schema: Schema });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AceChatJsonError);
    const err = caught as AceChatJsonError;
    expect(err.rawAttempt1).toBe('not json #1');
    expect(err.rawAttempt2).toBe('not json #2');
  });
});
