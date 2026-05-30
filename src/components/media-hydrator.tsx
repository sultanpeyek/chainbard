'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * MediaHydrator — late-hydrates reactive video/audio on a share page (ADR 0016 D).
 *
 * The reactive mint publishes the story immediately and enqueues a durable
 * media-attach job that patches story.videoUrl/audioUrl out-of-band. A freshly
 * minted page therefore has no media yet. This client component polls the server
 * component (via router.refresh()) on a bounded interval while media is absent,
 * so the <video>/<audio> sections appear once the job lands — no manual reload.
 *
 * It renders nothing. When `hasMedia` is already true (cache hit, or the job
 * landed) it does nothing and stops polling.
 */
export function MediaHydrator({ hasMedia }: { hasMedia: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (hasMedia) return;
    // Poll every 8s for up to ~3 min (matches the media collect budget). A
    // router.refresh re-runs the server component, which re-reads the patched row.
    const POLL_MS = 8000;
    const MAX_POLLS = 24;
    let polls = 0;
    const id = setInterval(() => {
      polls += 1;
      if (polls > MAX_POLLS) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasMedia, router]);

  return null;
}
