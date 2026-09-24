import { CoreError } from "./errors";
import {
  adaptRequest,
  CATEGORICAL_FEATURES,
  NUMERIC_REQUEST_FEATURES,
  oneHotColumnName,
  windowFeatures,
  type CategoricalFeature,
  type ModelRequest,
  type NumericRequestFeature,
  type RequestFeatures,
} from "./features";
import { isReachable, WINDOW_COUNT, WINDOW_LOWER_DAYS } from "./windows";

/**
 * Evaluator for `packages/core/model/model.json` (format `stumari-gbdt-hazard/2`,
 * pricing-and-risk-model.md §3): LightGBM trees summed sequentially → calibration of the raw
 * margin (Platt `1/(1+exp(-(a·raw+b)))` by default, or isotonic with `numpy.interp` semantics) →
 * per-window hazard.
 */
export const MODEL_FORMAT = "stumari-gbdt-hazard/2";

type Column =
  | { kind: "numeric"; key: NumericRequestFeature }
  | { kind: "exposure" }
  | { kind: "window"; k: number }
  | { kind: "category"; group: CategoricalFeature; value: string };

/** Flattened tree: `feature[i] < 0` marks a leaf whose value is `value[i]`. */
interface Tree {
  feature: Int32Array;
  threshold: Float64Array;
  left: Int32Array;
  right: Int32Array;
  value: Float64Array;
}

export interface HazardModel {
  version: string;
  featureOrder: readonly string[];
  /** The raw artifact (metrics, training info, population_q_test_mean …) for display. */
  artifact: Readonly<Record<string, unknown>>;
  readonly columns: readonly Column[];
  readonly trees: readonly Tree[];
  readonly calibration: Calibration;
}

/** `model.json` calibration block (ADR-0016: Platt is the exported default; isotonic kept for comparison). */
export type Calibration =
  | { kind: "platt"; a: number; b: number }
  | { kind: "isotonic"; x: readonly number[]; y: readonly number[] };

const invalid = (why: string): never => {
  throw new CoreError("InvalidModel", why);
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function finiteArray(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
    invalid(`${what} must be an array of finite numbers`);
  }
  return v as number[];
}

function stringArray(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string") || new Set(v).size !== v.length) {
    invalid(`${what} must be an array of unique strings`);
  }
  return v as string[];
}

/** Maps every `feature_order` name to how the adapter fills it (one-hot names via `oneHotColumnName`). */
function resolveColumns(featureOrder: string[], encoding: unknown): Column[] {
  if (!isObject(encoding) || !isObject(encoding.one_hot)) return invalid("encoding.numeric/one_hot missing");
  const byName = new Map<string, Column>();
  const add = (name: string, col: Column) => {
    if (byName.has(name)) invalid(`encoding produces duplicate feature name ${name}`);
    byName.set(name, col);
  };
  for (const key of stringArray(encoding.numeric, "encoding.numeric")) {
    if (key === "exposure_days") add(key, { kind: "exposure" });
    else if ((NUMERIC_REQUEST_FEATURES as readonly string[]).includes(key)) {
      add(key, { kind: "numeric", key: key as NumericRequestFeature });
    } else invalid(`unknown numeric feature ${key}`);
  }
  for (const [group, rawValues] of Object.entries(encoding.one_hot)) {
    const values = stringArray(rawValues, `encoding.one_hot.${group}`);
    if (group === "window") {
      if (values.join() !== "0,1,2,3,4,5") invalid("encoding.one_hot.window must be 0..5");
      values.forEach((v) => add(oneHotColumnName(group, v), { kind: "window", k: Number(v) }));
    } else if ((CATEGORICAL_FEATURES as readonly string[]).includes(group)) {
      values.forEach((v) =>
        add(oneHotColumnName(group, v), { kind: "category", group: group as CategoricalFeature, value: v }),
      );
    } else invalid(`unknown one-hot group ${group}`);
  }
  if (byName.size !== featureOrder.length) {
    invalid(`encoding defines ${byName.size} features but feature_order has ${featureOrder.length}`);
  }
  return featureOrder.map((name) => byName.get(name) ?? invalid(`feature_order entry ${name} is not in encoding`));
}

function compileTree(raw: unknown, index: number, featureCount: number): Tree {
  const nodes = isObject(raw) ? raw.nodes : undefined;
  if (!Array.isArray(nodes) || nodes.length === 0) return invalid(`tree ${index}: nodes must be a non-empty array`);
  const n = nodes.length;
  const tree: Tree = {
    feature: new Int32Array(n).fill(-1),
    threshold: new Float64Array(n),
    left: new Int32Array(n),
    right: new Int32Array(n),
    value: new Float64Array(n),
  };
  const isIndex = (v: unknown, bound: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < bound;
  nodes.forEach((node: unknown, i) => {
    const where = `tree ${index} node ${i}`;
    if (!isObject(node)) return invalid(`${where}: not an object`);
    if ("v" in node) {
      if (typeof node.v !== "number" || !Number.isFinite(node.v)) invalid(`${where}: leaf value must be finite`);
      tree.value[i] = node.v as number;
      return;
    }
    const { f, t, l, r } = node;
    if (!isIndex(f, featureCount)) invalid(`${where}: feature index out of range`);
    if (typeof t !== "number" || !Number.isFinite(t)) invalid(`${where}: threshold must be finite`);
    if (!isIndex(l, n) || !isIndex(r, n)) invalid(`${where}: child index out of range`);
    tree.feature[i] = f as number;
    tree.threshold[i] = t as number;
    tree.left[i] = l as number;
    tree.right[i] = r as number;
  });
  // Every node must be reached exactly once from the root: a proper tree, so evaluation terminates.
  const seen = new Uint8Array(n);
  const stack = [0];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (seen[i]) invalid(`tree ${index}: node ${i} has more than one parent (cycle or DAG)`);
    seen[i] = 1;
    if (tree.feature[i]! >= 0) stack.push(tree.left[i]!, tree.right[i]!);
  }
  if (seen.includes(0)) invalid(`tree ${index}: unreachable nodes`);
  return tree;
}

export function loadModel(json: unknown): HazardModel {
  if (!isObject(json)) return invalid("model must be a JSON object");
  if (json.format !== MODEL_FORMAT) invalid(`format must be ${MODEL_FORMAT}, got ${String(json.format)}`);
  if (typeof json.version !== "string" || json.version === "") invalid("version must be a non-empty string");
  const lower = isObject(json.windows) ? json.windows.lower_days : undefined;
  if (finiteArray(lower, "windows.lower_days").join() !== WINDOW_LOWER_DAYS.join()) {
    invalid(`windows.lower_days must be ${WINDOW_LOWER_DAYS.join(",")}`);
  }
  if (json.init_score !== 0) invalid("init_score must be 0 (boost_from_average lives in tree 0)");
  if (json.link !== "logistic") invalid("link must be logistic");
  const featureOrder = stringArray(json.feature_order, "feature_order");
  const columns = resolveColumns(featureOrder, json.encoding);
  if (!Array.isArray(json.trees)) invalid("trees must be an array");
  const trees = (json.trees as unknown[]).map((t, i) => compileTree(t, i, featureOrder.length));
  const calibration = loadCalibration(json.calibration);
  return { version: json.version as string, featureOrder, artifact: json, columns, trees, calibration };
}

function loadCalibration(cal: unknown): Calibration {
  if (!isObject(cal)) return invalid("calibration must be an object");
  if (cal.type === "platt_on_raw_margin") {
    const [a, b] = finiteArray([cal.a, cal.b], "calibration a/b");
    if (!(a! > 0)) invalid("calibration.a must be positive (hazard increasing in raw)");
    return { kind: "platt", a: a!, b: b! };
  }
  if (cal.type === "isotonic_on_raw_margin") {
    const x = finiteArray(cal.x, "calibration.x");
    const y = finiteArray(cal.y, "calibration.y");
    if (x.length === 0 || x.length !== y.length) invalid("calibration x/y must be equal, non-empty");
    if (x.some((v, i) => i > 0 && v < x[i - 1]!)) invalid("calibration.x must be non-decreasing");
    if (y.some((v) => v < 0 || v > 1)) invalid("calibration.y must lie in [0, 1]");
    return { kind: "isotonic", x, y };
  }
  return invalid("calibration.type must be platt_on_raw_margin or isotonic_on_raw_margin");
}

/** Numeric vector in `feature_order` for window k. Unknown categories give an all-zero group. */
export function featureVector(model: HazardModel, features: RequestFeatures, k: number): Float64Array {
  const w = windowFeatures(features.lead_time, k);
  return Float64Array.from(model.columns, (c) => {
    switch (c.kind) {
      case "numeric":
        return features[c.key];
      case "exposure":
        return w.exposure_days;
      case "window":
        return c.k === k ? 1 : 0;
      case "category":
        return features[c.group] === c.value ? 1 : 0;
    }
  });
}

/** Σ tree(x), summed sequentially in tree order from 0 (never a base-rate logit). */
export function rawScore(model: HazardModel, x: ArrayLike<number>): number {
  if (x.length !== model.featureOrder.length) {
    throw new CoreError("InvalidInput", `expected ${model.featureOrder.length} features, got ${x.length}`);
  }
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) throw new CoreError("InvalidInput", `feature ${model.featureOrder[i]} is not finite`);
  }
  let raw = 0;
  for (const tree of model.trees) {
    let i = 0;
    while (tree.feature[i]! >= 0) i = x[tree.feature[i]!]! <= tree.threshold[i]! ? tree.left[i]! : tree.right[i]!;
    raw += tree.value[i]!;
  }
  return raw;
}

/** Calibrated hazard for a raw margin: Platt, or `numpy.interp` (linear, clipped) for isotonic. */
export function hazardFromRaw(model: HazardModel, raw: number): number {
  if (!Number.isFinite(raw)) throw new CoreError("InvalidInput", "raw score is not finite");
  const cal = model.calibration;
  // Same operation order as ml/stumari_ml/calibrate.py apply_scalar (parity to 1e-12).
  if (cal.kind === "platt") return 1 / (1 + Math.exp(-(cal.a * raw + cal.b)));
  const { x: xp, y: fp } = cal;
  const last = xp.length - 1;
  if (raw < xp[0]!) return fp[0]!;
  if (raw >= xp[last]!) return fp[last]!;
  // j = last index with xp[j] <= raw (numpy's binary_search_with_guess), so xp[j] <= raw < xp[j+1].
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (xp[mid]! <= raw) lo = mid;
    else hi = mid;
  }
  const slope = (fp[lo + 1]! - fp[lo]!) / (xp[lo + 1]! - xp[lo]!);
  let h = slope * (raw - xp[lo]!) + fp[lo]!;
  if (Number.isNaN(h)) {
    h = slope * (raw - xp[lo + 1]!) + fp[lo + 1]!;
    if (Number.isNaN(h) && fp[lo] === fp[lo + 1]) h = fp[lo]!;
  }
  return h;
}

/** The link, used only for the explain block's uncalibrated probability. */
export function logistic(raw: number): number {
  return 1 / (1 + Math.exp(-raw));
}

/** q_k = h_k · Π_{j<k, j reachable}(1 − h_j) for reachable k (non-null h), else 0. */
export function qVector(hazard: readonly (number | null)[]): number[] {
  let survival = 1;
  return hazard.map((h) => {
    if (h === null) return 0;
    const q = h * survival;
    survival *= 1 - h;
    return q;
  });
}

export function pCancel(q: readonly number[]): number {
  return q.reduce((sum, qk) => sum + qk, 0);
}

/** Everything the pricing engine and the explain block need about one request. */
export interface RiskAssessment {
  model_version: string;
  lead_time: number;
  features: RequestFeatures;
  /** Per window; null where the window is unreachable (L < lower_days[k]). */
  hazard: (number | null)[];
  q: number[];
  p_cancel: number;
  raw: (number | null)[];
  /** logistic(raw) per window: the uncalibrated probability, for explanation only. */
  p_uncalibrated: (number | null)[];
}

export function assessRisk(model: HazardModel, request: ModelRequest): RiskAssessment {
  const features = adaptRequest(request);
  const raw = Array.from({ length: WINDOW_COUNT }, (_, k) =>
    isReachable(features.lead_time, k) ? rawScore(model, featureVector(model, features, k)) : null,
  );
  const hazard = raw.map((r) => (r === null ? null : hazardFromRaw(model, r)));
  const q = qVector(hazard);
  return {
    model_version: model.version,
    lead_time: features.lead_time,
    features,
    hazard,
    q,
    p_cancel: pCancel(q),
    raw,
    p_uncalibrated: raw.map((r) => (r === null ? null : logistic(r))),
  };
}
