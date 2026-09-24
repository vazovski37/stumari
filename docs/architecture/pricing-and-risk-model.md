# Pricing and Risk Model

## 1. Cancellation windows

Cancellation time is measured as time **before the check-in timestamp**. Six windows:

| k | Window | Days before check-in | Seconds lower bound |
|---|---|---|---|
| 0 | 30+ days | d ≥ 30 | 2,592,000 |
| 1 | 14–30 days | 14 ≤ d < 30 | 1,209,600 |
| 2 | 7–14 days | 7 ≤ d < 14 | 604,800 |
| 3 | 3–7 days | 3 ≤ d < 7 | 259,200 |
| 4 | 1–3 days | 1 ≤ d < 3 | 86,400 |
| 5 | last day | d < 1 | 0 |

Every contract template's tier thresholds are a subset of these boundaries, so each window falls entirely inside one tier and the expected refund per window is exact.

## 2. The model: discrete-time hazard

For a booking request with features `x` and lead time `L` (days from quote date to check-in date):

- Window `k` is **reachable** iff `L ≥ lower_days[k]` (lower_days = `[30,14,7,3,1,0]`, upper_days = `[∞,30,14,7,3,1]`).
- Exposure `e_k = max(0, min(L, upper_k) − lower_k)` days (window 0 upper = L).
- Hazard `h_k(x) = P(cancel in window k | still booked at start of k)` — one gradient-boosted binary classifier trained on **person-period** rows (one row per booking per reachable window, label 1 in the window where it cancelled), with the window index and exposure as features, then isotonic-calibrated.
- Probability of cancelling in window k: `q_k = h_k · Π_{j<k, reachable} (1 − h_j)` (0 if unreachable).
- `P(cancel) = Σ q_k`.

No-shows are not modelled for pricing: every template refunds 0 after check-in and a no-show room cannot be resold, so no-shows contribute zero to the price formula below.

### Training data

Hotel Booking Demand (Antonio, Almeida & Nunes, *Data in Brief* 22, 2019): 119,390 bookings, two Portuguese hotels (city + resort), arrivals Jul 2015 – Aug 2017, ~37% cancelled. Public copy: `https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-02-11/hotels.csv`.

- Arrival date = `arrival_date_year/month/day_of_month`. Booking date = arrival − `lead_time`.
- Cancelled: `reservation_status == "Canceled"`, cancel date = `reservation_status_date`, `d = (arrival − cancel).days`, clipped to `[0, lead_time]`.
- `Check-Out` and `No-Show` = survived all windows.
- **Split by arrival date** (no leakage): train < 2016-07-01 ≤ validation < 2017-01-01 ≤ test.

### Features — only what Stumari knows at quote time

| Feature | Stumari source | Dataset column |
|---|---|---|
| `lead_time` | days from today (hotel tz) to check-in | `lead_time` |
| `arrival_month` | check-in month 1–12 | `arrival_date_month` |
| `arrival_week` | ISO week of check-in | `arrival_date_week_number` |
| `arrival_dow` | check-in weekday, Mon=0 | derived |
| `weekend_nights` | nights starting Sat or Sun | `stays_in_weekend_nights` |
| `week_nights` | other nights | `stays_in_week_nights` |
| `adults`, `children` | request | same; `babies` fixed 0 |
| `is_repeated_guest` | wallet has ≥1 completed Stumari booking | same |
| `previous_cancellations` | wallet's cancelled Stumari bookings | same |
| `previous_bookings_not_canceled` | wallet's completed Stumari bookings | same |
| `adr` | nightly **base** rate in USD (USDC) — base, not quoted price, to avoid circularity | `adr` (EUR) |
| `market_segment` (one-hot) | guest → `Direct`, agent → `Online TA` | same |
| `distribution_channel` (one-hot) | guest → `Direct`, agent → `TA/TO` | same |
| `customer_type` (one-hot) | `Transient` | same |
| `hotel` (one-hot) | hotel setting `City Hotel` \| `Resort Hotel` | same |
| `meal` (one-hot) | room type setting `BB` \| `HB` \| `FB` \| `SC` | same (`Undefined` → `SC`) |
| `window` (one-hot 0–5), `exposure_days` | person-period | derived |

**Excluded on purpose:** `deposit_type` (it is our *treatment*, and "Non Refund" is a known data artifact in this dataset), `country` (unknown at quote time), `booking_changes`, `assigned_room_type`, `days_in_waiting_list`, `agent`, `company`, `reservation_status*` (post-booking leakage), parking and special requests (not collected).

Unknown category at inference → all-zero one-hot group (deterministic; tested).

### Metrics reported (ml/reports/)

- Booking-level `P(cancel)`: ROC-AUC, Brier score, reliability curve (plot) on the test split — before and after isotonic calibration.
- Timing: Harrell's concordance index on time-to-cancel, and per-window observed vs predicted `q_k`.
- Baseline comparison: lead-time-only logistic model.

### Honest limitation

This is a **prior** learned from Portugal 2015–2017. Tbilisi guests, channels and prices differ. Each hotel's own outcomes (on-chain `BookingCancelled`/`BookingReleased` events) are the labels for recalibration — roadmap, not MVP.

## 3. Exported artifact — `packages/core/model/model.json`

```jsonc
{
  "format": "stumari-gbdt-hazard/1",
  "version": "hazard-gbdt-YYYY-MM-DD",
  "windows": { "lower_days": [30,14,7,3,1,0], "upper_days": [null,30,14,7,3,1] },
  "feature_order": ["lead_time", "...", "window_0", "...", "exposure_days"],   // final numeric vector
  "encoding": {
    "numeric": ["lead_time","arrival_month","arrival_week","arrival_dow","weekend_nights","week_nights","adults","children","is_repeated_guest","previous_cancellations","previous_bookings_not_canceled","adr","exposure_days"],
    "one_hot": { "market_segment": ["Direct","Online TA","..."], "distribution_channel": [...], "customer_type": [...], "hotel": [...], "meal": [...], "window": ["0","1","2","3","4","5"] }
  },
  "init_score": 0.0,
  "trees": [ { "nodes": [ { "f": 3, "t": 12.5, "l": 1, "r": 2 }, { "v": -0.12 }, { "v": 0.08 } ] } ],
  "link": "logistic",
  "calibration": { "type": "isotonic", "x": [ ... ], "y": [ ... ] },
  "population_q": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  "metrics": { "...": "..." },
  "training": { "dataset": "hotel-booking-demand", "rows": 0, "person_period_rows": 0, "split": "..." }
}
```

Tree semantics (numeric only, no missing values ever): internal node `{f, t, l, r}` → go to `l` if `x[f] <= t` else `r`; leaf `{v}`. Root is node 0. `raw = init_score + Σ tree(x)`; `p = 1/(1+e^−raw)`; hazard = isotonic(p) with linear interpolation and clipping at the ends (`numpy.interp` semantics).

`packages/core/model/parity.json` holds ≥ 500 feature vectors with Python's calibrated hazard; the TS evaluator must match to `1e-9` absolute.

## 4. Contract templates (MVP)

| Template | Tiers `(secs_before → refund)` | Plain language |
|---|---|---|
| `flexible` | `86400 → 100%`, `0 → 50%` | Full refund until 24 h before check-in, then 50% |
| `standard` | `604800 → 100%`, `259200 → 50%`, `0 → 0%` | Full refund until 7 days, 50% until 3 days, then none |
| `nonrefundable` | `0 → 0%` | No refund |

Per-window refund fraction `r_T = [r_T,0 … r_T,5]`: flexible `[1,1,1,1,1,0.5]`, standard `[1,1,1,0.5,0,0]`, nonrefundable `[0,0,0,0,0,0]`.

## 5. Pricing: price room and terms together

Hotel policy inputs: base nightly rate(s) → `B` (sum over nights), **reference template** `R` (the blanket policy the hotel uses today, default `standard`), **resale probabilities** `s = [s_0…s_5]` (probability the room is resold if cancelled in window k; default `[0.90, 0.80, 0.65, 0.45, 0.25, 0.10]`), enabled templates, multiplier bounds `[m_min, m_max]` (default `[0.85, 1.30]`).

If a guest pays `P` under template `T` and cancels in window k, the hotel keeps `(1 − r_T,k)·P` and resells with probability `s_k` (assume at `P`). Expected revenue:

```
E_T(P) = P · (1 − c_T(x)),   c_T(x) = Σ_k q_k(x) · (r_T,k − s_k)       ("risk cost" of T for this guest)
```

Today the hotel earns, on average, `E_ref = B · (1 − c̄_R)` where `c̄_R = Σ_k q̄_k (r_R,k − s_k)` and `q̄ = population_q` from the model artifact.

Price each enabled template so the hotel's expected revenue from *this* guest equals what it earns today:

```
P_T = clamp( E_ref / (1 − c_T(x)),  m_min·B,  m_max·B )
```

then round **up** to the next whole cent (10,000 base units). Consequences: a low-risk guest gets flexibility cheaply; a high-risk guest pays more for it; non-refundable is always the cheapest; the reference template for an average guest costs ≈ B. The explain block reports `c_T`, `P_T/B`, `E_T(P_T)` and whether clamping applied.

Guards: if `1 − c_T(x) ≤ 0.05`, the template is withheld (terms too generous for this risk). Deposit is 100% (ADR-0002).

## 6. Worked example (defaults)

With `q̄ ≈ [0.12, 0.07, 0.05, 0.05, 0.03, 0.03]` (P(cancel) ≈ 0.35), `c̄_standard ≈ 0.0355` → `E_ref ≈ 0.9645·B`:
- flexible: `c ≈ 0.1055` → `P ≈ 1.078·B`
- standard: `c ≈ 0.0355` → `P ≈ 1.000·B`
- non-refundable: `c ≈ −0.2295` → `P ≈ 0.784·B` → clamped to `0.85·B`

A request with P(cancel) ≈ 0.10 prices flexible near `0.99·B`.
