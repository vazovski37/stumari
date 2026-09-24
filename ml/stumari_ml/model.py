"""LightGBM hazard classifier trained on person-period rows."""

from __future__ import annotations

from collections.abc import Sequence

import lightgbm as lgb
import numpy as np

MAX_TREES = 300
EARLY_STOPPING_ROUNDS = 30
SEED = 20261012
NUM_THREADS = 4
MONOTONE_DECREASING = ("is_repeated_guest", "previous_bookings_not_canceled")

PARAMS: dict[str, object] = {
    "objective": "binary",
    "boosting": "gbdt",
    "linear_tree": False,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_data_in_leaf": 200,
    "lambda_l2": 1.0,
    "feature_fraction": 1.0,
    "bagging_fraction": 1.0,
    "max_bin": 255,
    "metric": "binary_logloss",
    "seed": SEED,
    "deterministic": True,
    "force_col_wise": True,
    "num_threads": NUM_THREADS,
    "verbosity": -1,
}


def _assert_finite(name: str, X: np.ndarray) -> None:
    if X.dtype != np.float64:
        raise TypeError(f"{name} must be float64, got {X.dtype}")
    if not np.isfinite(X).all():
        raise ValueError(f"{name} contains NaN or inf")


def monotone_constraints(feature_order: Sequence[str]) -> list[int]:
    return [-1 if name in MONOTONE_DECREASING else 0 for name in feature_order]


def train(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_valid: np.ndarray,
    y_valid: np.ndarray,
    feature_order: Sequence[str],
) -> lgb.Booster:
    _assert_finite("X_train", X_train)
    _assert_finite("X_valid", X_valid)
    names = list(feature_order)
    if X_train.shape[1] != len(names) or X_valid.shape[1] != len(names):
        raise ValueError("matrix columns must equal feature_order")
    params = {**PARAMS, "monotone_constraints": monotone_constraints(names)}
    train_set = lgb.Dataset(X_train, label=y_train, feature_name=names, categorical_feature=[], free_raw_data=False)
    valid_set = lgb.Dataset(X_valid, label=y_valid, reference=train_set, free_raw_data=False)
    return lgb.train(
        params,
        train_set,
        num_boost_round=MAX_TREES,
        valid_sets=[valid_set],
        valid_names=["validation"],
        callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False)],
    )


def best_iteration(booster: lgb.Booster) -> int | None:
    return booster.best_iteration or None


def predict_raw(booster: lgb.Booster, X: np.ndarray) -> np.ndarray:
    _assert_finite("X", X)
    return booster.predict(X, raw_score=True, num_iteration=best_iteration(booster))
