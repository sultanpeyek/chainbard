/**
 * PlumeMark — the chainbard cap-feather glyph. Decorative only (aria-hidden);
 * the wrapping link carries the label. Color follows `currentColor`, so set the
 * hue on a parent (e.g. text-amber); pass `className` for sizing.
 */
export function PlumeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <path
        d="M46 7 C40 9 33 13 27 20 C21 27 16 36 13 46 C18 43 22 41 26 40 C24 43 22 46 21 49 C26 47 30 46 34 45 C31 49 28 52 25 55 C32 53 38 49 43 43 C49 36 53 27 54 19 C49 21 45 23 41 26 C45 21 48 16 50 11 C47 13 44 15 41 18 C44 14 45 11 46 7 Z"
        fill="currentColor"
      />
    </svg>
  );
}
