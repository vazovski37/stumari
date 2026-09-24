"""Booking-level evaluation on the full window expansion of a split."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import lightgbm as lgb
import numpy as np

from . import calibrate, metrics
from .model import predict_raw
from .periods import expand, hazard_matrix, q_matrix
from .windows import LOWER_DAYS, N_WINDOWS

N_BINS = 10


@dataclass(frozen=True)
class BookingScores:
    label: np.ndarray  # 1 iff the booking was cancelled
    lead: np.ndarray
    event_window: np.ndarray
    q: np.ndarray  # calibrated, (n, 6)
    q_uncalibrated: np.ndarray  # logistic link on the raw margin, (n, 6)

    @property
    def p_cancel(self) -> np.ndarray:
        return self.q.sum(axis=1)

    @property
    def p_cancel_uncalibrated(self) -> np.ndarray:
        return self.q_uncalibrated.sum(axis=1)


def score_bookings(
    booster: lgb.Booster,
    calibration: Mapping[str, Any],
    booking_matrix: np.ndarray,
    lead: np.ndarray,
    event_window: np.ndarray,
) -> BookingScores:
    rows = expand(booking_matrix, lead, event_window, truncate=False)
    raw = predict_raw(booster, rows.X)
    n = len(lead)
    hazard = hazard_matrix(rows, calibrate.apply(raw, calibration), n)
    hazard_uncalibrated = hazard_matrix(rows, 1.0 / (1.0 + np.exp(-raw)), n)
    return BookingScores(
        label=(event_window >= 0).astype(np.int64),
        lead=lead,
        event_window=event_window,
        q=q_matrix(hazard),
        q_uncalibrated=q_matrix(hazard_uncalibrated),
    )


def window_table(scores: BookingScores) -> list[dict[str, Any]]:
    """Mean predicted vs observed q_k over all bookings (unreachable windows count as 0)."""
    table = []
    for k in range(N_WINDOWS):
        predicted = float(scores.q[:, k].mean())
        observed = float((scores.event_window == k).mean())
        table.append(
            {
                "window": k,
                "predicted_q": predicted,
                "observed_q": observed,
                "ratio": predicted / observed if observed > 0 else None,
                "reachable_bookings": int((scores.lead >= LOWER_DAYS[k]).sum()),
            }
        )
    return table


def summarize(scores: BookingScores) -> dict[str, Any]:
    label = scores.label
    p = scores.p_cancel
    before = metrics.reliability_bins(label, scores.p_cancel_uncalibrated, N_BINS)
    after = metrics.reliability_bins(label, p, N_BINS)
    return {
        "bookings": int(len(label)),
        "cancel_rate": float(label.mean()),
        "auc": metrics.roc_auc(label, p),
        "auc_lead_time_only": metrics.roc_auc(label, scores.lead.astype(np.float64)),
        "brier": metrics.brier(label, p),
        "brier_base_rate": metrics.base_rate_brier(label),
        "brier_uncalibrated": metrics.brier(label, scores.p_cancel_uncalibrated),
        "mean_p_cancel": float(p.mean()),
        "ece": metrics.expected_calibration_error(after),
        "ece_uncalibrated": metrics.expected_calibration_error(before),
        "reliability_before": before,
        "reliability_after": after,
        "windows": window_table(scores),
    }
