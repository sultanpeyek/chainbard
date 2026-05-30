/**
 * Wordmark — the "chainbard" brand lockup. The "bard" half carries the amber
 * accent so the storyteller (the bard) reads as the emphasized part of the name.
 * Pure presentational; pass `className` for sizing (e.g. text-2xl / text-lg).
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`cb-display tracking-tight ${className ?? ''}`}>
      <span className="text-bone">chain</span>
      <span className="text-amber">bard</span>
    </span>
  );
}
