/**
 * Operator-curated Featured strip for the homepage.
 *
 * A derived ordered view over the Fixture catalog (`src/config/fixtures.ts`) —
 * the catalog owns each asset's identifier/kind/label, so these picks can never
 * drift from the seed-mint slate. Order and membership here are independent,
 * hand-curated: edit the `FEATURED_SLUGS` list to re-curate the strip.
 *
 * Static data only — no logic beyond the catalog lookup. Each card links to
 * `/[input]`.
 */

import { FIXTURES, type FixtureKind, type FixtureSlug } from '@/config/fixtures';

export type FeaturedEntry = {
  input: string;
  kind?: FixtureKind;
  label?: string;
};

/** Curated order + membership of the homepage strip (catalog slugs). */
const FEATURED_SLUGS: readonly FixtureSlug[] = [
  'bonk',
  'madLads',
  'solanaMonkeyBusiness',
  'slerfBurn',
  'wintermute',
  'wormholeTx',
];

export const FEATURED: readonly FeaturedEntry[] = FEATURED_SLUGS.map((slug) => {
  const f = FIXTURES[slug];
  return { input: f.identifier, kind: f.kind, label: f.label };
});

/**
 * Curated label for a featured asset, keyed by `input`. Lets the live feed and
 * detail pages display the operator identity (e.g. "Mad Lads #7541") instead of
 * the AI-generated title (e.g. "Crown of Transience").
 */
export function featuredLabel(input: string): string | undefined {
  return FEATURED.find((e) => e.input === input)?.label;
}
