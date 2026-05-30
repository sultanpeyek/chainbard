import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { JudgeOverlay, type JudgeOverlayProps } from '@/components/judge-overlay';

const WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';
const PAYMENT_SIG = 'Pay111111111111111111111111111111111111111111111';
const MEMO_SIG = 'Memo22222222222222222222222222222222222222222222';

const STORY = {
  kind: 'wallet' as const,
  input: WALLET,
  tone: 'Epic' as const,
  title: 'The Patient Ledger',
  subtitle: 'A wallet that waited.',
  stats: [{ label: 'Balance', value: '1.2 SOL' }],
  sections: [],
  verdict: 'It endured.',
  heroImagePrompt: 'an abstract obsidian monolith',
  heroImageUrl: 'https://img.example/hero.png',
  // Model name — must be stripped from the dumped JSON (ADR 0016 F).
  imageModel: 'nano-banana',
};

const PROPS: JudgeOverlayProps = {
  story: STORY,
  provenance: 'buyer',
  paymentSig: PAYMENT_SIG,
  memoSig: MEMO_SIG,
  timings: { spotlightMs: 412, renderMs: 1880 },
};

function render(props: Partial<JudgeOverlayProps> = {}): string {
  return renderToStaticMarkup(<JudgeOverlay {...PROPS} {...props} />);
}

describe('JudgeOverlay', () => {
  test('is off by default — no panel metadata, only the toggle', () => {
    const html = render();
    // Toggle affordance is present and labelled.
    expect(html.toLowerCase()).toContain('judge');
    // Off by default: the panel body (raw JSON / timings / provenance) is NOT
    // rendered in the initial server markup.
    expect(html).not.toContain('Judge view ON');
    expect(html).not.toContain('heroImagePrompt');
    expect(html).not.toContain('spotlightMs');
    expect(html).not.toContain(PAYMENT_SIG);
  });

  test('panel surfaces the story render metadata when shown', () => {
    // The panel content is what the toggle reveals; assert its rendered output
    // through the same public component, forced open.
    const html = renderToStaticMarkup(
      <JudgeOverlay {...PROPS} defaultOpen />,
    );
    expect(html).toContain('Judge view ON');
    // Raw spotlight JSON of the story (HTML-escaped quotes around keys/values).
    expect(html).toContain('heroImagePrompt');
    expect(html).toContain('The Patient Ledger');
    // Render timings.
    expect(html).toContain('spotlightMs');
    expect(html).toContain('412');
    // Provenance.
    expect(html).toContain('buyer');
    // Receipts as WORKING solscan tx links (on-chain proof — kept).
    expect(html).toContain(`https://solscan.io/tx/${PAYMENT_SIG}`);
    expect(html).toContain(`https://solscan.io/tx/${MEMO_SIG}`);
  });

  test('drops model names (ADR 0016 F) — no imageProvider row, imageModel stripped from JSON', () => {
    const html = renderToStaticMarkup(<JudgeOverlay {...PROPS} defaultOpen />);
    // The image-provider row is gone entirely.
    expect(html).not.toContain('image provider');
    // The image MODEL name is stripped from the dumped story JSON.
    expect(html).not.toContain('nano-banana');
    expect(html).not.toContain('imageModel');
  });

  test('never leaks operator secrets — only the story public render metadata', () => {
    const html = renderToStaticMarkup(<JudgeOverlay {...PROPS} defaultOpen />);
    const lower = html.toLowerCase();
    expect(lower).not.toContain('demo_secret');
    expect(lower).not.toContain('_recon');
    expect(lower).not.toContain('keypair');
    expect(lower).not.toContain('private key');
  });

  test('omits the receipt row when a story has no signatures (seed/curator)', () => {
    const html = renderToStaticMarkup(
      <JudgeOverlay
        {...PROPS}
        defaultOpen
        provenance="seed"
        paymentSig={null}
        memoSig={null}
      />,
    );
    expect(html).toContain('Judge view ON');
    expect(html).toContain('seed');
    expect(html).not.toContain('solscan.io');
  });
});
