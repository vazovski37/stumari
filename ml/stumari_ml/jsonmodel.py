"""Pure-Python evaluator of model.json — the reference the TypeScript evaluator mirrors."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from . import calibrate


def tree_value(nodes: Sequence[Mapping[str, Any]], x: Sequence[float]) -> float:
    i = 0
    while True:
        node = nodes[i]
        if "v" in node:
            return node["v"]
        i = node["l"] if x[node["f"]] <= node["t"] else node["r"]


def raw_score(model: Mapping[str, Any], x: Sequence[float]) -> float:
    """Sequential sum of tree outputs in tree order (init_score is 0.0 by format)."""
    if len(x) != len(model["feature_order"]):
        raise ValueError("feature vector length does not match feature_order")
    if not all(math.isfinite(v) for v in x):
        raise ValueError("non-finite feature value")
    total = model["init_score"]
    for tree in model["trees"]:
        total += tree_value(tree["nodes"], x)
    return total


def hazard(model: Mapping[str, Any], raw: float) -> float:
    if not math.isfinite(raw):
        raise ValueError("non-finite raw score")
    return calibrate.apply_scalar(raw, model["calibration"])
