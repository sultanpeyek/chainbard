import { z } from 'zod';
import { env } from '@/env';

// End-to-end LLM trace. fetchRaw is the single chokepoint for EVERY model
// round-trip — the Director's plan call, every renderer write, and both retry
// attempts all flow through here — so tagging it `[llm]` surfaces the full
// input→output data flow (full user prompt incl. woven web context, raw model
// response, token usage). Silenced under NODE_ENV=test to keep the suite quiet.
// `env` is read lazily (inside the call, never at module init) — top-level env
// access trips a temporal-dead-zone error under the test harness's env mock.
function llmTrace(msg: string, extra?: Record<string, unknown>): void {
  if (env.NODE_ENV === 'test') return;
  if (extra) console.log(`[llm] ${msg}`, extra);
  else console.log(`[llm] ${msg}`);
}

export const DEFAULT_MODEL = 'gpt-4o-mini';
export const RETRY_MODEL = 'gpt-4o';
export const DEFAULT_MAX_TOKENS = 2000;
export const FORCED_JSON_PREFIX =
  'You MUST respond with a single JSON object only. No prose, no markdown, no fences.';

export type ResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: { name: string; schema: Record<string, unknown>; strict: boolean };
    };

export type AceChatLike = {
  openai: {
    chat: {
      completions: {
        create: (args: {
          model: string;
          messages: Array<{ role: string; content: string }>;
          response_format: ResponseFormat;
          max_tokens: number;
        }) => Promise<{
          choices: Array<{ message: { content: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          model?: string;
        }>;
      };
    };
  };
};

export type AceChatJsonArgs<T> = {
  ace: AceChatLike;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  model?: string;
};

export type AceChatJsonResult<T> = {
  data: T;
  promptTokens: number;
  completionTokens: number;
  model: string;
  attempts: 1 | 2;
};

export class AceChatJsonError extends Error {
  rawAttempt1: string;
  rawAttempt2: string;
  attempt1Model: string;
  attempt2Model: string;
  cause1?: unknown;
  cause2?: unknown;
  constructor(opts: {
    rawAttempt1: string;
    rawAttempt2: string;
    attempt1Model: string;
    attempt2Model: string;
    cause1?: unknown;
    cause2?: unknown;
  }) {
    // Thread the underlying SDK error onto the STANDARD `.cause` (prefer the
    // more-capable retry's cause) so a funds-exhaustion error raised by the
    // x402 rail survives this wrapper and is reachable by `isFundsExhausted`'s
    // cause-chain walk — it would otherwise be buried in the non-standard
    // cause1/cause2 fields and missed. See ADR 0015 / src/treasury.ts.
    super(`aceChatJson failed twice (models: ${opts.attempt1Model}, ${opts.attempt2Model})`, {
      cause: opts.cause2 ?? opts.cause1,
    });
    this.name = 'AceChatJsonError';
    this.rawAttempt1 = opts.rawAttempt1;
    this.rawAttempt2 = opts.rawAttempt2;
    this.attempt1Model = opts.attempt1Model;
    this.attempt2Model = opts.attempt2Model;
    this.cause1 = opts.cause1;
    this.cause2 = opts.cause2;
  }
}

/**
 * Recursively tighten a JSON Schema for OpenAI structured-output `strict` mode:
 * every object gets `additionalProperties: false` and lists ALL its properties
 * in `required`. Properties that were originally optional become nullable
 * (`anyOf: [orig, { type: 'null' }]`) so the model may omit them by returning
 * null — `stripNulls` drops those before zod validation.
 */
function strictify(node: unknown): void {
  if (Array.isArray(node)) {
    for (const n of node) strictify(n);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
    const props = obj.properties as Record<string, unknown>;
    const keys = Object.keys(props);
    const required = new Set<string>(Array.isArray(obj.required) ? (obj.required as string[]) : []);
    for (const k of keys) {
      if (!required.has(k)) props[k] = { anyOf: [props[k], { type: 'null' }] };
    }
    obj.required = keys;
    obj.additionalProperties = false;
  }
  for (const k of Object.keys(obj)) strictify(obj[k]);
}

function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  delete js.$schema;
  strictify(js);
  return js;
}

/**
 * Best-effort repair of *structurally* invalid JSON. The Ace gateway is an
 * OpenAI-compatible proxy that doesn't enforce real structured-output, so a
 * model can emit JSON that `JSON.parse` rejects outright (this is what 500'd a
 * curator render: every stat used `=` instead of `:`, and a section object was
 * left unclosed before its array `]`).
 *
 * Tokenizer-aware, so the `=`, `|`, `:` characters that legitimately live
 * inside a value (e.g. a heroImagePrompt's "PRICE=$0.1377 | MCAP=…") are never
 * rewritten. It:
 *   - drops any markdown fence / leading+trailing prose around the object,
 *   - rewrites a `":"` key/value separator the model collapsed into `="` (the
 *     observed corruption — only the key literally named `value` was hit, an
 *     HTML `value="…"` n-gram bleeding into JSON),
 *   - closes mismatched/unclosed brackets and an unterminated trailing string
 *     (so truncated output is salvaged too).
 *
 * Returns the input unchanged when there's no `{`/`[` to anchor on, so a
 * genuinely non-JSON response still fails downstream and surfaces the error.
 */
export function repairJson(input: string): string {
  const start = input.search(/[{[]/);
  if (start === -1) return input;
  const s = input.slice(start);

  // First non-whitespace char at or after `from` ('' if none).
  const peekFrom = (from: number): string => {
    let j = from;
    while (j < s.length && (s[j] === ' ' || s[j] === '\n' || s[j] === '\r' || s[j] === '\t')) j++;
    return j < s.length ? s[j] : '';
  };

  const out: string[] = [];
  const stack: string[] = []; // unclosed '{' / '[' openers
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      // An unescaped `="` can't occur inside valid JSON (an unescaped `"` ends
      // the string), so it's the corrupted `":"` separator — UNLESS the `"` is
      // a value's closing quote (a value ending in `=`, e.g. base64), which is
      // betrayed by a structural `,`/`}`/`]` following it.
      if (!escaped && c === '=' && s[i + 1] === '"') {
        const after = peekFrom(i + 2);
        if (after !== ',' && after !== '}' && after !== ']' && after !== '') {
          out.push('"', ':', '"'); // close key, separator, open value
          i++; // consume the value's opening quote; stay inString (now in value)
          continue;
        }
      }
      out.push(c);
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out.push(c);
    } else if (c === '{' || c === '[') {
      stack.push(c);
      out.push(c);
    } else if (c === '}' || c === ']') {
      const want = c === '}' ? '{' : '[';
      // Close any opener the model forgot to close before this bracket (e.g. an
      // object still open when the array containing it closed).
      while (stack.length > 0 && stack[stack.length - 1] !== want) {
        out.push(stack.pop() === '{' ? '}' : ']');
      }
      if (stack.length > 0) {
        stack.pop();
        out.push(c);
        if (stack.length === 0) break; // top-level value complete → drop any trailing prose
      }
      // stray closer with nothing open → drop it
    } else {
      out.push(c);
    }
  }

  if (inString) out.push('"');
  while (stack.length > 0) out.push(stack.pop() === '{' ? '}' : ']');
  return out.join('');
}

/** Drop null-valued keys so model-omitted optionals (returned as null under
 * strict mode) read as absent for zod `.optional()` validation. */
function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripNulls(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[k] = stripNulls(v);
    }
    return out as T;
  }
  return value;
}

async function fetchRaw(
  ace: AceChatLike,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  responseFormat: ResponseFormat,
  schemaHint: string,
): Promise<{ raw: string; resolvedModel: string; promptTokens: number; completionTokens: number }> {
  const systemContent = schemaHint
    ? `${FORCED_JSON_PREFIX}\n\n${schemaHint}\n\n${system}`
    : `${FORCED_JSON_PREFIX}\n\n${system}`;
  // `systemHead` is the first line of the caller's system prompt — enough to tell
  // a Director plan call ("You are the Director…") apart from a render
  // (CONTENT_POLICY) without dumping the static policy text every call.
  const systemHead = system.split('\n', 1)[0]?.slice(0, 80) ?? '';
  llmTrace('→ request', {
    model,
    maxTokens,
    format: responseFormat.type,
    systemHead,
    userChars: user.length,
  });
  // Full user prompt — this carries the on-chain spotlights AND the woven SERP
  // "Web context" block, so it's where you can see exactly what the model was
  // told about the web search result.
  llmTrace(`→ user prompt (${user.length} chars):\n${user}`);
  const resp = await ace.openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: user },
    ],
    response_format: responseFormat,
    max_tokens: maxTokens,
  });
  const raw = resp.choices?.[0]?.message?.content ?? '';
  llmTrace('← response', {
    resolvedModel: resp.model ?? model,
    promptTokens: resp.usage?.prompt_tokens ?? 0,
    completionTokens: resp.usage?.completion_tokens ?? 0,
    rawChars: raw.length,
  });
  llmTrace(`← raw (${raw.length} chars):\n${raw}`);
  return {
    raw,
    resolvedModel: resp.model ?? model,
    promptTokens: resp.usage?.prompt_tokens ?? 0,
    completionTokens: resp.usage?.completion_tokens ?? 0,
  };
}

export async function aceChatJson<T>(args: AceChatJsonArgs<T>): Promise<AceChatJsonResult<T>> {
  // Read from process.env (not the frozen typed `env`) so the model is a live
  // runtime knob — overridable per deploy without re-importing the env module.
  // An explicit per-call `args.model` (e.g. the heavy WRITE-step model) wins
  // over the env default.
  const requestedModel = args.model?.trim() || process.env.ACE_CHAT_MODEL?.trim() || DEFAULT_MODEL;
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Primary path: OpenAI structured outputs, which force the model to emit JSON
  // matching the exact schema shape (response_format json_object only forces
  // *valid* JSON, not the *shape* — the model otherwise invents its own keys).
  // Fall back to json_object if the schema can't be converted.
  // Many OpenAI-compatible proxies (and some SDKs) silently drop
  // `response_format: json_schema`, so the model only sees `json_object` (valid
  // JSON, any keys it likes) and invents its own field names. Mirror the schema
  // shape into the system prompt as well, so the required key names survive even
  // when structured-output enforcement doesn't.
  let responseFormat: ResponseFormat;
  let schemaHint = '';
  try {
    const jsonSchema = toStrictJsonSchema(args.schema);
    responseFormat = {
      type: 'json_schema',
      json_schema: { name: 'response', schema: jsonSchema, strict: true },
    };
    schemaHint = `Return a JSON object matching EXACTLY this JSON Schema — use these property names and no others:\n${JSON.stringify(jsonSchema)}`;
  } catch {
    responseFormat = { type: 'json_object' };
  }

  const parseValidate = (raw: string): T => args.schema.parse(stripNulls(JSON.parse(raw)));
  // Last-resort recovery: try a tokenizer-aware repair of the raw payload(s)
  // before giving up. Only reached after a fresh re-generation has already
  // failed — a clean retry is trusted over a heuristic repair. Returns the
  // first raw that repairs into a schema-valid object, else undefined.
  const salvage = (...raws: string[]): T | undefined => {
    for (const raw of raws) {
      try {
        return parseValidate(repairJson(raw));
      } catch {
        // try the next raw
      }
    }
    return undefined;
  };

  const first = await fetchRaw(
    args.ace,
    requestedModel,
    args.system,
    args.user,
    maxTokens,
    responseFormat,
    schemaHint,
  );
  try {
    const data = parseValidate(first.raw);
    return {
      data,
      promptTokens: first.promptTokens,
      completionTokens: first.completionTokens,
      model: first.resolvedModel,
      attempts: 1,
    };
  } catch (cause1) {
    if (requestedModel === RETRY_MODEL) {
      const repaired = salvage(first.raw);
      if (repaired !== undefined) {
        return {
          data: repaired,
          promptTokens: first.promptTokens,
          completionTokens: first.completionTokens,
          model: first.resolvedModel,
          attempts: 1,
        };
      }
      throw new AceChatJsonError({
        rawAttempt1: first.raw,
        rawAttempt2: '',
        attempt1Model: first.resolvedModel,
        attempt2Model: RETRY_MODEL,
        cause1,
      });
    }
    const second = await fetchRaw(
      args.ace,
      RETRY_MODEL,
      args.system,
      args.user,
      maxTokens,
      responseFormat,
      schemaHint,
    );
    try {
      const data = parseValidate(second.raw);
      return {
        data,
        promptTokens: second.promptTokens,
        completionTokens: second.completionTokens,
        model: second.resolvedModel,
        attempts: 2,
      };
    } catch (cause2) {
      // Both fresh generations failed to parse/validate. Try repairing the
      // more-capable model's payload first, then the first attempt's.
      const repaired = salvage(second.raw, first.raw);
      if (repaired !== undefined) {
        return {
          data: repaired,
          promptTokens: second.promptTokens,
          completionTokens: second.completionTokens,
          model: second.resolvedModel,
          attempts: 2,
        };
      }
      throw new AceChatJsonError({
        rawAttempt1: first.raw,
        rawAttempt2: second.raw,
        attempt1Model: first.resolvedModel,
        attempt2Model: second.resolvedModel,
        cause1,
        cause2,
      });
    }
  }
}
