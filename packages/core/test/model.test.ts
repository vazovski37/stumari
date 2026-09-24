import { describe, expect, it } from "vitest";
import {
  adaptRequest,
  assessRisk,
  checkinTs,
  CoreError,
  exposureDays,
  featureVector,
  hazardFromRaw,
  loadModel,
  oneHotColumnName,
  logistic,
  pCancel,
  qVector,
  rawScore,
  reachableWindows,
  walletHistoryFeatures,
  type ModelRequest,
} from "../src/index";
import tinyJson from "./fixtures/tiny-model.json" with { type: "json" };

const tiny = loadModel(tinyJson);
const clone = <T>(v: T): T => structuredClone(v);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof CoreError ? e.code : "not-a-CoreError";
  }
  return undefined;
};

/** The parity.json illustrative request: L = 35, Thursday arrival, 2 weekend nights. */
const illustrative: ModelRequest = {
  issued_at: 1_790_798_400,
  checkin_ts: 1_793_872_800,
  checkin_date: "2026-11-05",
  checkout_date: "2026-11-08",
  adults: 2,
  children: 0,
  buyer_type: "guest",
  hotel_type: "City Hotel",
  meal: "BB",
  is_repeated_guest: 0,
  previous_bookings_not_canceled: 0,
};

function requestWithLead(days: number, extra: Partial<ModelRequest> = {}): ModelRequest {
  const checkin = checkinTs("2026-11-05", "14:00", "Asia/Tbilisi");
  return { ...illustrative, checkin_ts: checkin, issued_at: checkin - days * 86_400 - 60, ...extra };
}

describe("windows", () => {
  it("reachability and exposure follow pricing §2", () => {
    expect(reachableWindows(35)).toEqual([true, true, true, true, true, true]);
    expect(reachableWindows(20)).toEqual([false, true, true, true, true, true]);
    expect(reachableWindows(0)).toEqual([false, false, false, false, false, true]);
    expect([0, 1, 2, 3, 4, 5].map((k) => exposureDays(35, k))).toEqual([5, 16, 7, 4, 2, 1]);
    expect([0, 1, 2, 3, 4, 5].map((k) => exposureDays(2, k))).toEqual([0, 0, 0, 0, 1, 1]);
    expect(exposureDays(0, 5)).toBe(0);
  });
});

describe("adapter", () => {
  it("maps the illustrative request", () => {
    expect(adaptRequest(illustrative)).toEqual({
      lead_time: 35,
      arrival_month: 11,
      arrival_dow: 3,
      weekend_nights: 2,
      week_nights: 1,
      adults: 2,
      children: 0,
      is_repeated_guest: 0,
      previous_bookings_not_canceled: 0,
      market_segment: "Direct",
      distribution_channel: "Direct",
      customer_type: "Transient",
      hotel: "City Hotel",
      meal: "BB",
    });
  });

  it("prices agents as direct buyers (ADR-0014)", () => {
    const agent = adaptRequest({ ...illustrative, buyer_type: "agent" });
    expect(agent).toEqual(adaptRequest(illustrative));
  });

  it("passes categories through (the dataset's Undefined → SC is not a serving rule), caps previous bookings at 3", () => {
    const f = adaptRequest({ ...illustrative, meal: "Undefined", is_repeated_guest: 1, previous_bookings_not_canceled: 7 });
    expect(f.meal).toBe("Undefined");
    expect(f.previous_bookings_not_canceled).toBe(3);
  });

  it("names one-hot columns like adapter.py column_name", () => {
    expect(oneHotColumnName("market_segment", "Offline TA/TO")).toBe("market_segment_offline_ta_to");
    expect(oneHotColumnName("customer_type", "Transient-Party")).toBe("customer_type_transient_party");
    expect(oneHotColumnName("hotel", "City Hotel")).toBe("hotel_city_hotel");
    expect(oneHotColumnName("meal", "_BB_")).toBe("meal_bb");
    expect(oneHotColumnName("window", "3")).toBe("window_3");
  });

  it("uses wallet history only with a buyer wallet", () => {
    expect(walletHistoryFeatures(null, 5)).toEqual({ is_repeated_guest: 0, previous_bookings_not_canceled: 0 });
    expect(walletHistoryFeatures("Wallet111", 0)).toEqual({ is_repeated_guest: 0, previous_bookings_not_canceled: 0 });
    expect(walletHistoryFeatures("Wallet111", 2)).toEqual({ is_repeated_guest: 1, previous_bookings_not_canceled: 2 });
    expect(walletHistoryFeatures("Wallet111", 9)).toEqual({ is_repeated_guest: 1, previous_bookings_not_canceled: 3 });
  });

  it("rejects impossible requests", () => {
    expect(code(() => adaptRequest({ ...illustrative, checkout_date: "2026-11-05" }))).toBe("InvalidInput");
    expect(code(() => adaptRequest({ ...illustrative, issued_at: illustrative.checkin_ts + 1 }))).toBe("InvalidInput");
    expect(code(() => adaptRequest({ ...illustrative, buyer_type: "bot" as "guest" }))).toBe("InvalidInput");
    expect(code(() => adaptRequest({ ...illustrative, adults: 1.5 }))).toBe("InvalidInput");
    expect(code(() => adaptRequest({ ...illustrative, adults: 0 }))).toBe("InvalidInput");
    expect(code(() => adaptRequest({ ...illustrative, is_repeated_guest: 2 }))).toBe("InvalidInput");
  });
});

describe("evaluator (tiny fixture)", () => {
  const featureIndex = (name: string) => tiny.featureOrder.indexOf(name);

  it("builds the vector by feature name, with person-period window features", () => {
    const f = adaptRequest(requestWithLead(2));
    const x = featureVector(tiny, f, 4);
    expect(x[featureIndex("lead_time")]).toBe(2);
    expect(x[featureIndex("window_4")]).toBe(1);
    expect(x[featureIndex("window_5")]).toBe(0);
    expect(x[featureIndex("exposure_days")]).toBe(1);
    expect(x[featureIndex("market_segment_direct")]).toBe(1);
    expect(x[featureIndex("market_segment_online_ta")]).toBe(0);
    expect(x[featureIndex("hotel_city_hotel")]).toBe(1);
    expect(x[featureIndex("meal_bb")]).toBe(1);
  });

  it("unknown categories give an all-zero one-hot group", () => {
    const f = adaptRequest(requestWithLead(2, { hotel_type: "Boutique", meal: "XX" }));
    const x = featureVector(tiny, f, 5);
    for (const name of ["hotel_city_hotel", "hotel_resort_hotel", "meal_bb", "meal_hb", "meal_fb", "meal_sc"]) {
      expect(x[featureIndex(name)], name).toBe(0);
    }
  });

  it("sums trees sequentially, splitting on x <= t", () => {
    const f = adaptRequest(requestWithLead(2));
    // window 4: -1.5 (lead ≤ 30.5) - 0.125 (not window 5, BB) + 0.0625 + 0.125 (exposure ≤ 10.5, new guest)
    expect(rawScore(tiny, featureVector(tiny, f, 4))).toBe(-1.4375);
    // window 5: -1.5 + 0.5 + 0.0625 + 0.125
    expect(rawScore(tiny, featureVector(tiny, f, 5))).toBe(-0.8125);
    const repeat = adaptRequest(requestWithLead(40, { is_repeated_guest: 1, previous_bookings_not_canceled: 1 }));
    // window 0, exposure 10: lead > 30.5, not window 5 with BB, repeat guest
    expect(rawScore(tiny, featureVector(tiny, repeat, 0))).toBe(-0.75 - 0.125 + 0.0625 - 0.5);
    // window 1, exposure 16 > 10.5
    expect(rawScore(tiny, featureVector(tiny, repeat, 1))).toBe(-0.75 - 0.125 + 0.0625 - 0.25);
  });

  it("calibrates with numpy.interp semantics (values from numpy 2.x)", () => {
    const cases: [number, number][] = [
      [-5, 0.01],
      [-3, 0.01],
      [-2.5, 0.015],
      [-1.4375, 0.036875000000000005],
      [-1, 0.08],
      [-1.0000000000000002, 0.049999999999999996],
      [-0.8125, 0.10250000000000001],
      [0, 0.2],
      [1, 0.4],
      [2, 0.4],
    ];
    for (const [raw, h] of cases) expect(hazardFromRaw(tiny, raw), String(raw)).toBe(h);
  });

  it("q, P(cancel) and the uncalibrated link", () => {
    expect(qVector([null, null, null, null, 0.1, 0.5])).toEqual([0, 0, 0, 0, 0.1, 0.45]);
    expect(qVector([0.01, 0.02, 0.02, 0.03, 0.02, 0.01])[5]).toBeCloseTo(0.009038266776, 15);
    expect(pCancel(qVector([0.01, 0.02, 0.02, 0.03, 0.02, 0.01]))).toBeCloseTo(0.105211589176, 15);
    expect(logistic(0)).toBe(0.5);

    const r = assessRisk(tiny, requestWithLead(2));
    expect(r.model_version).toBe("hazard-gbdt-tiny-fixture");
    expect(r.lead_time).toBe(2);
    expect(r.hazard).toEqual([null, null, null, null, 0.036875000000000005, 0.10250000000000001]);
    expect(r.q.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(r.q[5]).toBe(0.10250000000000001 * (1 - 0.036875000000000005));
    expect(r.p_cancel).toBe(r.q[4]! + r.q[5]!);
    expect(r.raw).toEqual([null, null, null, null, -1.4375, -0.8125]);
    expect(r.p_uncalibrated[4]).toBe(logistic(-1.4375));
  });

  it("throws on non-finite or mis-sized input", () => {
    const x = featureVector(tiny, adaptRequest(requestWithLead(2)), 4);
    x[0] = Number.NaN;
    expect(code(() => rawScore(tiny, x))).toBe("InvalidInput");
    expect(code(() => rawScore(tiny, [1, 2, 3]))).toBe("InvalidInput");
    expect(code(() => hazardFromRaw(tiny, Infinity))).toBe("InvalidInput");
  });
});

describe("loadModel validation", () => {
  const broken = (mutate: (m: typeof tinyJson & Record<string, unknown>) => void) => {
    const m = clone(tinyJson) as typeof tinyJson & Record<string, unknown>;
    mutate(m);
    return code(() => loadModel(m));
  };

  it("accepts the fixture", () => {
    expect(tiny.featureOrder).toHaveLength(27);
    expect(tiny.trees).toHaveLength(4);
  });

  it("rejects malformed artifacts", () => {
    expect(broken((m) => (m.format = "stumari-gbdt-hazard/1"))).toBe("InvalidModel");
    expect(broken((m) => (m.init_score = 0.5))).toBe("InvalidModel");
    expect(broken((m) => (m.link = "identity"))).toBe("InvalidModel");
    expect(broken((m) => (m.windows.lower_days = [30, 14, 7, 3, 1]))).toBe("InvalidModel");
    expect(broken((m) => m.feature_order.push("mystery"))).toBe("InvalidModel");
    expect(broken((m) => (m.feature_order[0] = "lead_time_days"))).toBe("InvalidModel");
    expect(broken((m) => m.encoding.one_hot.meal.push("AI"))).toBe("InvalidModel");
    expect(broken((m) => (m.encoding.numeric[0] = "adr"))).toBe("InvalidModel");
    expect(broken((m) => ((m.trees[0]!.nodes[1] as { v: unknown }).v = "x"))).toBe("InvalidModel");
    expect(broken((m) => ((m.trees[0]!.nodes[0] as { f: number }).f = 27))).toBe("InvalidModel");
    expect(broken((m) => ((m.trees[0]!.nodes[0] as { l: number }).l = 0))).toBe("InvalidModel");
    expect(broken((m) => m.trees[0]!.nodes.push({ v: 1 }))).toBe("InvalidModel");
    expect(broken((m) => (m.calibration.x = [1, 0, 2, 3, 4, 5]))).toBe("InvalidModel");
    expect(broken((m) => (m.calibration.y = [0, 0, 0, 0, 0, 1.5]))).toBe("InvalidModel");
    expect(broken((m) => m.calibration.y.pop())).toBe("InvalidModel");
    expect(code(() => loadModel(null))).toBe("InvalidModel");
  });
});

describe("Platt calibration", () => {
  it("is logistic(a·raw + b), strictly increasing, and validated", () => {
    const json = clone(tinyJson) as unknown as Record<string, unknown>;
    json.calibration = { type: "platt_on_raw_margin", a: 1.25, b: -0.5 };
    const m = loadModel(json);
    expect(hazardFromRaw(m, 0.4)).toBe(1 / (1 + Math.exp(-(1.25 * 0.4 + -0.5))));
    const grid = [-3, -1, 0, 1, 3].map((r) => hazardFromRaw(m, r));
    grid.slice(1).forEach((h, i) => expect(h).toBeGreaterThan(grid[i]!));
    json.calibration = { type: "platt_on_raw_margin", a: 0, b: 0 };
    expect(code(() => loadModel(json))).toBe("InvalidModel");
    json.calibration = { type: "platt_on_raw_margin", a: 1, b: Number.NaN };
    expect(code(() => loadModel(json))).toBe("InvalidModel");
  });
});
