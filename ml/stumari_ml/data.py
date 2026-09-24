"""Load Hotel Booking Demand, apply the training population filter and build adapter features."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .adapter import CATEGORICAL, SECONDS_PER_DAY, adapt
from .windows import window_of_day

TRAIN_END = date(2016, 7, 1)
VALIDATION_END = date(2017, 1, 1)
SPLITS = ("train", "validation", "test")
POPULATION = (
    'deposit_type == "No Deposit", market_segment != "Undefined", distribution_channel != "Undefined", '
    "adults >= 1, stays_in_weekend_nights + stays_in_week_nights >= 1; children NaN -> 0; meal Undefined -> SC"
)
SPLIT_DESCRIPTION = "by arrival date: train < 2016-07-01 <= validation < 2017-01-01 <= test"

_MONTHS = {
    name: i + 1
    for i, name in enumerate(
        [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ]
    )
}
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


@dataclass(frozen=True)
class Bookings:
    """One entry per booking of the training population, in dataset order."""

    features: list[dict[str, Any]]
    lead: np.ndarray  # int64, whole days
    event_window: np.ndarray  # int64, cancellation window or -1 for survivors
    split: np.ndarray  # str: train | validation | test

    def __len__(self) -> int:
        return len(self.features)

    def subset(self, name: str) -> Bookings:
        mask = self.split == name
        idx = np.flatnonzero(mask)
        return Bookings(
            features=[self.features[i] for i in idx],
            lead=self.lead[mask],
            event_window=self.event_window[mask],
            split=self.split[mask],
        )


def load_population(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df["children"] = df["children"].fillna(0).astype("int64")
    keep = (
        (df["deposit_type"] == "No Deposit")
        & (df["market_segment"] != "Undefined")
        & (df["distribution_channel"] != "Undefined")
        & (df["adults"] >= 1)
        & (df["stays_in_weekend_nights"] + df["stays_in_week_nights"] >= 1)
    )
    df = df.loc[keep].reset_index(drop=True)
    df["meal"] = df["meal"].replace("Undefined", "SC")
    return df


def _split_of(arrival: date) -> str:
    if arrival < TRAIN_END:
        return "train"
    if arrival < VALIDATION_END:
        return "validation"
    return "test"


def _midnight_utc(day: date) -> int:
    return int((datetime(day.year, day.month, day.day, tzinfo=timezone.utc) - _EPOCH).total_seconds())


def reconstruct(row: Any) -> tuple[dict[str, Any], dict[str, str], date]:
    """Reconstructed quote request (issued at arrival - lead days, 00:00) and dataset channel."""
    arrival = date(int(row.arrival_date_year), _MONTHS[row.arrival_date_month], int(row.arrival_date_day_of_month))
    nights = int(row.stays_in_weekend_nights) + int(row.stays_in_week_nights)
    checkin_ts = _midnight_utc(arrival)
    request = {
        "issued_at": checkin_ts - int(row.lead_time) * SECONDS_PER_DAY,
        "checkin_ts": checkin_ts,
        "checkin_date": arrival.isoformat(),
        "checkout_date": (arrival + timedelta(days=nights)).isoformat(),
        "adults": int(row.adults),
        "children": int(row.children),
        "buyer_type": "guest",
        "hotel_type": row.hotel,
        "meal": row.meal,
        "is_repeated_guest": int(row.is_repeated_guest),
        "previous_bookings_not_canceled": int(row.previous_bookings_not_canceled),
    }
    channel = {
        "market_segment": row.market_segment,
        "distribution_channel": row.distribution_channel,
        "customer_type": row.customer_type,
    }
    return request, channel, arrival


def build_bookings(df: pd.DataFrame) -> Bookings:
    features: list[dict[str, Any]] = []
    lead = np.empty(len(df), dtype=np.int64)
    event_window = np.full(len(df), -1, dtype=np.int64)
    split = np.empty(len(df), dtype=object)
    for i, row in enumerate(df.itertuples(index=False)):
        request, channel, arrival = reconstruct(row)
        f = adapt(request, channel=channel)
        features.append(f)
        lead[i] = f["lead_time"]
        split[i] = _split_of(arrival)
        if row.reservation_status == "Canceled":
            d = (arrival - date.fromisoformat(row.reservation_status_date)).days
            event_window[i] = window_of_day(min(max(d, 0), f["lead_time"]))
    return Bookings(features=features, lead=lead, event_window=event_window, split=split.astype(str))


def vocabulary(bookings: Bookings) -> dict[str, list[str]]:
    return {g: sorted({f[g] for f in bookings.features}) for g in CATEGORICAL}
