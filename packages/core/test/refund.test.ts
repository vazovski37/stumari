import { describe, expect, it } from "vitest";
import {
  CoreError,
  matchTemplate,
  minRefundForCancel,
  perWindowRefund,
  refundBpsFor,
  splitCancel,
  splitRelease,
  splitResolve,
  TEMPLATES,
  validateTiers,
  type BookingStatus,
  type Split,
  type Tier,
} from "../src/index";
import { readJson } from "./helpers";

interface Expect {
  error?: string;
  secs_before?: number;
  refund_bps?: number;
  refund?: number;
  fee?: number;
  hotel_net?: number;
}
interface Vectors {
  templates: Record<string, Tier[]>;
  cancel: {
    name: string;
    status: BookingStatus;
    template: string;
    amount: number;
    fee_bps: number;
    checkin_ts: number;
    now: number;
    expect: Expect;
  }[];
  release: { name: string; amount: number; fee_bps: number; expect: Expect }[];
  resolve: { name: string; amount: number; fee_bps: number; guest_bps: number; expect: Expect }[];
  tiers_validation: { valid: Tier[][]; invalid: { name: string; tiers: Tier[] }[] };
}

const vectors = readJson<Vectors>("spec/vectors/refund.json");

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof CoreError) return e.code;
    throw e;
  }
  return undefined;
}

function expectSplit(amount: number, got: Split, want: Expect) {
  expect({ refund: got.refund, fee: got.fee, hotel_net: got.hotelNet }).toEqual({
    refund: BigInt(want.refund!),
    fee: BigInt(want.fee!),
    hotel_net: BigInt(want.hotel_net!),
  });
  expect(got.refund + got.hotelNet + got.fee).toBe(BigInt(amount));
}

describe("spec/vectors/refund.json", () => {
  it("templates match TEMPLATES", () => {
    for (const [id, tiers] of Object.entries(vectors.templates)) {
      expect(TEMPLATES[id as keyof typeof TEMPLATES].tiers).toEqual(tiers);
    }
  });

  it.each(vectors.cancel.map((c) => [c.name, c] as const))("cancel %s", (_, c) => {
    const input = {
      status: c.status,
      amount: BigInt(c.amount),
      feeBps: c.fee_bps,
      tiers: vectors.templates[c.template]!,
      checkinTs: c.checkin_ts,
      now: c.now,
    };
    if (c.expect.error) {
      expect(errorCode(() => splitCancel(input))).toBe(c.expect.error);
      return;
    }
    const got = splitCancel(input);
    expect(got.secsBefore).toBe(BigInt(c.expect.secs_before!));
    expect(got.refundBps).toBe(c.expect.refund_bps);
    expectSplit(c.amount, got, c.expect);
    // bigint timestamps give the same answer as numbers
    expect(splitCancel({ ...input, checkinTs: BigInt(c.checkin_ts), now: BigInt(c.now) })).toEqual(got);
  });

  it.each(vectors.release.map((c) => [c.name, c] as const))("release %s", (_, c) => {
    expectSplit(c.amount, splitRelease({ amount: BigInt(c.amount), feeBps: c.fee_bps }), c.expect);
  });

  it.each(vectors.resolve.map((c) => [c.name, c] as const))("resolve %s", (_, c) => {
    const run = () => splitResolve({ amount: BigInt(c.amount), feeBps: c.fee_bps, guestBps: c.guest_bps });
    if (c.expect.error) expect(errorCode(run)).toBe(c.expect.error);
    else expectSplit(c.amount, run(), c.expect);
  });

  it.each(vectors.tiers_validation.valid.map((t, i) => [i, t] as const))("valid tiers #%i", (_, tiers) => {
    expect(() => validateTiers(tiers)).not.toThrow();
  });

  it.each(vectors.tiers_validation.invalid.map((c) => [c.name, c.tiers] as const))("invalid tiers %s", (_, tiers) => {
    expect(errorCode(() => validateTiers(tiers))).toBe("InvalidTiers");
  });
});

describe("tiers", () => {
  it("compares secs_before as i64 beyond u32", () => {
    const tiers = [
      { secs_before: 0xffff_ffff, refund_bps: 10_000 },
      { secs_before: 0, refund_bps: 0 },
    ];
    expect(refundBpsFor(tiers, 2n ** 32n)).toBe(10_000);
    expect(refundBpsFor(tiers, 0xffff_ffff - 1)).toBe(0);
    expect(errorCode(() => refundBpsFor(tiers, -1))).toBe("InvalidTiers");
    expect(errorCode(() => refundBpsFor(tiers, 1.5))).toBe("InvalidInput");
  });

  it("rejects values outside the on-chain integer types", () => {
    expect(errorCode(() => validateTiers([{ secs_before: 2 ** 32, refund_bps: 1 }, { secs_before: 0, refund_bps: 0 }]))).toBe(
      "InvalidTiers",
    );
    expect(errorCode(() => validateTiers([{ secs_before: 0, refund_bps: 0.5 }]))).toBe("InvalidTiers");
    expect(errorCode(() => validateTiers([{ secs_before: 0, refund_bps: -1 }]))).toBe("InvalidTiers");
  });

  it("per-window refund fractions match pricing §4", () => {
    expect(perWindowRefund(TEMPLATES.flexible.tiers)).toEqual([1, 1, 1, 1, 1, 0.5]);
    expect(perWindowRefund(TEMPLATES.standard.tiers)).toEqual([1, 1, 1, 0.5, 0, 0]);
    expect(perWindowRefund(TEMPLATES.nonrefundable.tiers)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("every template is valid and recognisable from its tiers", () => {
    for (const t of Object.values(TEMPLATES)) {
      expect(() => validateTiers(t.tiers)).not.toThrow();
      expect(matchTemplate(t.tiers.map((x) => ({ ...x })))).toBe(t.id);
      expect(t.description.length).toBeGreaterThan(0);
    }
    expect(matchTemplate([{ secs_before: 0, refund_bps: 100 }])).toBeNull();
  });
});

describe("payout guards", () => {
  const base = { amount: 100_000_000n, feeBps: 150, tiers: TEMPLATES.standard.tiers, checkinTs: 2_000_000_000, now: 1_990_000_000 };

  it("rejects non-cancellable statuses and bad bps", () => {
    expect(errorCode(() => splitCancel({ ...base, status: "released" }))).toBe("InvalidStatus");
    expect(errorCode(() => splitCancel({ ...base, status: "confirmed", feeBps: 10_001 }))).toBe("InvalidBps");
    expect(errorCode(() => splitRelease({ amount: 1n, feeBps: 10_001 }))).toBe("InvalidBps");
    expect(errorCode(() => splitRelease({ amount: -1n, feeBps: 0 }))).toBe("InvalidAmount");
    expect(errorCode(() => splitRelease({ amount: 2n ** 64n, feeBps: 0 }))).toBe("InvalidAmount");
  });

  it("holds the invariant at u64 extremes", () => {
    for (const amount of [1n, 7n, 10_001n, 2n ** 64n - 1n]) {
      for (const guestBps of [0, 1, 3333, 9999, 10_000]) {
        const s = splitResolve({ amount, feeBps: 1000, guestBps });
        expect(s.refund + s.hotelNet + s.fee).toBe(amount);
      }
    }
  });

  describe("minRefundForCancel", () => {
    const booking = { amount: 100_000_000n, feeBps: 150, tiers: TEMPLATES.standard.tiers, checkinTs: 2_000_000_000 };

    it("uses the schedule at now + 90 s, so a boundary about to pass counts against the guest", () => {
      // 604_850 s before check-in: 100% now, but 50% at now + 90 s.
      expect(minRefundForCancel({ booking, now: 2_000_000_000 - 604_850 })).toBe(50_000_000n);
      expect(minRefundForCancel({ booking, now: 2_000_000_000 - 604_890 })).toBe(100_000_000n);
    });

    it("ignores Pending (never promises the 100% pending refund)", () => {
      expect(minRefundForCancel({ booking, now: 2_000_000_000 - 100_000 })).toBe(0n);
    });

    it("applies the last tier inside the final 90 s and refuses at check-in", () => {
      const flex = { ...booking, tiers: TEMPLATES.flexible.tiers };
      expect(minRefundForCancel({ booking: flex, now: 2_000_000_000 - 30 })).toBe(50_000_000n);
      expect(errorCode(() => minRefundForCancel({ booking: flex, now: 2_000_000_000 }))).toBe("TooLateToCancel");
    });
  });
});
