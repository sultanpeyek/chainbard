/**
 * #81 — makeNftRpc: DAS mapping contract tests
 *
 * These tests validate the DasAssetInfo mapping logic in makeNftRpc by
 * exercising the internal mapDasResponse helper that the module exports
 * (or by verifying the interface contract via the exported mapper).
 *
 * Since makeNftRpc makes real fetch calls, we test the DAS JSON → DasAssetInfo
 * mapping via the exported mapDasAsset helper.
 */
import { describe, expect, test } from 'bun:test';
import { mapDasAsset } from '@/lib/map-das-asset';

describe('mapDasAsset — DAS JSON → DasAssetInfo', () => {
  test('maps name from content.metadata.name', () => {
    const raw = {
      content: { metadata: { name: 'Cool NFT', attributes: [] }, links: {} },
      grouping: [],
      interface: 'V1_NFT',
      ownership: { owner: 'ownerPubkey11111111' },
    };
    const result = mapDasAsset(raw);
    expect(result?.name).toBe('Cool NFT');
  });

  test('maps collectionName and collectionKey from grouping where group_key===collection', () => {
    const raw = {
      content: { metadata: { name: 'My NFT', attributes: [] }, links: {} },
      grouping: [{ group_key: 'collection', group_value: 'CollMint111' }],
      interface: 'V1_NFT',
      ownership: { owner: 'ownerPubkey11111111' },
    };
    const result = mapDasAsset(raw);
    expect(result?.collectionKey).toBe('CollMint111');
    // collectionName falls back to null when not separately provided
    expect(result?.collectionName).toBeNull();
  });

  test('collectionName and collectionKey are null when no collection grouping', () => {
    const raw = {
      content: { metadata: { name: 'Lone NFT', attributes: [] }, links: {} },
      grouping: [],
      interface: 'ProgrammableNFT',
      ownership: { owner: 'owner222' },
    };
    const result = mapDasAsset(raw);
    expect(result?.collectionName).toBeNull();
    expect(result?.collectionKey).toBeNull();
  });

  test('maps interface from root interface field', () => {
    const raw = {
      content: { metadata: { name: 'Test', attributes: [] }, links: {} },
      grouping: [],
      interface: 'MplCoreAsset',
      ownership: { owner: 'owner333' },
    };
    const result = mapDasAsset(raw);
    expect(result?.interface).toBe('MplCoreAsset');
  });

  test('maps attributes from content.metadata.attributes', () => {
    const raw = {
      content: {
        metadata: {
          name: 'Trait NFT',
          attributes: [
            { trait_type: 'Background', value: 'Desert' },
            { trait_type: 'Robe', value: 'Crimson' },
          ],
        },
        links: {},
      },
      grouping: [],
      interface: 'V1_NFT',
      ownership: { owner: 'owner444' },
    };
    const result = mapDasAsset(raw);
    expect(result?.attributes).toHaveLength(2);
    expect(result?.attributes[0]).toEqual({ trait_type: 'Background', value: 'Desert' });
  });

  test('maps imageUri from content.links.image', () => {
    const raw = {
      content: {
        metadata: { name: 'Img NFT', attributes: [] },
        links: { image: 'https://example.com/img.png' },
      },
      grouping: [],
      interface: 'V1_NFT',
      ownership: { owner: 'owner555' },
    };
    const result = mapDasAsset(raw);
    expect(result?.imageUri).toBe('https://example.com/img.png');
  });

  test('falls back to content.files[0].uri when links.image is absent', () => {
    const raw = {
      content: {
        metadata: { name: 'File NFT', attributes: [] },
        links: {},
        files: [{ uri: 'https://example.com/file.png', mime: 'image/png' }],
      },
      grouping: [],
      interface: 'V1_NFT',
      ownership: { owner: 'owner666' },
    };
    const result = mapDasAsset(raw);
    expect(result?.imageUri).toBe('https://example.com/file.png');
  });

  test('imageUri is null when no image in links or files', () => {
    const raw = {
      content: { metadata: { name: 'No Img', attributes: [] }, links: {} },
      grouping: [],
      interface: 'V1_NFT',
      ownership: { owner: 'owner777' },
    };
    const result = mapDasAsset(raw);
    expect(result?.imageUri).toBeNull();
  });

  test('maps currentOwner from ownership.owner', () => {
    const raw = {
      content: { metadata: { name: 'Owned NFT', attributes: [] }, links: {} },
      grouping: [],
      interface: 'V1_NFT',
      ownership: { owner: 'theRealOwner888' },
    };
    const result = mapDasAsset(raw);
    expect(result?.currentOwner).toBe('theRealOwner888');
  });

  test('returns null when input is null/undefined', () => {
    expect(mapDasAsset(null)).toBeNull();
    expect(mapDasAsset(undefined)).toBeNull();
  });

  test('returns null when content.metadata.name is missing', () => {
    const raw = {
      content: { metadata: {}, links: {} },
      grouping: [],
      interface: 'V1_NFT',
      ownership: { owner: 'owner' },
    };
    expect(mapDasAsset(raw)).toBeNull();
  });
});
