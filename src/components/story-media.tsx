/**
 * StoryMedia — the reactive/autonomous video + audio enrichment section
 * (ADR 0016 D), shared by every share page (wallet/tx/nft/token).
 *
 * Renders nothing until at least one media url is present, so a freshly minted
 * page (media not yet attached) shows no empty section. The video is an abstract,
 * audio-less data-motion clip; the audio is AI TTS narration (no caption track).
 */
export function StoryMedia({ videoUrl, audioUrl }: { videoUrl?: string; audioUrl?: string }) {
  if (!videoUrl && !audioUrl) return null;
  return (
    <section className="mx-auto max-w-3xl pt-16 space-y-8">
      {videoUrl && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="cb-display text-2xl text-bone">Motion</h2>
            <span className="text-[11px] font-mono uppercase tracking-wider text-bone-faint">
              data-motion · abstract
            </span>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[4px] border border-ink-line bg-ink">
            {/* muted, audio-less data-motion clip — useMediaCaption does not apply */}
            <video
              src={videoUrl}
              controls
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        </div>
      )}
      {audioUrl && (
        <div>
          <p className="cb-eyebrow text-bone-faint">Spoken narration</p>
          <div className="mt-3 rounded-[4px] border border-ink-line bg-ink p-4">
            {/* biome-ignore lint/a11y/useMediaCaption: AI narration, no caption track available */}
            <audio src={audioUrl} controls className="w-full" />
          </div>
        </div>
      )}
    </section>
  );
}
