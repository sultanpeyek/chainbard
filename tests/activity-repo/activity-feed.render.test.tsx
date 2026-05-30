import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ActivityTick } from '@/activity-repo';
import { ActivityFeed } from '@/components/activity-feed';

const WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

// A seeded tick_log row, exercised through the same component the page renders.
const SEEDED_TICK: ActivityTick = {
  id: 'tick-seed-1',
  startedAt: new Date('2026-05-28T06:00:00.000Z'),
  signalSource: 'serp,chat',
  candidatesConsidered: 5,
  pickKind: 'wallet',
  pickIdentifier: WALLET,
  pickRationale: 'Surfaced in trending Solana wallet chatter.',
  pickSourceHit: '',
  briefHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  aceReceipts: [
    { kind: 'llm', model: 'gpt', promptTokens: 100, completionTokens: 50 },
    { kind: 'image', model: 'midjourney', prompt: 'p', url: 'u' },
    { kind: 'serp', query: 'q', snippetCount: 5 },
  ],
  memoSig: 'MemoSig22222222222222222222222222222222222',
  webhookPosted: true,
  error: null,
};

// ADR 0016 F: the public feed is a NEUTRAL story feed — timestamp + the pick linked
// to its story, and nothing more. No rationale, no ACE receipt breakdown, no error
// text, no budget/treasury wording. The spend posture never leaks here.
describe('ActivityFeed (neutral story feed)', () => {
  test('renders the timestamp and the pick linked to its story', () => {
    const html = renderToStaticMarkup(<ActivityFeed ticks={[SEEDED_TICK]} />);

    // Timestamp
    expect(html).toContain('2026-05-28 06:00 UTC');
    // Pick: identifier linked to its story page /[identifier]
    expect(html).toContain(`href="/${WALLET}"`);
    expect(html).toContain(WALLET);
  });

  test('redacts all spend posture: no rationale, receipt breakdown, memo link, or webhook flag', () => {
    const html = renderToStaticMarkup(<ActivityFeed ticks={[SEEDED_TICK]} />);
    // Rationale removed
    expect(html).not.toContain('Surfaced in trending Solana wallet chatter.');
    // ACE receipt breakdown removed
    expect(html).not.toContain('1 llm');
    expect(html).not.toContain('1 image');
    expect(html).not.toContain('1 serp');
    expect(html).not.toContain('ace:');
    // On-chain proof / memo link lives in Judge mode, not the public feed
    expect(html).not.toContain('solscan.io');
    // No webhook indicator
    expect(html).not.toContain('webhook');
  });

  test('never surfaces the error text of a failed tick', () => {
    const failed: ActivityTick = {
      ...SEEDED_TICK,
      id: 'tick-seed-err',
      memoSig: null,
      webhookPosted: false,
      error: 'render timed out',
    };
    const html = renderToStaticMarkup(<ActivityFeed ticks={[failed]} />);
    expect(html).not.toContain('render timed out');
    expect(html).not.toContain('solscan.io');
  });

  test('renders the neutral offline note when supplied', () => {
    const html = renderToStaticMarkup(
      <ActivityFeed ticks={[]} note="Curator is currently offline." />,
    );
    expect(html).toContain('Curator is currently offline.');
    // No budget/treasury/floor/recovery wording
    expect(html.toLowerCase()).not.toContain('treasury');
    expect(html.toLowerCase()).not.toContain('floor');
  });

  test('renders a graceful empty state', () => {
    const html = renderToStaticMarkup(<ActivityFeed ticks={[]} />);
    expect(html).toContain('No curator ticks recorded yet');
  });
});
