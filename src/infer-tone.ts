import type { Tone } from '@/story-renderer';

const KIND_DEFAULTS: Record<'wallet' | 'tx' | 'nft' | 'token', Tone> = {
  wallet: 'Epic',
  tx: 'Forensic',
  nft: 'Elegy',
  token: 'Comedy',
};

export function inferToneFromKind(kind: 'wallet' | 'tx' | 'nft' | 'token'): Tone {
  return KIND_DEFAULTS[kind];
}
