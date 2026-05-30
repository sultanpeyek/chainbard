/**
 * mapDasAsset — pure DAS JSON response → DasAssetInfo mapper.
 *
 * Extracted so the share-page's makeNftRpc and the mint route's buildNftRpc
 * can both reuse the same defensive mapping without duplicating it.
 */
import type { DasAssetInfo } from '@/spotlight-fetcher';

// The raw DAS response shape we need to map. DAS shapes vary widely across
// providers so every field access uses optional chaining.
type DasRaw = Record<string, unknown> | null | undefined;

export function mapDasAsset(raw: DasRaw): DasAssetInfo | null {
  if (raw == null || typeof raw !== 'object') return null;

  const r = raw as Record<string, unknown>;

  const content = r.content as Record<string, unknown> | undefined;
  const metadata = content?.metadata as Record<string, unknown> | undefined;
  const name = typeof metadata?.name === 'string' ? metadata.name : null;
  if (!name) return null;

  // grouping[] → find collection entry
  const grouping = Array.isArray(r.grouping) ? (r.grouping as Array<Record<string, unknown>>) : [];
  const collectionEntry = grouping.find(
    (g) => typeof g === 'object' && g.group_key === 'collection',
  );
  const collectionKey =
    collectionEntry && typeof collectionEntry.group_value === 'string'
      ? collectionEntry.group_value
      : null;

  // collectionName: DAS sometimes provides it in the collection object; fall back to null.
  const collectionName: string | null = null;

  // interface
  const iface = typeof r.interface === 'string' ? r.interface : '';

  // attributes
  const rawAttrs = Array.isArray(metadata?.attributes)
    ? (metadata.attributes as Array<Record<string, unknown>>)
    : [];
  const attributes: { trait_type: string; value: string }[] = rawAttrs
    .filter((a) => typeof a?.trait_type === 'string')
    .map((a) => ({
      trait_type: a.trait_type as string,
      value: String(a.value ?? ''),
    }));

  // imageUri: prefer links.image, fall back to files[0].uri
  const links = content?.links as Record<string, unknown> | undefined;
  const files = Array.isArray(content?.files)
    ? (content.files as Array<Record<string, unknown>>)
    : [];
  const imageUri =
    typeof links?.image === 'string' && links.image
      ? links.image
      : typeof files[0]?.uri === 'string' && files[0].uri
        ? (files[0].uri as string)
        : null;

  // currentOwner
  const ownership = r.ownership as Record<string, unknown> | undefined;
  const currentOwner = typeof ownership?.owner === 'string' ? ownership.owner : '';

  return {
    name,
    collectionName,
    collectionKey,
    interface: iface,
    attributes,
    imageUri,
    currentOwner,
  };
}
