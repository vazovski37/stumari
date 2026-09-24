"""Export the booster to model.json (format stumari-gbdt-hazard/2) with every spec assertion."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np

from . import calibrate, jsonmodel
from .model import MAX_TREES, best_iteration, predict_raw
from .windows import LOWER_DAYS

FORMAT = "stumari-gbdt-hazard/2"
MAX_BYTES = 3 * 1024 * 1024
MIN_PARITY_ROWS = 5_000


def _flatten(root: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Pre-order node list: root = 0, internal {f,t,l,r}, leaf {v}."""
    nodes: list[dict[str, Any]] = []

    def visit(node: Mapping[str, Any]) -> int:
        index = len(nodes)
        nodes.append({})
        if "leaf_value" in node:
            nodes[index] = {"v": float(node["leaf_value"])}
            return index
        if node["decision_type"] != "<=":
            raise ValueError(f"unsupported decision_type {node['decision_type']!r}")
        if node["missing_type"] != "None":
            raise ValueError(f"unsupported missing_type {node['missing_type']!r}")
        left = visit(node["left_child"])
        right = visit(node["right_child"])
        nodes[index] = {"f": int(node["split_feature"]), "t": float(node["threshold"]), "l": left, "r": right}
        return index

    visit(root)
    return nodes


def dump_trees(booster: lgb.Booster, feature_order: Sequence[str]) -> list[dict[str, Any]]:
    dump = booster.dump_model(num_iteration=best_iteration(booster))
    if dump["objective"] != "binary sigmoid:1":
        raise ValueError(f"unexpected objective {dump['objective']!r}")
    if dump["max_feature_idx"] + 1 != len(feature_order):
        raise ValueError("max_feature_idx + 1 != len(feature_order)")
    if list(dump["feature_names"]) != list(feature_order):
        raise ValueError("booster feature names differ from feature_order")
    if dump["num_tree_per_iteration"] != 1:
        raise ValueError("expected one tree per iteration")
    trees = [{"nodes": _flatten(info["tree_structure"])} for info in dump["tree_info"]]
    if not 1 <= len(trees) <= MAX_TREES:
        raise ValueError(f"tree count {len(trees)} outside 1..{MAX_TREES}")
    return trees


def build_model(
    booster: lgb.Booster,
    *,
    version: str,
    feature_order: Sequence[str],
    encoding: Mapping[str, Any],
    calibration: Mapping[str, Any],
    metrics: Mapping[str, Any],
    population_q_test_mean: Sequence[float],
    training: Mapping[str, Any],
) -> dict[str, Any]:
    if calibration.get("type") not in (calibrate.PLATT, calibrate.ISOTONIC):
        raise ValueError(f"unknown calibration {calibration.get('type')!r}")
    return {
        "format": FORMAT,
        "version": version,
        "windows": {"lower_days": list(LOWER_DAYS)},
        "feature_order": list(feature_order),
        "encoding": encoding,
        "init_score": 0.0,
        "trees": dump_trees(booster, feature_order),
        "calibration": dict(calibration),
        "link": "logistic",
        "metrics": dict(metrics),
        "population_q_test_mean": list(population_q_test_mean),
        "training": dict(training),
    }


def assert_walker_parity(model: Mapping[str, Any], booster: lgb.Booster, X: np.ndarray) -> int:
    """The JSON walker must equal booster.predict(raw_score=True) bit for bit."""
    if len(X) < MIN_PARITY_ROWS:
        raise ValueError(f"parity check needs >= {MIN_PARITY_ROWS} rows, got {len(X)}")
    expected = predict_raw(booster, X)
    for row, want in zip(X.tolist(), expected.tolist()):
        got = jsonmodel.raw_score(model, row)
        if got != want:
            raise AssertionError(f"walker raw {got!r} != booster raw {want!r}")
    return len(X)


def dumps(obj: Any) -> str:
    """Compact JSON; floats use Python's shortest round-trip repr (never rounded)."""
    return json.dumps(obj, separators=(",", ":"), allow_nan=False)


def write_model(path: Path, model: Mapping[str, Any]) -> int:
    text = dumps(model)
    size = len(text.encode("utf-8"))
    if size >= MAX_BYTES:
        raise ValueError(f"model.json is {size} bytes, limit {MAX_BYTES}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8", newline="\n")
    return size
