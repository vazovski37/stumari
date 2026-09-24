"""Metrics in plain numpy (sklearn.metrics is blocked on the Windows host)."""

from __future__ import annotations

import numpy as np


def average_ranks(score: np.ndarray) -> np.ndarray:
    """1-based ranks with ties sharing their average rank."""
    order = np.argsort(score, kind="mergesort")
    sorted_score = score[order]
    _, first, counts = np.unique(sorted_score, return_index=True, return_counts=True)
    ranks = np.empty(len(score), dtype=np.float64)
    ranks[order] = np.repeat(first + (counts + 1) / 2.0, counts)
    return ranks


def roc_auc(label: np.ndarray, score: np.ndarray) -> float:
    """Mann-Whitney rank formula: (R1 - n1(n1+1)/2) / (n1 n0)."""
    positive = np.asarray(label).astype(bool)
    n1 = int(positive.sum())
    n0 = len(positive) - n1
    if n1 == 0 or n0 == 0:
        raise ValueError("AUC needs both classes")
    r1 = average_ranks(np.asarray(score, dtype=np.float64))[positive].sum()
    return float((r1 - n1 * (n1 + 1) / 2.0) / (n1 * n0))


def brier(label: np.ndarray, prob: np.ndarray) -> float:
    return float(np.mean((np.asarray(prob, dtype=np.float64) - np.asarray(label, dtype=np.float64)) ** 2))


def base_rate_brier(label: np.ndarray) -> float:
    p = float(np.mean(label))
    return p * (1.0 - p)


def reliability_bins(label: np.ndarray, prob: np.ndarray, n_bins: int = 10) -> list[dict[str, float | int]]:
    """Equal-count bins over predictions sorted ascending (stable sort, so ties split deterministically)."""
    order = np.argsort(prob, kind="mergesort")
    bins = []
    for idx in np.array_split(order, n_bins):
        bins.append(
            {
                "mean_predicted": float(np.mean(prob[idx])),
                "observed_rate": float(np.mean(label[idx])),
                "count": int(len(idx)),
            }
        )
    return bins


def expected_calibration_error(bins: list[dict[str, float | int]]) -> float:
    total = sum(int(b["count"]) for b in bins)
    return float(
        sum(int(b["count"]) * abs(float(b["mean_predicted"]) - float(b["observed_rate"])) for b in bins) / total
    )
