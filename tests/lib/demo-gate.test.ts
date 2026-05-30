import { describe, expect, test } from 'bun:test';
import { placeholderImageClient, resolveDemoGate, selectImageClient } from '@/lib/demo-gate';

describe('resolveDemoGate', () => {
  test('valid x-demo-key + skipImage → demo provenance, skip image', () => {
    const gate = resolveDemoGate({
      demoKey: 'sekret',
      skipImage: true,
      demoSecret: 'sekret',
    });
    expect(gate.provenance).toBe('demo');
    expect(gate.skipImage).toBe(true);
  });

  test('valid x-demo-key without skipImage → demo provenance, no skip', () => {
    const gate = resolveDemoGate({
      demoKey: 'sekret',
      skipImage: false,
      demoSecret: 'sekret',
    });
    expect(gate.provenance).toBe('demo');
    expect(gate.skipImage).toBe(false);
  });

  test('missing x-demo-key → buyer provenance, skipImage ignored', () => {
    const gate = resolveDemoGate({
      demoKey: null,
      skipImage: true,
      demoSecret: 'sekret',
    });
    expect(gate.provenance).toBe('buyer');
    expect(gate.skipImage).toBe(false);
  });

  test('wrong x-demo-key → buyer provenance, skipImage ignored', () => {
    const gate = resolveDemoGate({
      demoKey: 'nope',
      skipImage: true,
      demoSecret: 'sekret',
    });
    expect(gate.provenance).toBe('buyer');
    expect(gate.skipImage).toBe(false);
  });

  test('unset DEMO_SECRET → key never matches, buyer provenance', () => {
    const gate = resolveDemoGate({
      demoKey: '',
      skipImage: true,
      demoSecret: undefined,
    });
    expect(gate.provenance).toBe('buyer');
    expect(gate.skipImage).toBe(false);
  });

  test('empty x-demo-key against empty secret never grants demo', () => {
    const gate = resolveDemoGate({
      demoKey: '',
      skipImage: true,
      demoSecret: '',
    });
    expect(gate.provenance).toBe('buyer');
    expect(gate.skipImage).toBe(false);
  });
});

describe('placeholderImageClient', () => {
  test('returns the placeholder url with model="placeholder" (no Midjourney)', async () => {
    const client = placeholderImageClient('https://placeholder.example/x.png');
    const result = await client.generate('prompt');
    expect(result.url).toBe('https://placeholder.example/x.png');
    expect(result.model).toBe('placeholder');
  });
});

describe('selectImageClient', () => {
  const placeholderUrl = 'https://placeholder.example/x.png';

  test('skipImage=true → placeholder, never calls the real (Midjourney) client', async () => {
    let midjourneyCalls = 0;
    const realImage = {
      async generate() {
        midjourneyCalls++;
        return { url: 'https://midjourney.example/x.png', model: 'midjourney' };
      },
    };
    const client = selectImageClient(true, { realImage, placeholderUrl });
    const result = await client.generate('prompt');
    expect(result.url).toBe(placeholderUrl);
    expect(result.model).toBe('placeholder');
    expect(midjourneyCalls).toBe(0);
  });

  test('skipImage=false → uses the real (Midjourney) client', async () => {
    let midjourneyCalls = 0;
    const realImage = {
      async generate() {
        midjourneyCalls++;
        return { url: 'https://midjourney.example/x.png', model: 'midjourney' };
      },
    };
    const client = selectImageClient(false, { realImage, placeholderUrl });
    const result = await client.generate('prompt');
    expect(result.model).toBe('midjourney');
    expect(midjourneyCalls).toBe(1);
  });
});
