"""The reference feature adapter: quote request -> model features.

Used for training rows (via reconstructed requests) and for parity requests, so training and
serving share one definition. packages/core ports these rules exactly; ml/README.md lists them.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from typing import Any

from .windows import N_WINDOWS

SECONDS_PER_DAY = 86_400
HISTORY_CAP = 3
BUYER_TYPES = ("guest", "agent")
WEEKEND_START_WEEKDAYS = (4, 5)  # nights starting Friday or Saturday (Monday = 0)

# Agents are priced as direct buyers (ADR-0014).
DIRECT_CHANNEL: Mapping[str, str] = {
    "market_segment": "Direct",
    "distribution_channel": "Direct",
    "customer_type": "Transient",
}

BOOKING_NUMERIC: tuple[str, ...] = (
    "lead_time",
    "arrival_month",
    "arrival_dow",
    "weekend_nights",
    "week_nights",
    "adults",
    "children",
    "is_repeated_guest",
    "previous_bookings_not_canceled",
)
CATEGORICAL: tuple[str, ...] = ("market_segment", "distribution_channel", "customer_type", "hotel", "meal")
WINDOW_GROUP = "window"
EXPOSURE = "exposure_days"

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _int_field(request: Mapping[str, Any], key: str, minimum: int) -> int:
    value = request[key]
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{key} must be an integer, got {value!r}")
    if value < minimum:
        raise ValueError(f"{key} must be >= {minimum}, got {value}")
    return value


def _date_field(request: Mapping[str, Any], key: str) -> date:
    value = request[key]
    if not isinstance(value, str) or not _ISO_DATE.match(value):
        raise ValueError(f"{key} must be YYYY-MM-DD, got {value!r}")
    return date.fromisoformat(value)


def adapt(request: Mapping[str, Any], *, channel: Mapping[str, str] | None = None) -> dict[str, Any]:
    """Build the booking-level feature dict (window and exposure are added per period).

    `channel` overrides the buyer-type mapping and exists only for reconstructed training rows,
    whose segment, channel and customer type come from the dataset. Serving never passes it, and
    only serving requests must have `is_repeated_guest == (previous_bookings_not_canceled >= 1)`.
    """
    issued_at = _int_field(request, "issued_at", 0)
    checkin_ts = _int_field(request, "checkin_ts", 0)
    if checkin_ts < issued_at:
        raise ValueError("checkin_ts must not precede issued_at")
    checkin = _date_field(request, "checkin_date")
    checkout = _date_field(request, "checkout_date")
    nights = (checkout - checkin).days
    if nights < 1:
        raise ValueError("checkout_date must be after checkin_date")
    buyer_type = request["buyer_type"]
    if buyer_type not in BUYER_TYPES:
        raise ValueError(f"buyer_type must be one of {BUYER_TYPES}, got {buyer_type!r}")
    is_repeated_guest = _int_field(request, "is_repeated_guest", 0)
    if is_repeated_guest > 1:
        raise ValueError("is_repeated_guest must be 0 or 1")
    previous_bookings = _int_field(request, "previous_bookings_not_canceled", 0)
    # Serving derives both from one count of released bookings, so they must agree. The dataset's
    # own columns disagree on ~1.6% of rows, which training (the `channel` override) keeps as is.
    if channel is None and is_repeated_guest != int(previous_bookings >= 1):
        raise ValueError(
            "is_repeated_guest must be 1 exactly when previous_bookings_not_canceled >= 1, "
            f"got {is_repeated_guest} and {previous_bookings}"
        )

    weekend_nights = sum(
        1 for i in range(nights) if (checkin + timedelta(days=i)).weekday() in WEEKEND_START_WEEKDAYS
    )
    segments = DIRECT_CHANNEL if channel is None else channel
    return {
        "lead_time": (checkin_ts - issued_at) // SECONDS_PER_DAY,
        "arrival_month": checkin.month,
        "arrival_dow": checkin.weekday(),
        "weekend_nights": weekend_nights,
        "week_nights": nights - weekend_nights,
        "adults": _int_field(request, "adults", 1),
        "children": _int_field(request, "children", 0),
        "is_repeated_guest": is_repeated_guest,
        "previous_bookings_not_canceled": min(previous_bookings, HISTORY_CAP),
        "market_segment": segments["market_segment"],
        "distribution_channel": segments["distribution_channel"],
        "customer_type": segments["customer_type"],
        "hotel": request["hotel_type"],
        "meal": request["meal"],
    }


def column_name(group: str, value: str) -> str:
    """One-hot column name: group + "_" + value lowercased with each non-alphanumeric run -> "_"."""
    return f"{group}_{_NON_ALNUM.sub('_', value.lower()).strip('_')}"


def build_encoding(vocabulary: Mapping[str, Sequence[str]]) -> dict[str, Any]:
    """Encoding block of model.json; one-hot values are sorted, window values are "0".."5"."""
    one_hot = {group: sorted(vocabulary[group]) for group in CATEGORICAL}
    one_hot[WINDOW_GROUP] = [str(k) for k in range(N_WINDOWS)]
    for group, values in one_hot.items():
        names = [column_name(group, v) for v in values]
        if len(set(names)) != len(names):
            raise ValueError(f"one-hot column names collide in {group}: {names}")
    return {"numeric": [*BOOKING_NUMERIC, EXPOSURE], "one_hot": one_hot}


def booking_columns(encoding: Mapping[str, Any]) -> list[str]:
    columns = list(BOOKING_NUMERIC)
    for group in CATEGORICAL:
        columns += [column_name(group, v) for v in encoding["one_hot"][group]]
    return columns


def feature_order(encoding: Mapping[str, Any]) -> list[str]:
    windows = [column_name(WINDOW_GROUP, v) for v in encoding["one_hot"][WINDOW_GROUP]]
    return [*booking_columns(encoding), *windows, EXPOSURE]


def encode(features: Mapping[str, Any], encoding: Mapping[str, Any]) -> list[int]:
    """Booking-level vector in booking_columns order; an unknown category encodes as all zeros."""
    vector = [features[name] for name in BOOKING_NUMERIC]
    for group in CATEGORICAL:
        vector += [int(features[group] == v) for v in encoding["one_hot"][group]]
    return vector
