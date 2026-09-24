import { CoreError } from "./errors";
import { toI64 } from "./int";
import { BPS_DENOM } from "./money";
import { WINDOW_COUNT, WINDOW_LOWER_DAYS } from "./windows";

/** One refund step, exactly as written on-chain (`Tier { secs_before: u32, refund_bps: u16 }`). */
export interface Tier {
  secs_before: number;
  refund_bps: number;
}

export const MAX_TIERS = 8;
const U32_MAX = 0xffff_ffff;

export type TemplateId = "flexible" | "standard" | "nonrefundable";

/** Menu order; also the dedupe preference order (pricing §5). */
export const TEMPLATE_IDS: readonly TemplateId[] = ["flexible", "standard", "nonrefundable"];

export interface Template {
  id: TemplateId;
  name: string;
  tiers: readonly Tier[];
  description: string;
}

export const TEMPLATES: Readonly<Record<TemplateId, Template>> = {
  flexible: {
    id: "flexible",
    name: "Flexible",
    tiers: [
      { secs_before: 86_400, refund_bps: 10_000 },
      { secs_before: 0, refund_bps: 5_000 },
    ],
    description: "Full refund until 24 h before check-in, then 50%",
  },
  standard: {
    id: "standard",
    name: "Standard",
    tiers: [
      { secs_before: 604_800, refund_bps: 10_000 },
      { secs_before: 259_200, refund_bps: 5_000 },
      { secs_before: 0, refund_bps: 0 },
    ],
    description: "Full refund until 7 days before check-in, 50% until 3 days, then none",
  },
  nonrefundable: {
    id: "nonrefundable",
    name: "Non-refundable",
    tiers: [{ secs_before: 0, refund_bps: 0 }],
    description: "No refund",
  },
};

export function isTemplateId(s: unknown): s is TemplateId {
  return typeof s === "string" && (TEMPLATE_IDS as readonly string[]).includes(s);
}

/**
 * Same rules as the program's `validate_tiers`: 1..=8 entries, `secs_before` strictly
 * descending and ending at 0, each `refund_bps ≤ 10_000`; plus the u32/u16 ranges the
 * Rust types enforce by construction.
 */
export function validateTiers(tiers: readonly Tier[]): void {
  const fail = (why: string): never => {
    throw new CoreError("InvalidTiers", why);
  };
  if (tiers.length < 1 || tiers.length > MAX_TIERS) fail(`need 1..=${MAX_TIERS} tiers, got ${tiers.length}`);
  tiers.forEach((t, i) => {
    if (!Number.isInteger(t.secs_before) || t.secs_before < 0 || t.secs_before > U32_MAX) {
      fail(`tier ${i}: secs_before must be a u32`);
    }
    if (!Number.isInteger(t.refund_bps) || t.refund_bps < 0 || t.refund_bps > BPS_DENOM) {
      fail(`tier ${i}: refund_bps must be 0..=${BPS_DENOM}`);
    }
    const prev = tiers[i - 1];
    if (prev && prev.secs_before <= t.secs_before) fail(`tier ${i}: secs_before must be strictly descending`);
  });
  if (tiers[tiers.length - 1]?.secs_before !== 0) fail("last tier must have secs_before == 0");
}

/**
 * First tier whose threshold the remaining time reaches. Compared as i64 (bigint here), so a
 * `secs_before` beyond the u32 range still matches the first tier. No match (negative
 * `secs_before`) is `InvalidTiers`, as in the program.
 */
export function refundBpsFor(tiers: readonly Tier[], secsBefore: bigint | number): number {
  const s = toI64(secsBefore, "secs_before");
  const tier = tiers.find((t) => s >= BigInt(t.secs_before));
  if (!tier) throw new CoreError("InvalidTiers", `no tier matches secs_before ${s}`);
  return tier.refund_bps;
}

/**
 * Refund fraction r_k for each model window (pricing §1/§4): the refund at the window's lower
 * bound, which is exact whenever tier thresholds are window boundaries.
 */
export function perWindowRefund(tiers: readonly Tier[]): number[] {
  return Array.from({ length: WINDOW_COUNT }, (_, k) =>
    refundBpsFor(tiers, WINDOW_LOWER_DAYS[k]! * 86_400) / BPS_DENOM,
  );
}

/** Which template a tier schedule is (e.g. read back from chain), or null for a custom one. */
export function matchTemplate(tiers: readonly Tier[]): TemplateId | null {
  const same = (a: readonly Tier[]) =>
    a.length === tiers.length &&
    a.every((t, i) => t.secs_before === tiers[i]?.secs_before && t.refund_bps === tiers[i]?.refund_bps);
  return TEMPLATE_IDS.find((id) => same(TEMPLATES[id].tiers)) ?? null;
}
