import { describe, expect, it } from "vitest";
import { adaptRequest, assessRisk, featureVector, hazardFromRaw, loadModel, rawScore, type ModelRequest } from "../src/index";
import { readJson, repoFileExists } from "./helpers";

/**
 * TS evaluator + adapter vs Python (pricing-and-risk-model.md §3, parity v2).
 * `raw` must match exactly; hazard / q / p_cancel to 1e-12 absolute; features exactly.
 */
const MODEL = "packages/core/model/model.json";
const PARITY = "packages/core/model/parity.json";
const TOL = 1e-12;

interface Parity {
  format: string;
  model_version: string;
  vectors: { x: number[]; raw: number; hazard: number }[];
  requests: {
    request: ModelRequest;
    features: Record<string, number>;
    /** Not required by the spec; compared exactly when present. */
    raw?: (number | null)[];
    hazard: (number | null)[];
    q: number[];
    p_cancel: number;
  }[];
}

const present = repoFileExists(MODEL) && repoFileExists(PARITY);

function parityTests() {
  const model = loadModel(readJson(MODEL));
  const parity = readJson<Parity>(PARITY);

  it("describes this model", () => {
    expect(parity.format).toBe("stumari-parity/2");
    expect(parity.model_version).toBe(model.version);
    expect(parity.vectors.length).toBeGreaterThanOrEqual(500);
    expect(parity.requests.length).toBeGreaterThanOrEqual(30);
  });

  it("vectors: raw exact, hazard within 1e-12", () => {
    parity.vectors.forEach((v, i) => {
      const raw = rawScore(model, v.x);
      expect(raw, `vector ${i} raw`).toBe(v.raw);
      expect(Math.abs(hazardFromRaw(model, raw) - v.hazard), `vector ${i} hazard`).toBeLessThanOrEqual(TOL);
    });
  });

  it("requests: features exact; hazard, q, p_cancel within 1e-12", () => {
    parity.requests.forEach((r, i) => {
      const where = `request ${i} ${JSON.stringify(r.request)}`;
      // parity features are the booking-level columns (all but window_0..5 and exposure_days);
      // window 5 is always reachable, so its vector carries them.
      const x = featureVector(model, adaptRequest(r.request), 5);
      const columns = new Map(model.featureOrder.map((name, j) => [name, x[j]]));
      expect(Object.keys(r.features).length, `${where} feature count`).toBe(model.featureOrder.length - 7);
      for (const [name, want] of Object.entries(r.features)) {
        expect(columns.get(name), `${where} feature ${name}`).toBe(want);
      }
      const risk = assessRisk(model, r.request);
      if (r.raw) expect(risk.raw, `${where} raw`).toEqual(r.raw);
      r.hazard.forEach((h, k) => {
        if (h === null) expect(risk.hazard[k], `${where} hazard[${k}]`).toBeNull();
        else expect(Math.abs(risk.hazard[k]! - h), `${where} hazard[${k}]`).toBeLessThanOrEqual(TOL);
      });
      r.q.forEach((q, k) => expect(Math.abs(risk.q[k]! - q), `${where} q[${k}]`).toBeLessThanOrEqual(TOL));
      expect(Math.abs(risk.p_cancel - r.p_cancel), `${where} p_cancel`).toBeLessThanOrEqual(TOL);
    });
  });
}

if (present) describe("parity with ml/ (model.json + parity.json)", parityTests);
else {
  describe("parity with ml/", () => {
    it.skip(`SKIPPED: ${MODEL} and/or ${PARITY} not found; run the ml/ export to produce them`, () => {});
  });
}
