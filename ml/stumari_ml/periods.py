"""Person-period expansion: one row per (booking, reachable window).

Training rows stop after the cancellation window (label 1 there); booking-level scoring always
expands every reachable window.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .windows import LOWER_DAYS, N_WINDOWS


@dataclass(frozen=True)
class PeriodRows:
    X: np.ndarray  # float64, columns = feature_order
    booking: np.ndarray  # int64 index into the booking arrays
    window: np.ndarray  # int64
    label: np.ndarray  # int64, 1 iff the booking cancelled in this window


def expand(
    booking_matrix: np.ndarray,
    lead: np.ndarray,
    event_window: np.ndarray,
    *,
    truncate: bool,
) -> PeriodRows:
    """Rows ordered by booking, then window 0 -> 5.

    truncate=True is the training construction (stop after the event window);
    truncate=False is the full expansion used for every booking-level score.
    """
    lower = np.asarray(LOWER_DAYS)
    keep = lead[:, None] >= lower[None, :]
    if truncate:
        survivor = event_window[:, None] < 0
        keep &= survivor | (np.arange(N_WINDOWS)[None, :] <= event_window[:, None])
    booking, window = np.nonzero(keep)  # row-major: booking first, then window

    # windows.exposure_days, vectorised: max(0, min(L, upper_k) - lower_k) with upper_0 = L
    upper = np.where(window == 0, lead[booking], np.asarray((0, 30, 14, 7, 3, 1))[window])
    exposure = np.maximum(0, np.minimum(lead[booking], upper) - lower[window]).astype(np.float64)
    one_hot = np.zeros((len(booking), N_WINDOWS), dtype=np.float64)
    one_hot[np.arange(len(booking)), window] = 1.0
    X = np.hstack([booking_matrix[booking].astype(np.float64), one_hot, exposure[:, None]])
    label = (window == event_window[booking]).astype(np.int64)
    return PeriodRows(X=X, booking=booking.astype(np.int64), window=window.astype(np.int64), label=label)


def hazard_matrix(rows: PeriodRows, hazard: np.ndarray, n_bookings: int) -> np.ndarray:
    """Scatter per-row hazards into an (n_bookings, 6) array with NaN for unreachable windows."""
    out = np.full((n_bookings, N_WINDOWS), np.nan)
    out[rows.booking, rows.window] = hazard
    return out


def q_matrix(hazard: np.ndarray) -> np.ndarray:
    """Vectorised windows.q_from_hazard: same operation order, NaN hazard = unreachable."""
    q = np.zeros_like(hazard)
    survival = np.ones(hazard.shape[0])
    for k in range(N_WINDOWS):
        h = hazard[:, k]
        reachable = ~np.isnan(h)
        q[reachable, k] = h[reachable] * survival[reachable]
        survival[reachable] *= 1.0 - h[reachable]
    return q
