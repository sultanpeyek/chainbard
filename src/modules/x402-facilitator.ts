/**
 * AceData x402 facilitator client (`facilitator.acedata.cloud`).
 *
 * The reactive sell-side settles buyer payment through AceData's OWN facilitator
 * (AceData facilitator requirement #4): the buyer hands the server a partial-signed USDC
 * `TransferChecked` (fee-payer = facilitator pubkey, buyer signs as the token
 * authority); the server calls `/verify` (non-destructive) then `/settle`
 * (facilitator co-signs as fee-payer and broadcasts).
 *
 * See ADR 0001 and the proven request shapes in `scripts/spikes/S1-payto-probe.ts`.
 */

export interface FacilitatorPaymentRequirements {
  scheme: 'exact';
  network: 'solana';
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra: {
    decimals: number;
    /** Fee-payer pubkey the facilitator co-signs as (== the advertised facilitator). */
    feePayer: string;
    /** RPC the facilitator uses to build/broadcast the settle tx. */
    rpcUrl: string;
    computeUnitLimit?: number;
    computeUnitPriceMicroLamports?: number;
  };
}

export interface FacilitatorVerifyResult {
  isValid: boolean;
  invalidReason?: string | null;
  payer?: string | null;
}

export interface FacilitatorSettleResult {
  success: boolean;
  errorReason?: string | null;
  /** Settled transaction signature on success. */
  transaction?: string | null;
  network?: string | null;
  payer?: string | null;
}

function buildBody(txB64: string, req: FacilitatorPaymentRequirements) {
  return {
    x402Version: 2,
    paymentPayload: {
      x402Version: 2,
      scheme: req.scheme,
      network: req.network,
      payload: { transaction: txB64 },
    },
    paymentRequirements: req,
  };
}

async function postJson(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: text };
  }
}

/** Non-destructive pre-check: does the facilitator consider this payment valid? */
export async function facilitatorVerify(
  facilitatorUrl: string,
  txB64: string,
  req: FacilitatorPaymentRequirements,
): Promise<FacilitatorVerifyResult> {
  const { status, json } = await postJson(`${facilitatorUrl}/verify`, buildBody(txB64, req));
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { isValid: false, invalidReason: `facilitator /verify HTTP ${status}` };
  }
  return json as FacilitatorVerifyResult;
}

/** Broadcast: facilitator co-signs as fee-payer and submits the tx on-chain. */
export async function facilitatorSettle(
  facilitatorUrl: string,
  txB64: string,
  req: FacilitatorPaymentRequirements,
): Promise<FacilitatorSettleResult> {
  const { status, json } = await postJson(`${facilitatorUrl}/settle`, buildBody(txB64, req));
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { success: false, errorReason: `facilitator /settle HTTP ${status}` };
  }
  return json as FacilitatorSettleResult;
}
