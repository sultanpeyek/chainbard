import { describe, expect, test } from 'bun:test';
import { type DiscoveredAgent, summarizeDiscovery } from '@/modules/sap-discovery';

const SAMPLE: DiscoveredAgent[] = [
  {
    pda: 'PdaA',
    wallet: 'WalA',
    name: 'chainbard',
    isActive: true,
    x402Endpoint: 'https://chainbard.vercel.app/api/mint/story',
    capabilities: ['story:wallet', 'story:tx', 'story:nft', 'story:token'],
  },
  {
    pda: 'PdaB',
    wallet: 'WalB',
    name: 'sentinel',
    isActive: true,
    x402Endpoint: null,
    capabilities: ['das:getAsset'],
  },
  {
    pda: 'PdaC',
    wallet: 'WalC',
    name: 'old-throwaway',
    isActive: false,
    x402Endpoint: null,
    capabilities: [],
  },
];

describe('summarizeDiscovery', () => {
  test('counts active + endpoint-bearing agents', () => {
    expect(summarizeDiscovery(SAMPLE)).toBe('sap-discovery: 3 agents (2 active, 1 w/ x402)');
  });

  test('handles empty list', () => {
    expect(summarizeDiscovery([])).toBe('sap-discovery: 0 agents (0 active, 0 w/ x402)');
  });
});
