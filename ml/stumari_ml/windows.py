"""Cancellation windows and the hazard -> q / P(cancel) math shared with packages/core.

Window k covers cancellations made d days before check-in with lower_days[k] <= d < upper_k,
where upper = [L, 30, 14, 7, 3, 1] and L is the lead time in whole days.
"""

from __future__ import annotations

from collections.abc import Sequence

LOWER_DAYS: tuple[int, ...] = (30, 14, 7, 3, 1, 0)
N_WINDOWS = len(LOWER_DAYS)


def upper_days(lead: int) -> tuple[int, ...]:
    return (lead, 30, 14, 7, 3, 1)


def window_of_day(d: int) -> int:
    """Window of a cancellation made d whole days before check-in (window 0 is open-ended)."""
    if d < 0:
        raise ValueError(f"negative cancellation day {d}")
    for k, lower in enumerate(LOWER_DAYS):
        if d >= lower:
            return k
    raise AssertionError("unreachable: LOWER_DAYS ends at 0")


def is_reachable(lead: int, k: int) -> bool:
    return lead >= LOWER_DAYS[k]


def exposure_days(lead: int, k: int) -> int:
    return max(0, min(lead, upper_days(lead)[k]) - LOWER_DAYS[k])


def q_from_hazard(hazard: Sequence[float | None]) -> list[float]:
    """q_k = h_k * prod_{j<k reachable}(1 - h_j); unreachable windows (None) give q_k = 0.

    Evaluated with a running survival product in window order so every port performs the
    same floating-point operations.
    """
    if len(hazard) != N_WINDOWS:
        raise ValueError(f"expected {N_WINDOWS} hazards, got {len(hazard)}")
    q: list[float] = []
    survival = 1.0
    for h in hazard:
        if h is None:
            q.append(0.0)
            continue
        q.append(h * survival)
        survival *= 1.0 - h
    return q


def p_cancel(q: Sequence[float]) -> float:
    total = 0.0
    for value in q:
        total += value
    return total
