import { CoreError } from "./errors";
import { adaptRequest, type BuyerType, type ModelRequest, type RequestFeatures } from "./features";
import { assessRisk, type HazardModel } from "./model";
import { BPS_DENOM, formatMinor, priceFromMultiplier } from "./money";
import { isTemplateId, perWindowRefund, TEMPLATE_IDS, TEMPLATES, type TemplateId, type Tier } from "./tiers";
import { reachableWindows, WINDOW_COUNT } from "./windows";

/** pricing-and-risk-model.md §5: menu pricing with a per-request anchor, integer bps money. */

export interface PricingPolicy {
  reference_template: TemplateId;
  enabled_templates: TemplateId[];
  resale_bps: number[];
  min_mult_bps: number;
  max_mult_bps: number;
}

export const DEFAULT_RESALE_BPS: readonly number[] = [9000, 8000, 6500, 4500, 2500, 1000];
/** Suggested by the onboarding checklist for hotels below ~70% occupancy. */
export const LOW_OCCUPANCY_RESALE_BPS: readonly number[] = [5000, 4000, 3000, 2000, 1000, 0];

/** Defaults from data-model.md `hotels.policy`; copy before mutating. */
export const DEFAULT_POLICY: Readonly<PricingPolicy> = Object.freeze<PricingPolicy>({
  reference_template: "standard",
  enabled_templates: ["flexible", "standard", "nonrefundable"],
  resale_bps: [...DEFAULT_RESALE_BPS],
  min_mult_bps: 8500,
  max_mult_bps: 13000,
});

export const MIN_MULT_BPS_RANGE = [5000, 10000] as const;
export const MAX_MULT_BPS_RANGE = [10000, 20000] as const;
/** Full prepay in the MVP (ADR-0002). */
export const DEPOSIT_BPS = 10_000;
/** A template whose retained share 1 − c_T is at or below this is withheld. */
const MIN_RETAINED = 0.05;

function bpsInRange(v: unknown, [min, max]: readonly [number, number]): boolean {
  return Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
}

/**
 * Validates and normalizes a hotel policy (API + DB use the same rules). The reference template
 * must be enabled: it anchors the prices and is always shown.
 */
export function validatePolicy(input: unknown): PricingPolicy {
  const fail = (why: string): never => {
    throw new CoreError("InvalidPolicy", why);
  };
  if (typeof input !== "object" || input === null) return fail("policy must be an object");
  const p = input as Record<string, unknown>;
  if (!isTemplateId(p.reference_template)) fail("reference_template must be a known template");
  const enabled = p.enabled_templates;
  if (!Array.isArray(enabled) || enabled.length === 0 || !enabled.every(isTemplateId) || new Set(enabled).size !== enabled.length) {
    fail("enabled_templates must be a non-empty list of distinct known templates");
  }
  if (!(enabled as string[]).includes(p.reference_template as string)) fail("reference_template must be enabled");
  const resale = p.resale_bps;
  if (!Array.isArray(resale) || resale.length !== WINDOW_COUNT || !resale.every((b) => bpsInRange(b, [0, BPS_DENOM]))) {
    fail(`resale_bps must be ${WINDOW_COUNT} integers in 0..=${BPS_DENOM}`);
  }
  if (!bpsInRange(p.min_mult_bps, MIN_MULT_BPS_RANGE)) fail(`min_mult_bps must be in ${MIN_MULT_BPS_RANGE.join("..=")}`);
  if (!bpsInRange(p.max_mult_bps, MAX_MULT_BPS_RANGE)) fail(`max_mult_bps must be in ${MAX_MULT_BPS_RANGE.join("..=")}`);
  return {
    reference_template: p.reference_template as TemplateId,
    enabled_templates: TEMPLATE_IDS.filter((id) => (enabled as string[]).includes(id)),
    resale_bps: [...(resale as number[])],
    min_mult_bps: p.min_mult_bps as number,
    max_mult_bps: p.max_mult_bps as number,
  };
}

/** What pricing needs from a risk model; `assessRisk` returns a superset. */
export interface RiskEstimate {
  model_version: string;
  hazard: (number | null)[];
  q: number[];
  p_cancel: number;
  p_uncalibrated?: (number | null)[];
}

export type HazardProvider = (request: ModelRequest) => RiskEstimate;

export function modelProvider(model: HazardModel): HazardProvider {
  return (request) => assessRisk(model, request);
}

/** A priced contract, exactly as it goes into the signed quote body. */
export interface QuoteOption {
  id: TemplateId;
  price_minor: string;
  deposit_bps: number;
  tiers: Tier[];
}

/**
 * Why a template is not offered: its multiplier is out of bounds, its reachable terms duplicate a
 * shown template, or its price exceeds the deployment's per-booking cap (pilot `AMOUNT_CAP_MINOR`).
 */
export type WithheldReason = "risk_exceeds_bounds" | "duplicate_terms" | "over_amount_cap";

export interface ExplainOption {
  id: TemplateId;
  risk_cost: number;
  /** m_T = (1 − c_R) / (1 − c_T); null when 1 − c_T is 0. */
  multiplier: number | null;
  m_bps: number | null;
  price_minor: string | null;
  /** price · (1 − c_T), rounded to a base unit; informational. */
  expected_revenue_minor: string | null;
  clamped: "floor" | null;
  withheld: WithheldReason | null;
  /** For `duplicate_terms`: the shown template with identical reachable-window refunds. */
  same_as: TemplateId | null;
}

/** Unsigned, informational (quote-protocol.md): floats live here, never in the signed body. */
export interface Explain {
  model_version: string;
  p_cancel: number;
  hazard: (number | null)[];
  q: number[];
  p_uncalibrated: (number | null)[] | null;
  lead_time: number;
  buyer_type: BuyerType;
  reference_template: TemplateId;
  resale_bps: number[];
  options: ExplainOption[];
  features: RequestFeatures;
}

export interface PriceMenuInput {
  provider: HazardProvider;
  request: ModelRequest;
  policy: PricingPolicy;
  /** B: sum of nightly base rates, base units. */
  basePriceMinor: bigint;
  /**
   * Largest payable price, base units (pilot cap). Priced options above it are withheld as
   * `over_amount_cap`, keeping their price in the explain block; absent = no cap.
   */
  amountCapMinor?: bigint;
}

export interface PriceMenu {
  options: QuoteOption[];
  explain: Explain;
}

/**
 * m_bps = round_half_up(m · 10⁴). The 1e-9 bps slack absorbs binary floating-point noise so a
 * multiplier that is exactly half a bp in decimal (e.g. 0.95885 → 9588.5) rounds up as specified.
 */
function roundHalfUpBps(m: number): number {
  return Math.floor(m * BPS_DENOM + 0.5 + 1e-9);
}

/** c_T = Σ_k q_k · max(0, r_T,k − s_k). */
export function riskCost(q: readonly number[], refund: readonly number[], resaleBps: readonly number[]): number {
  let c = 0;
  for (let k = 0; k < WINDOW_COUNT; k++) c += q[k]! * Math.max(0, refund[k]! - resaleBps[k]! / BPS_DENOM);
  return c;
}

function checkRisk(risk: RiskEstimate, reachable: readonly boolean[]): void {
  const ok =
    risk.q.length === WINDOW_COUNT &&
    risk.hazard.length === WINDOW_COUNT &&
    risk.q.every((qk, k) => Number.isFinite(qk) && qk >= 0 && qk <= 1 && (reachable[k] || qk === 0)) &&
    Number.isFinite(risk.p_cancel);
  if (!ok) throw new CoreError("InvalidInput", "risk estimate must have 6 finite q in [0,1], 0 on unreachable windows");
}

export function priceMenu({ provider, request, policy: rawPolicy, basePriceMinor, amountCapMinor }: PriceMenuInput): PriceMenu {
  const policy = validatePolicy(rawPolicy);
  if (basePriceMinor <= 0n) throw new CoreError("InvalidAmount", "base price must be positive");
  const features = adaptRequest(request);
  const lead = features.lead_time;
  const reachable = reachableWindows(lead);
  const risk = provider(request);
  checkRisk(risk, reachable);

  const R = policy.reference_template;
  const refund = (id: TemplateId) => perWindowRefund(TEMPLATES[id].tiers);
  const cost = (id: TemplateId) => riskCost(risk.q, refund(id), policy.resale_bps);
  const retainedR = 1 - cost(R);

  // Templates identical on every reachable window collapse to one: R if present, else menu order.
  const reachableKey = (id: TemplateId) => refund(id).filter((_, k) => reachable[k]).join();
  const shownFor = new Map<string, TemplateId>();
  for (const id of [R, ...policy.enabled_templates.filter((t) => t !== R)]) {
    if (!shownFor.has(reachableKey(id))) shownFor.set(reachableKey(id), id);
  }

  const explainOptions = policy.enabled_templates.map((id): ExplainOption => {
    const c = cost(id);
    const base: ExplainOption = {
      id,
      risk_cost: c,
      multiplier: null,
      m_bps: null,
      price_minor: null,
      expected_revenue_minor: null,
      clamped: null,
      withheld: null,
      same_as: null,
    };
    const keep = shownFor.get(reachableKey(id))!;
    if (keep !== id) return { ...base, withheld: "duplicate_terms", same_as: keep };

    const isRef = id === R;
    const multiplier = isRef ? 1 : retainedR / (1 - c);
    const finite = Number.isFinite(multiplier);
    const rawBps = isRef ? BPS_DENOM : finite ? roundHalfUpBps(multiplier) : null;
    const priced = { ...base, multiplier: finite ? multiplier : null, m_bps: rawBps };
    if (rawBps === null || (!isRef && (1 - c <= MIN_RETAINED || rawBps > policy.max_mult_bps))) {
      return { ...priced, withheld: "risk_exceeds_bounds" };
    }
    // R is 10000 ≥ min_mult_bps by policy bounds, so only other templates can be floored.
    const mBps = Math.max(rawBps, policy.min_mult_bps);
    const price = priceFromMultiplier(basePriceMinor, mBps);
    return {
      ...priced,
      m_bps: mBps,
      clamped: mBps > rawBps ? "floor" : null,
      price_minor: formatMinor(price),
      expected_revenue_minor: BigInt(Math.round(Number(price) * (1 - c))).toString(),
      withheld: amountCapMinor !== undefined && price > amountCapMinor ? "over_amount_cap" : null,
    };
  });

  // `over_amount_cap` options keep their price above; only offered options reach the signed body.
  const options = explainOptions
    .filter((o) => o.withheld === null)
    .map((o): QuoteOption => ({
      id: o.id,
      price_minor: o.price_minor!,
      deposit_bps: DEPOSIT_BPS,
      tiers: TEMPLATES[o.id].tiers.map((t) => ({ ...t })),
    }));

  return {
    options,
    explain: {
      model_version: risk.model_version,
      p_cancel: risk.p_cancel,
      hazard: [...risk.hazard],
      q: [...risk.q],
      p_uncalibrated: risk.p_uncalibrated ? [...risk.p_uncalibrated] : null,
      lead_time: lead,
      buyer_type: request.buyer_type,
      reference_template: R,
      resale_bps: [...policy.resale_bps],
      options: explainOptions,
      features,
    },
  };
}
