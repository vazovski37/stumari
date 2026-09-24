"""Calibration of the raw margin, fit on validation person-period rows (pricing-and-risk-model.md §3).

Two calibrators share one JSON shape (``model.json["calibration"]``):

* ``platt_on_raw_margin`` ``{a, b}`` — ``hazard = 1 / (1 + exp(-(a*raw + b)))``. Smooth and strictly
  monotone, so nearby requests get nearby prices. This is the exported default (ADR-0016).
* ``isotonic_on_raw_margin`` ``{x, y}`` — ``hazard = numpy.interp(raw, x, y)``. A step function; kept for
  comparison in the metrics report.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

import numpy as np
from sklearn.isotonic import IsotonicRegression

PLATT = "platt_on_raw_margin"
ISOTONIC = "isotonic_on_raw_margin"


def fit_isotonic(raw: np.ndarray, label: np.ndarray) -> dict[str, Any]:
    iso = IsotonicRegression(out_of_bounds="clip", increasing=True, y_min=0, y_max=1)
    iso.fit(raw, label.astype(np.float64))
    x = [float(v) for v in iso.X_thresholds_]
    y = [float(v) for v in iso.y_thresholds_]
    if len(x) < 2 or any(b <= a for a, b in zip(x, x[1:])):
        raise ValueError("calibration x must be strictly increasing with at least two points")
    if any(b < a for a, b in zip(y, y[1:])) or y[0] < 0.0 or y[-1] > 1.0:
        raise ValueError("calibration y must be non-decreasing within [0, 1]")
    return {"type": ISOTONIC, "x": x, "y": y}


def fit_platt(raw: np.ndarray, label: np.ndarray, max_iter: int = 100) -> dict[str, Any]:
    """Maximum-likelihood logistic fit of label on (raw, 1) by Newton-Raphson (numpy only)."""
    X = np.column_stack([raw.astype(np.float64), np.ones(len(raw))])
    y = label.astype(np.float64)
    w = np.array([1.0, 0.0])
    for _ in range(max_iter):
        p = 1.0 / (1.0 + np.exp(-(X @ w)))
        gradient = X.T @ (p - y)
        hessian = (X * (p * (1.0 - p))[:, None]).T @ X + 1e-9 * np.eye(2)
        step = np.linalg.solve(hessian, gradient)
        w -= step
        if np.max(np.abs(step)) < 1e-12:
            break
    a, b = float(w[0]), float(w[1])
    if not (math.isfinite(a) and math.isfinite(b)) or a <= 0.0:
        raise ValueError(f"Platt fit must be finite and increasing, got a={a}, b={b}")
    return {"type": PLATT, "a": a, "b": b}


def apply(raw: np.ndarray, calibration: Mapping[str, Any]) -> np.ndarray:
    """Vectorised hazard for metrics."""
    kind = calibration["type"]
    if kind == PLATT:
        return 1.0 / (1.0 + np.exp(-(calibration["a"] * raw + calibration["b"])))
    if kind == ISOTONIC:
        return np.interp(raw, calibration["x"], calibration["y"])
    raise ValueError(f"unknown calibration type {kind!r}")


def apply_scalar(raw: float, calibration: Mapping[str, Any]) -> float:
    """Scalar hazard with exactly the operation order the TypeScript evaluator uses (parity path)."""
    kind = calibration["type"]
    if kind == PLATT:
        return 1.0 / (1.0 + math.exp(-(calibration["a"] * raw + calibration["b"])))
    if kind == ISOTONIC:
        return float(np.interp(raw, calibration["x"], calibration["y"]))
    raise ValueError(f"unknown calibration type {kind!r}")


def describe(calibration: Mapping[str, Any]) -> str:
    return "Platt scaling" if calibration["type"] == PLATT else "isotonic regression"
