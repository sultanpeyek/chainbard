import { describe, expect, test } from 'bun:test';
import {
  buildFundingPlan,
  buildLoopSteps,
  buildMintReceipt,
  buildPayReceipt,
  type Challenge,
  parseChallenge,
  parseDemoArgs,
  resolveBaseUrl,
  resolveImagePolicy,
  usageText,
} from '@/modules/demo-cli';

describe('parseDemoArgs', () => {
  test('defaults: reactive flow, local target, simulate (no send)', () => {
    const args = parseDemoArgs([]);
    expect(args.flow).toBe('reactive');
    expect(args.target).toBe('local');
    expect(args.send).toBe(false);
    expect(args.placeholder).toBe(false);
    expect(args.noRecover).toBe(false);
    expect(args.help).toBe(false);
  });

  test('parses --flow, --target, --send and recognized no-op flags', () => {
    const args = parseDemoArgs([
      '--flow',
      'cron',
      '--target',
      'prod',
      '--send',
      '--placeholder',
      '--no-recover',
    ]);
    expect(args.flow).toBe('cron');
    expect(args.target).toBe('prod');
    expect(args.send).toBe(true);
    expect(args.placeholder).toBe(true);
    expect(args.noRecover).toBe(true);
  });

  test('supports --flag=value form', () => {
    const args = parseDemoArgs(['--flow=cron', '--target=prod']);
    expect(args.flow).toBe('cron');
    expect(args.target).toBe('prod');
  });

  test('--help sets help flag', () => {
    expect(parseDemoArgs(['--help']).help).toBe(true);
    expect(parseDemoArgs(['-h']).help).toBe(true);
  });

  test('rejects unknown flow value', () => {
    expect(() => parseDemoArgs(['--flow', 'sideways'])).toThrow(/flow/);
  });

  test('rejects unknown target value', () => {
    expect(() => parseDemoArgs(['--target', 'staging'])).toThrow(/target/);
  });

  test('rejects unknown flags', () => {
    expect(() => parseDemoArgs(['--frobnicate'])).toThrow(/unknown/i);
  });
});

describe('resolveBaseUrl', () => {
  test('local resolves to dev server', () => {
    expect(resolveBaseUrl('local')).toBe('http://localhost:3000');
  });

  test('prod resolves to chainbard.vercel.app', () => {
    expect(resolveBaseUrl('prod')).toBe('https://chainbard.vercel.app');
  });

  test('env override wins for local', () => {
    expect(resolveBaseUrl('local', { DEMO_LOCAL_URL: 'http://localhost:4000' })).toBe(
      'http://localhost:4000',
    );
  });
});

describe('parseChallenge', () => {
  const body402 = {
    x402Version: 2,
    accepts: [
      {
        scheme: 'exact',
        network: 'solana',
        maxAmountRequired: '300000',
        payTo: '9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48',
        asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        extra: { decimals: 6, facilitator: '3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq' },
      },
    ],
  };

  test('extracts the solana payment requirement', () => {
    const challenge = parseChallenge(body402);
    expect(challenge.priceAtomic).toBe(BigInt(300000));
    expect(challenge.priceUsdc).toBeCloseTo(0.3, 6);
    expect(challenge.payTo).toBe('9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48');
    expect(challenge.asset).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(challenge.facilitator).toBe('3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq');
  });

  test('throws when no solana requirement present', () => {
    expect(() => parseChallenge({ accepts: [{ network: 'base' }] })).toThrow(/solana/);
  });

  test('throws when accepts is missing', () => {
    expect(() => parseChallenge({})).toThrow(/accepts/);
  });
});

describe('buildFundingPlan', () => {
  test('plans gas SOL + 0.30 USDC treasury -> demo-buyer', () => {
    const plan = buildFundingPlan(0.3);
    expect(plan.usdc).toBeCloseTo(0.3, 6);
    expect(plan.gasSol).toBeGreaterThan(0);
    expect(plan.usdcAtomic).toBe(BigInt(300000));
  });
});

describe('buildLoopSteps', () => {
  const challenge: Challenge = {
    priceAtomic: BigInt(300000),
    priceUsdc: 0.3,
    payTo: '9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48',
    asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    facilitator: '3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq',
  };

  test('narrates fund -> pay -> mint -> publish -> recover with cost estimates', () => {
    const steps = buildLoopSteps(challenge, buildFundingPlan(0.3));
    const labels = steps.map((s) => s.label);
    expect(labels).toEqual(['fund', 'pay', 'mint', 'publish', 'recover']);
    for (const step of steps) {
      expect(step.cost).toBeTruthy();
      expect(step.detail).toBeTruthy();
    }
    // pay step carries the buyer's USDC outflow
    const pay = steps.find((s) => s.label === 'pay');
    expect(pay?.cost).toContain('0.30');
    expect(pay?.cost.toLowerCase()).toContain('usdc');
  });
});

describe('buildPayReceipt', () => {
  const challenge: Challenge = {
    priceAtomic: BigInt(300000),
    priceUsdc: 0.3,
    payTo: '9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48',
    asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    facilitator: '3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq',
  };

  test('narrates the x402 settlement: scheme, amount, route, facilitator, tx', () => {
    const lines = buildPayReceipt({
      challenge,
      buyerAta: 'BuyerAtaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      payToAta: 'AgentAtaYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
      sig: 'SIG123',
    });
    const blob = lines.join('\n');
    // x402 scheme + buyer-broadcast settlement model
    expect(blob.toLowerCase()).toContain('x402');
    expect(blob).toContain('exact');
    expect(blob).toContain('solana');
    // amount in both human + atomic form
    expect(blob).toContain('0.30 USDC');
    expect(blob).toContain('300000');
    // who pays whom: buyer ATA -> agent ATA, with the agent owner
    expect(blob).toContain('BuyerAtaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    expect(blob).toContain('AgentAtaYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY');
    expect(blob).toContain(challenge.payTo);
    // facilitator that verifies settlement server-side
    expect(blob).toContain(challenge.facilitator);
    // settlement tx link
    expect(blob).toContain('https://solscan.io/tx/SIG123');
  });
});

describe('buildMintReceipt', () => {
  test('narrates Ace chat + image render + SAP Memo v2 (local = placeholder)', () => {
    const lines = buildMintReceipt({
      story: {
        title: 'The Vault That Remembered',
        heroImagePrompt: 'a cinematic obsidian monolith over a sea of circuitry',
        heroImageUrl: 'https://example.com/placeholder.png',
      },
      memoSig: 'MEMO456',
      shareUrl: 'http://localhost:3000/wallet123',
      policy: resolveImagePolicy({ target: 'local', placeholder: false }),
    });
    const blob = lines.join('\n');
    // Ace chat output: the story title
    expect(blob).toContain('The Vault That Remembered');
    // Ace image step: the prompt it produced
    expect(blob).toContain('a cinematic obsidian monolith over a sea of circuitry');
    // local target => placeholder, no ACE image spend
    expect(blob.toLowerCase()).toContain('placeholder');
    // SAP Memo v2 receipt on-chain (SPL Memo)
    expect(blob.toLowerCase()).toContain('sap memo');
    expect(blob).toContain('https://solscan.io/tx/MEMO456');
    // published share URL
    expect(blob).toContain('http://localhost:3000/wallet123');
  });

  test('prod render narrates real Midjourney with the rendered image url', () => {
    const lines = buildMintReceipt({
      story: { title: 'T', heroImagePrompt: 'p', heroImageUrl: 'https://img/real.png' },
      memoSig: 'M',
      shareUrl: 'https://chainbard.vercel.app/x',
      policy: resolveImagePolicy({ target: 'prod', placeholder: false }),
    });
    const blob = lines.join('\n').toLowerCase();
    expect(blob).toContain('midjourney');
    expect(blob).toContain('https://img/real.png');
  });
});

describe('usageText', () => {
  test('documents every flag including unimplemented ones', () => {
    const text = usageText();
    for (const flag of [
      '--flow',
      '--target',
      '--send',
      '--placeholder',
      '--no-recover',
      'reactive',
      'cron',
      'local',
      'prod',
    ]) {
      expect(text).toContain(flag);
    }
  });
});
