"""parity.json (format stumari-parity/2): raw vectors plus end-to-end request cases."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

import numpy as np

from . import jsonmodel
from .adapter import adapt, booking_columns, encode
from .windows import N_WINDOWS, exposure_days, is_reachable, p_cancel, q_from_hazard

FORMAT = "stumari-parity/2"
MIN_VECTORS = 500
MIN_REQUESTS = 30
TBILISI = timezone(timedelta(hours=4))  # Asia/Tbilisi: UTC+4, no DST since 2005


@dataclass(frozen=True)
class Case:
    note: str
    issued: str  # local Tbilisi time "YYYY-MM-DD HH:MM:SS"
    checkin: str
    nights: int
    checkin_time: str = "14:00"
    adults: int = 2
    children: int = 0
    buyer_type: str = "guest"
    hotel_type: str = "City Hotel"
    meal: str = "BB"
    is_repeated_guest: int = 0
    previous_bookings_not_canceled: int = 0


# Weekdays: 2026-10-15 Thu, 2026-10-16 Fri, 2026-10-17 Sat, 2026-10-18 Sun, 2026-10-20 Tue.
CASES: tuple[Case, ...] = (
    Case("same day, morning", "2026-10-15 09:12:00", "2026-10-15", 1),
    Case("same day, one second before check-in", "2026-10-15 13:59:59", "2026-10-15", 2),
    Case("previous evening: under 24 h so lead 0", "2026-10-14 15:30:00", "2026-10-15", 1),
    Case("previous day before check-in time: lead 1", "2026-10-14 13:00:00", "2026-10-15", 1),
    Case("lead 2, Tuesday arrival", "2026-10-18 10:00:00", "2026-10-20", 2),
    Case("lead exactly 3 days to the second", "2026-10-17 14:00:00", "2026-10-20", 1),
    Case("lead 6, late-night quote", "2026-10-13 23:45:10", "2026-10-20", 3),
    Case("lead exactly 7", "2026-10-13 14:00:00", "2026-10-20", 2),
    Case("lead 13, Friday arrival", "2026-10-03 08:00:00", "2026-10-16", 2),
    Case("lead exactly 14, Saturday arrival", "2026-10-03 14:00:00", "2026-10-17", 1),
    Case("lead 20: window 0 unreachable", "2026-09-26 11:11:11", "2026-10-16", 3),
    Case("lead 29", "2026-09-16 16:00:00", "2026-10-15", 2),
    Case("lead exactly 30", "2026-09-15 14:00:00", "2026-10-15", 2),
    Case("spec example: lead 35, Thursday, 2 weekend nights", "2026-10-01 00:00:00", "2026-11-05", 3),
    Case("lead 60, Friday arrival, Fri+Sat nights", "2026-08-17 12:00:00", "2026-10-16", 2),
    Case("Saturday arrival, one night", "2026-09-01 09:00:00", "2026-10-17", 1),
    Case("Sunday arrival, three weekday nights", "2026-09-01 09:00:00", "2026-10-18", 3),
    Case("week-long stay", "2026-07-20 18:00:00", "2026-10-15", 7),
    Case("family with two children", "2026-07-17 10:00:00", "2026-10-15", 4, children=2),
    Case("large family, 4 adults 3 children", "2026-09-10 10:00:00", "2026-10-20", 5, adults=4, children=3),
    Case("single adult", "2026-10-05 07:30:00", "2026-10-15", 1, adults=1),
    Case("resort, half board, lead 120", "2026-06-17 14:00:00", "2026-10-15", 5, hotel_type="Resort Hotel", meal="HB"),
    Case("full board, lead 180", "2026-04-18 20:00:00", "2026-10-15", 3, meal="FB"),
    Case("self catering, lead 250", "2026-02-07 09:00:00", "2026-10-15", 4, meal="SC"),
    Case("lead 365", "2025-10-15 12:00:00", "2026-10-15", 2),
    Case("lead 400", "2025-09-10 12:00:00", "2026-10-15", 2),
    Case("repeat guest, 1 released booking", "2026-09-01 10:00:00", "2026-10-15", 2,
         is_repeated_guest=1, previous_bookings_not_canceled=1),
    Case("repeat guest, 3 released bookings", "2026-09-01 10:00:00", "2026-10-15", 2,
         is_repeated_guest=1, previous_bookings_not_canceled=3),
    Case("repeat guest, 7 released bookings (capped to 3)", "2026-09-01 10:00:00", "2026-10-15", 2,
         is_repeated_guest=1, previous_bookings_not_canceled=7),
    Case("agent buyer, same as lead-60 guest case", "2026-08-17 12:00:00", "2026-10-16", 2, buyer_type="agent"),
    Case("agent buyer, resort, lead 9 (quoted 21:00, 9.7 days out)", "2026-10-05 21:00:00", "2026-10-15", 2,
         buyer_type="agent", hotel_type="Resort Hotel"),
    Case("unknown meal code (all-zero one-hot)", "2026-09-01 10:00:00", "2026-10-15", 2, meal="AI"),
    Case("unknown hotel type (all-zero one-hot)", "2026-09-01 10:00:00", "2026-10-15", 2, hotel_type="Guest House"),
    Case("year boundary stay, Dec 31 -> Jan 2", "2026-12-01 10:00:00", "2026-12-31", 2),
    Case("quote in December for January arrival", "2026-12-20 22:00:00", "2027-01-05", 3),
    Case("leap day inside the stay", "2027-12-01 10:00:00", "2028-02-28", 3),
    Case("early check-in time 12:00", "2026-10-14 12:30:00", "2026-10-15", 1, checkin_time="12:00"),
    Case("late check-in time 15:00, lead 1", "2026-10-14 14:30:00", "2026-10-15", 1, checkin_time="15:00"),
)


def _tbilisi_ts(local: str) -> int:
    return int(datetime.fromisoformat(local).replace(tzinfo=TBILISI).timestamp())


def case_request(case: Case) -> dict[str, Any]:
    checkin = date.fromisoformat(case.checkin)
    return {
        "issued_at": _tbilisi_ts(case.issued),
        "checkin_ts": _tbilisi_ts(f"{case.checkin} {case.checkin_time}:00"),
        "checkin_date": case.checkin,
        "checkout_date": (checkin + timedelta(days=case.nights)).isoformat(),
        "adults": case.adults,
        "children": case.children,
        "buyer_type": case.buyer_type,
        "hotel_type": case.hotel_type,
        "meal": case.meal,
        "is_repeated_guest": case.is_repeated_guest,
        "previous_bookings_not_canceled": case.previous_bookings_not_canceled,
    }


def score_request(model: Mapping[str, Any], request: Mapping[str, Any]) -> dict[str, Any]:
    """Reference end-to-end scoring: adapter -> full window expansion -> hazard -> q -> P(cancel)."""
    features = adapt(request)
    booking_vector = encode(features, model["encoding"])
    lead = features["lead_time"]
    raw: list[float | None] = []
    hazard: list[float | None] = []
    for k in range(N_WINDOWS):
        if not is_reachable(lead, k):
            raw.append(None)
            hazard.append(None)
            continue
        window = [int(j == k) for j in range(N_WINDOWS)]
        x = [*booking_vector, *window, exposure_days(lead, k)]
        r = jsonmodel.raw_score(model, x)
        raw.append(r)
        hazard.append(jsonmodel.hazard(model, r))
    q = q_from_hazard(hazard)
    return {
        "features": dict(zip(booking_columns(model["encoding"]), booking_vector)),
        "raw": raw,
        "hazard": hazard,
        "q": q,
        "p_cancel": p_cancel(q),
    }


def build_parity(model: Mapping[str, Any], X_sample: np.ndarray) -> dict[str, Any]:
    if len(X_sample) < MIN_VECTORS or len(CASES) < MIN_REQUESTS:
        raise ValueError("not enough parity vectors or requests")
    vectors = []
    for row in X_sample.tolist():
        if any(v != int(v) for v in row):
            raise ValueError("feature vectors are expected to be integral")
        x = [int(v) for v in row]
        raw = jsonmodel.raw_score(model, x)
        vectors.append({"x": x, "raw": raw, "hazard": jsonmodel.hazard(model, raw)})
    requests = []
    for case in CASES:
        request = case_request(case)
        requests.append({"note": case.note, "request": request, **score_request(model, request)})
    return {"format": FORMAT, "model_version": model["version"], "vectors": vectors, "requests": requests}
