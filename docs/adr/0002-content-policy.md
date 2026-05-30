# 0002 — Content policy: single `CONTENT_POLICY` constant, enforceable scope

Date: 2026-05-27

## Status

Accepted.

## Context

The operator requires that generated imagery and audio stay within a defined scope: inanimate objects, landscapes, architecture, ornamental script, geometric and abstract compositions are permitted; humans, animals, anthropomorphic objects, iconography, movement symbols, nudity/sexual themes, occult cosmology, musical instruments, and animate motion are not.

Two encoding problems arose when the constraint was first specified in the codebase:

1. **Third-party model stability.** Inlining domain-specific vocabulary into a Midjourney/OpenAI/Anthropic system prompt risks triggering upstream safety filters, producing inconsistent or refused outputs.
2. **Maintainability.** The constraint needs to be enforceable from a single source of truth — imported by both the story renderer and the image-prompt builder — not scattered across multiple modules under varied naming conventions.

The constraint itself is non-negotiable. This ADR decides how it is encoded in code and prose.

## Decision

1. **Single constant.** The operator's content scope is encoded as one exported string constant: `CONTENT_POLICY`. It is the sole source of truth imported by both the story renderer and the image-prompt builder. No other module re-encodes the policy independently.

2. **Module rename.** The previous module name is replaced by `content-policy`. No prior naming surfaces in the codebase or public artifacts.

3. **Permitted scope** (safe to request from third-party models):
   - Inanimate objects and still-life compositions
   - Landscapes, seascapes, natural environments
   - Architecture and built structures
   - Calligraphy, geometric patterns, ornamental script
   - Abstract and decorative compositions

4. **Prohibited scope** (blocked by `CONTENT_POLICY`):
   - Humans, animals, or anthropomorphic objects
   - Sacred or devotional iconography of any tradition
   - Symbols, flags, or insignia of political, ideological, or social movements
   - Nudity or sexual themes
   - Occult cosmology as a positive subject
   - Musical instruments
   - Motion that animates objects as living beings

## Consequences

**Positive.**
- Third-party model behaviour stabilizes — no domain-specific vocabulary in prompts that could trigger moderation.
- Single constant is easy to audit and update; both rendering paths stay in sync automatically.
- The prohibited scope covers the full required fence (humans, animals, anthropomorphic objects, iconography, nudity, occult, instruments) without coupling it to any external framing.

**Negative.**
- A reader of this ADR sees the *what* (enforceable scope) but not the *why* behind each individual item. Acceptable: the codebase encodes the enforceable invariant; rationale for each item is an operator concern, not a codebase concern.

## Related

- PRD §"Content policy compliance" — locks the constant + module rename.
- Future ADR `0004-cnft-and-cinematic-future-opt-in.md` (when written) — opt-in upsells must also pass `CONTENT_POLICY`.

## Amendment (ADR 0015) — 2026-06-04

ADR 0015 activates the audio and video generation paths that the AUDIO RULES and MOTION RULES in `CONTENT_POLICY` previously described as "future". The headers in `src/content-policy.ts` now read "the ACTIVE audio/video generation path" to reflect that these paths are live.

This amendment narrows, not widens, the enforced scope. The active paths are bounded:

- **Audio** is spoken-word narration only. Music, singing, and instruments remain PROHIBITED.
- **Video** is abstract data-motion only (kinetic typography, animated data cards, geometric motion). Animating objects as living beings remains PROHIBITED.

No existing prohibition is relaxed. The permitted/prohibited subject lists, the AUDIO RULES "no music" clause, and the MOTION RULES "no animate-being motion" clause are unchanged; the amendment only confirms the bounded scope of the now-active paths.
