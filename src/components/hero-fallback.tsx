// Ledger-almanac placeholder hero. Warm near-black ground, a single molten-amber
// lantern, and hairline star-atlas geometry — no figures or scenes (ADR 0002).
// The lantern sits upper-right with concentric rotated diamond rings echoing the
// OG card, over a faint diamond lattice ruled like an almanac chart.
// Shown only when no generated flux image is available.
export function HeroFallback({ label }: { label: string }) {
  const lx = 600;
  const ly = 150;
  return (
    <div className="absolute inset-0 bg-ink">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 95% at 78% 14%, color-mix(in oklab, var(--amber) 18%, transparent) 0%, transparent 46%), linear-gradient(180deg, var(--ink-raised) 0%, #070605 100%)',
        }}
      />
      <svg
        viewBox="0 0 800 400"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={label}
      >
        <defs>
          <pattern
            id="hero-lattice"
            x="0"
            y="0"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M40 0 L80 40 L40 80 L0 40 Z M40 20 L60 40 L40 60 L20 40 Z"
              fill="none"
              stroke="var(--amber)"
              strokeWidth="0.5"
              opacity="0.1"
            />
          </pattern>
          <radialGradient id="lantern-glow">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.9" />
            <stop offset="35%" stopColor="var(--amber)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="800" height="400" fill="url(#hero-lattice)" />

        {/* ruled almanac baseline — hairline horizon */}
        <g stroke="var(--ink-line)" strokeWidth="1">
          <line x1="0" y1="300" x2="800" y2="300" opacity="0.7" />
          <line x1="0" y1="332" x2="800" y2="332" opacity="0.45" />
          <line x1="0" y1="356" x2="800" y2="356" opacity="0.28" />
        </g>

        {/* concentric rotated diamond rings around the lantern */}
        <g fill="none" stroke="var(--amber)" transform={`rotate(45 ${lx} ${ly})`}>
          <rect x={lx - 150} y={ly - 150} width="300" height="300" strokeOpacity="0.1" />
          <rect x={lx - 100} y={ly - 100} width="200" height="200" strokeOpacity="0.18" />
          <rect x={lx - 56} y={ly - 56} width="112" height="112" strokeOpacity="0.3" />
        </g>

        {/* the lantern — the single accent */}
        <circle cx={lx} cy={ly} r="120" fill="url(#lantern-glow)" />
        <circle
          cx={lx}
          cy={ly}
          r="26"
          fill="none"
          stroke="var(--amber)"
          strokeWidth="1.25"
          opacity="0.7"
        />
        <circle cx={lx} cy={ly} r="9" fill="var(--amber)" />
      </svg>
    </div>
  );
}

/** True when the URL is a real generated image, not a fixture or pending placeholder. */
export function isRealHeroImage(src?: string): boolean {
  return (
    Boolean(src?.startsWith('http')) &&
    !src?.includes('fixture') &&
    !src?.includes('chainbard-mark')
  );
}
