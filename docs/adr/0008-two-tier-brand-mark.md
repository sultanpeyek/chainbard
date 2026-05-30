# 0008 — Two-tier brand mark: flat plume for chrome, woodcut cap for hero

Date: 2026-05-30

## Status

Accepted.

## Context

The chainbard brand mark is the woodcut bard's-cap (`public/chainbard-logo.png`) — a detailed, high-texture figure. It reads well at large sizes, but the same artwork was being reused everywhere, including small-size chrome: the favicon, the app/PWA icons, and the header/footer lockup.

At 16–32px the woodcut detail collapses. Fine lines merge, the silhouette goes muddy, and the mark becomes effectively invisible — a legibility bug. The prior attempt to fix this by downscaling the cap did not resolve it: shrinking a detail-dense woodcut does not recover legibility, it only loses information.

Two structural facts constrain the fix:

1. **One artwork cannot serve both size regimes.** The detail that makes the cap rich at hero size is the same detail that destroys it at icon size.
2. **The mark is content-policy-bound.** Under ADR `0002`, the cap-mark is a sanctioned figure. Any replacement mark cannot be a new, unsanctioned figure introduced through the back door of a favicon fix.

## Decision

chainbard uses a **two-tier brand mark**, selected by surface size.

1. **Flat plume for small-size chrome.** A redrawn, single-path flat **plume** mark (`public/chainbard-mark.svg`) is the mark for all small surfaces:
   - favicon
   - app / PWA icons
   - header and footer lockup

   It is a single path with no woodcut texture, so it stays legible at 16–32px.

2. **Woodcut cap for hero / large surfaces.** The full woodcut **cap-mark** (`public/chainbard-logo.png`) remains the mark for large surfaces where its detail survives:
   - OG cards (`src/app/opengraph-image.tsx`, `src/app/og/[input]/route.tsx`)
   - the README banner

3. **The plume is a derivative, not a new figure.** The flat plume is a reduction of the already-sanctioned woodcut cap-mark — same figure, simplified for scale — not a newly introduced subject. It therefore remains within the fence drawn by ADR `0002`. This ADR **extends** ADR `0002`: nobody is to "fix" the favicon back to the cap-mark, and the plume requires no separate content-policy review because it inherits the cap's sanction.

## Consequences

**Positive.**
- Small-size chrome is legible: the favicon and icons no longer go muddy or invisible at 16–32px.
- Hero surfaces keep the full woodcut richness where it actually reads.
- The plume's lineage is recorded, so the legibility fix is durable — a later contributor cannot silently revert the favicon to the cap and reintroduce the bug.

**Negative.**
- The brand carries two assets instead of one. Acceptable: the alternative — a single unified mark — forces a choice between muddy chrome and a flattened hero, and we want neither.
- The woodcut texture is sacrificed at small sizes. Acceptable and intentional: legibility at icon size outweighs texture that is invisible there anyway.

Two rejected alternatives:

- **(a) Downscale the cap.** The prior choice; it caused the legibility bug and does not recover detail that shrinking destroys.
- **(b) A single unified mark.** Would have to compromise either the chrome or the hero. Rejected in favour of letting each size regime use the mark that serves it.

## Related

- ADR `0002-content-policy.md` — the cap-mark is the sanctioned figure; the flat plume is a derivative of it and inherits that sanction.
