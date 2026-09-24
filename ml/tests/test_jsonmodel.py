import json
import os
from pathlib import Path

import lightgbm as lgb
import numpy as np

from stumari_ml import jsonmodel
from stumari_ml.export import _flatten, assert_walker_parity, dump_trees
from stumari_ml.parity import score_request

MODEL_DIR = Path(__file__).resolve().parents[2] / "packages" / "core" / "model"


def synthetic_booster():
    rng = np.random.default_rng(3)
    n = 6000
    lead = rng.integers(0, 400, n).astype(np.float64)
    one_hot = np.eye(3)[rng.integers(0, 3, n)]
    X = np.column_stack([lead, one_hot])
    logit = -2.0 + lead / 200.0 + one_hot[:, 0] - 0.5 * one_hot[:, 2]
    y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)
    names = ["lead_time", "c_a", "c_b", "c_c"]
    params = {"objective": "binary", "num_leaves": 15, "min_data_in_leaf": 50, "seed": 1, "deterministic": True,
              "force_col_wise": True, "num_threads": 1, "verbosity": -1}
    booster = lgb.train(params, lgb.Dataset(X, label=y, feature_name=names, categorical_feature=[]),
                        num_boost_round=40)
    return booster, X, names


def test_walker_equals_booster_raw_score_exactly():
    booster, X, names = synthetic_booster()
    model = {"feature_order": names, "init_score": 0.0, "trees": dump_trees(booster, names)}
    assert assert_walker_parity(model, booster, X) == len(X)


def test_flatten_single_leaf_and_split():
    assert _flatten({"leaf_value": 0.25}) == [{"v": 0.25}]
    split = {"split_feature": 2, "threshold": 1.0000000180025095e-35, "decision_type": "<=", "missing_type": "None",
             "left_child": {"leaf_value": -0.1}, "right_child": {"leaf_value": 0.2}}
    nodes = _flatten(split)
    assert nodes == [{"f": 2, "t": 1.0000000180025095e-35, "l": 1, "r": 2}, {"v": -0.1}, {"v": 0.2}]
    assert jsonmodel.tree_value(nodes, [0, 0, 0.0]) == -0.1
    assert jsonmodel.tree_value(nodes, [0, 0, 1.0]) == 0.2


def test_walker_rejects_non_finite_input():
    model = {"feature_order": ["a"], "init_score": 0.0, "trees": [{"nodes": [{"v": 1.0}]}]}
    try:
        jsonmodel.raw_score(model, [float("nan")])
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_exported_artifacts_reproduce_parity_file():
    model_path, parity_path = MODEL_DIR / "model.json", MODEL_DIR / "parity.json"
    if not model_path.exists() or not parity_path.exists():
        if os.environ.get("STUMARI_ALLOW_MISSING_ARTIFACTS") == "1":
            print("  (skipped: STUMARI_ALLOW_MISSING_ARTIFACTS=1)")
            return
        raise AssertionError("model.json / parity.json missing: run python -m stumari_ml.train first")
    model = json.loads(model_path.read_text(encoding="utf-8"))
    parity = json.loads(parity_path.read_text(encoding="utf-8"))
    assert model["format"] == "stumari-gbdt-hazard/2" and parity["format"] == "stumari-parity/2"
    assert parity["model_version"] == model["version"]
    assert len(parity["vectors"]) >= 500 and len(parity["requests"]) >= 30
    assert model_path.stat().st_size < 3 * 1024 * 1024
    for vector in parity["vectors"]:
        raw = jsonmodel.raw_score(model, vector["x"])
        assert raw == vector["raw"]
        assert jsonmodel.hazard(model, raw) == vector["hazard"]
    for case in parity["requests"]:
        scored = score_request(model, case["request"])
        for key in ("features", "raw", "hazard", "q", "p_cancel"):
            assert scored[key] == case[key], (case["note"], key)
        lead = case["features"]["lead_time"]
        for k, lower in enumerate(model["windows"]["lower_days"]):
            assert (case["hazard"][k] is None) == (lead < lower)


def test_exported_model_is_monotone_in_wallet_history():
    model_path, parity_path = MODEL_DIR / "model.json", MODEL_DIR / "parity.json"
    if not model_path.exists() or not parity_path.exists():
        if os.environ.get("STUMARI_ALLOW_MISSING_ARTIFACTS") == "1":
            print("  (skipped: STUMARI_ALLOW_MISSING_ARTIFACTS=1)")
            return
        raise AssertionError("model.json / parity.json missing: run python -m stumari_ml.train first")
    model = json.loads(model_path.read_text(encoding="utf-8"))
    order = model["feature_order"]
    repeat, history = order.index("is_repeated_guest"), order.index("previous_bookings_not_canceled")
    for vector in json.loads(parity_path.read_text(encoding="utf-8"))["vectors"]:
        x = list(vector["x"])
        scores = []
        for is_repeat, count in ((0, 0), (1, 0), (1, 1), (1, 2), (1, 3)):
            x[repeat], x[history] = is_repeat, count
            scores.append(jsonmodel.raw_score(model, x))
        assert all(b <= a for a, b in zip(scores, scores[1:]))


def test_platt_calibration_is_smooth_and_matches_scalar_path():
    import numpy as np

    from stumari_ml import calibrate

    rng = np.random.default_rng(7)
    raw = rng.normal(-1.0, 1.0, 20_000)
    label = (rng.random(20_000) < 1.0 / (1.0 + np.exp(-(0.8 * raw + 0.3)))).astype(np.int64)
    cal = calibrate.fit_platt(raw, label)
    assert cal["type"] == calibrate.PLATT and abs(cal["a"] - 0.8) < 0.05 and abs(cal["b"] - 0.3) < 0.05
    grid = np.linspace(-4, 2, 50)
    vec = calibrate.apply(grid, cal)
    assert all(b > a for a, b in zip(vec, vec[1:]))  # strictly increasing: no flat steps
    for r, v in zip(grid.tolist(), vec.tolist()):
        assert abs(calibrate.apply_scalar(r, cal) - v) < 1e-15
