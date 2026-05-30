import { CopyAddress } from '@/components/copy-address';
import { solscanTxUrl } from '@/lib/explorer';
import { truncateId } from '@/lib/truncate-id';

/**
 * ProvenanceReceipt — the chainbard mint seal. One canonical, verifiable receipt
 * for every story kind (wallet / tx / nft / token), replacing the wallet-only
 * ReceiptLinks. Renders the source authority + the two on-chain proofs (the USDC
 * payment settlement and the SPL-Memo audit trail) as Solscan links.
 *
 * Named "receipt/seal" rather than "provenance" on purpose: the NFT page already
 * owns the word "Provenance" for the asset's ownership chain. This is the *mint*
 * provenance — who summoned the story and the chain it's stamped on.
 *
 * Degrades gracefully: a seed/demo render with no signatures yet still shows the
 * source seal + the identifier, marked "unsealed", so provenance is never blank.
 */

type SourceKey = 'seed' | 'buyer' | 'curator' | 'demo';

const SOURCE: Record<
  SourceKey,
  { label: string; blurb: string; accent: string; tone: string; ring: string }
> = {
  seed: {
    label: 'curator seed',
    blurb: 'seeded into the gallery',
    accent: 'var(--amber)',
    tone: 'text-amber',
    ring: 'border-amber/40',
  },
  buyer: {
    label: 'buyer render',
    blurb: 'minted on demand · 0.30 USDC',
    accent: 'var(--verdant)',
    tone: 'text-verdant',
    ring: 'border-verdant/40',
  },
  curator: {
    label: 'curator pick',
    blurb: 'autonomous daily pick',
    accent: 'var(--bone-dim)',
    tone: 'text-bone-dim',
    ring: 'border-ink-line',
  },
  demo: {
    label: 'demo run',
    blurb: 'gated test render',
    accent: 'var(--bone-faint)',
    tone: 'text-bone-faint',
    ring: 'border-ink-line',
  },
};

const KIND_LABEL: Record<string, string> = {
  wallet: 'wallet bio',
  tx: 'tx forensic',
  nft: 'nft saga',
  token: 'token saga',
};

/** Wax-seal stamp — the diamond-quatrefoil motif shared with the hero patterns. */
function Seal({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 96 96" className="h-16 w-16 shrink-0" role="img" aria-label="chainbard seal">
      <circle cx="48" cy="48" r="45" fill="none" stroke={accent} strokeWidth="1" opacity="0.55" />
      <circle
        cx="48"
        cy="48"
        r="38"
        fill="none"
        stroke={accent}
        strokeWidth="0.5"
        opacity="0.35"
        strokeDasharray="2 3"
      />
      <path
        d="M48 16 L80 48 L48 80 L16 48 Z M48 30 L66 48 L48 66 L30 48 Z"
        fill="none"
        stroke={accent}
        strokeWidth="0.8"
        opacity="0.7"
      />
      <text
        x="48"
        y="48"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="22"
        fill={accent}
        opacity="0.95"
      >
        ✦
      </text>
    </svg>
  );
}

function ProofLink({ label, sig, tone }: { label: string; sig: string; tone: string }) {
  return (
    <a
      href={solscanTxUrl(sig)}
      target="_blank"
      rel="noreferrer"
      className={`group inline-flex items-center gap-2 rounded-[2px] border border-ink-line bg-ink-raised/40 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider backdrop-blur transition-colors hover:border-amber ${tone}`}
    >
      <span className="text-bone-faint">{label}</span>
      <span>{truncateId(sig, 'tx')}</span>
      <span
        aria-hidden
        className="text-bone-faint transition-transform duration-140 group-hover:translate-x-0.5 group-hover:text-amber"
      >
        ↗
      </span>
    </a>
  );
}

export function ProvenanceReceipt({
  input,
  kind,
  provenance,
  memoSig,
  paymentSig,
  className,
}: {
  input: string;
  kind: string;
  provenance: string;
  memoSig?: string | null;
  paymentSig?: string | null;
  className?: string;
}) {
  const src = SOURCE[(provenance as SourceKey) in SOURCE ? (provenance as SourceKey) : 'curator'];
  const sealed = Boolean(memoSig || paymentSig);

  return (
    <section
      className={`cb-rise overflow-hidden rounded-[4px] border border-ink-line bg-ink-raised/30 shadow-[0_0_60px_-30px_rgba(232,161,58,0.35)] ${className ?? ''}`}
    >
      <div className="flex items-center justify-between border-b border-ink-line px-4 py-2 sm:px-5">
        <p className="cb-eyebrow text-bone-faint">chainbard seal · verifiable on-chain</p>
        <span className={`font-mono text-[10px] uppercase tracking-wider ${src.tone}`}>
          {sealed ? 'sealed' : 'unsealed'}
        </span>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="flex items-center gap-4">
          <Seal accent={src.accent} />
          <div className="min-w-0">
            <div
              className={`inline-block rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${src.ring} ${src.tone}`}
            >
              {src.label}
            </div>
            <p className="mt-1.5 text-sm text-bone-dim">{src.blurb}</p>
          </div>
        </div>

        <div className="hidden w-px self-stretch bg-ink-line sm:block" />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 font-mono text-xs">
            <span className="text-amber/70">solana://{KIND_LABEL[kind] ?? kind}</span>
            <CopyAddress
              value={input}
              kind={kind === 'tx' ? 'tx' : 'address'}
              className="min-w-0 text-bone-dim"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {paymentSig ? <ProofLink label="payment" sig={paymentSig} tone="text-verdant" /> : null}
            {memoSig ? <ProofLink label="sap memo" sig={memoSig} tone="text-amber" /> : null}
            {!sealed ? (
              <span className="inline-flex items-center rounded-[2px] border border-ink-line px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-bone-faint">
                no settlement signatures yet
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
