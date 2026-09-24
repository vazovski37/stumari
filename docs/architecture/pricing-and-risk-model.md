# Pricing and Risk Model

## 1. Cancellation windows

Cancellation time is measured before the check-in timestamp. Six windows (k = 0 earliest):

| k | Window | Days before check-in | Seconds lower bound |
|---|---|---|---|
| 0 | 30+ days | d ≥ 30 | 2,592,000 |
| 1 | 14–30 days | 14 ≤ d < 30 | 1,209,600 |
| 2 | 7–14 days | 7 ≤ d < 14 | 604,800 |
| 3 | 3–7 days | 3 ≤ d < 7 | 259,200 |
| 4 | 1–3 days | 1 ≤ d < 3 | 86,400 |
| 5 | last day | d < 1 | 0 |

`lower_days = [30,14,7,3,1,0]`, `upper_days = [L,30,14,7,3,1]` (window 0's upper bound is the lead time L). Contract tier thresholds are a subset of these boundaries. Training windows are day-granular while tiers are seconds before `checkin_ts`, so the per-window refund is exact up to the part of a boundary day before check-in time (accepted approximation).

## 2. The model: discrete-time hazard

**Lead time at inference:** `L = floor((checkin_ts − issued_at) / 86400)` — it drives both reachability and the `lead_time` feature.

- Window k is **reachable** iff `L ≥ lower_days[k]`.
- Exposure `e_k = max(0, min(L, upper_k) − lower_k)` days.
- Hazard `h_k(x) = P(cancel in window k | still booked at start of k)`: one gradient-boosted binary classifier on **person-period rows** with window one-hot and exposure as features, isotonic-calibrated.
- `q_k = h_k · Π_{j<k, j reachable}(1 − h_j)` for reachable k, else 0. `P(cancel) = Σ q_k`.

**Person-period construction (training).** For a booking with lead L and cancellation window w (the k with `lower_k ≤ d < upper_k`), emit one row per reachable k in time order 0 → 5, **stopping after k = w**; label 1 iff k == w. Survivors (`Check-Out`, `No-Show`) get every reachable window, all labelled 0. Exposure uses the formula above for every row, including the event row. L = 0 yields a single window-5 row with exposure 0.

**Booking-level scores** (metrics, parity, pricing) always expand **every** reachable window, predict each h_k and apply the q / P(cancel) function shared with `packages/core`. Truncated training rows are never aggregated.

No-shows are not priced: every template refunds 0 after check-in and a no-show night cannot be resold.

### Training data

Hotel Booking Demand (Antonio, Almeida & Nunes, *Data in Brief* 22, 2019): 119,390 bookings, two Portuguese hotels, arrivals 2015-07-01 → 2017-08-31. Raw `is_canceled` = 37.0% (36.0% cancelled + 1.0% no-show). Public copy: `https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-02-11/hotels.csv`.

- **Population:** `deposit_type == "No Deposit"`, `market_segment != "Undefined"`, `distribution_channel != "Undefined"`, `adults ≥ 1`, `stays_in_weekend_nights + stays_in_week_nights ≥ 1`; `children` NaN → 0. ≈ 103,588 bookings, 27.4% cancelled, 1.1% no-show. Rationale: `q_k` must be the hazard when cancelling returns money — exactly what the pricing prices. ("Non Refund" rows are 99.4% "cancelled" group blocks — a known artifact.)
- **Features come from the adapter, never from dataset columns:** for each row reconstruct a request — `issued_at` = arrival date − `lead_time` days at 00:00, `checkin` = arrival date, `checkout` = arrival + (weekend + week nights) — and run `ml/stumari_ml/adapter.py`. Month names map January=1 … December=12 for building the date only.
- Cancellation day `d = (arrival − reservation_status_date).days` (always within `[0, lead_time]` in this data; clip defensively). `Check-Out` and `No-Show` survive.
- **Split by arrival date:** train < 2016-07-01 ≤ validation < 2017-01-01 ≤ test.
- Train with `monotone_constraints = −1` on `previous_bookings_not_canceled` and `is_repeated_guest`, 0 elsewhere.

### Features — only what Stumari knows at quote time

| Feature | Definition (adapter) |
|---|---|
| `lead_time` | L (above) |
| `arrival_month` | check-in month 1–12 |
| `arrival_dow` | check-in weekday, Monday = 0 |
| `weekend_nights` | nights whose start date is a **Friday or Saturday** (matches `room_types.weekend_rate`) |
| `week_nights` | other nights |
| `adults`, `children` | request; `babies` fixed 0 |
| `is_repeated_guest` | wallet has ≥ 1 `released` Stumari booking |
| `previous_bookings_not_canceled` | count of the wallet's `released` bookings, capped at 3 |
| `market_segment` (one-hot) | `Direct` for guests **and agents** (below) |
| `distribution_channel` (one-hot) | `Direct` |
| `customer_type` (one-hot) | `Transient` |
| `hotel` (one-hot) | hotel setting `City Hotel` \| `Resort Hotel` |
| `meal` (one-hot) | room type setting `BB` \| `HB` \| `FB` \| `SC` (`Undefined` in data → `SC`) |
| `window` (one-hot 0–5), `exposure_days` | person-period |

**Agents are priced as direct buyers** (product decision, ADR-0014): an AI agent acting for its own user is a direct booking; the dataset's Online TA segment is third-party resellers, which cancel 2.6× more (35.8% vs 13.7%). `buyer_type` is still recorded and shown in the explain block.

**Excluded on purpose:** `deposit_type` (our treatment + artifact), `country` (unknown at quote time), `previous_cancellations` (non-monotone artifact — 1 prior cancel → 86% — and trivially dodged with a fresh wallet), `adr` (EUR price levels do not transfer to USD Tbilisi rates; no measured AUC gain; keeps the multiplier independent of the base rate), `arrival_date_week_number` (non-ISO, redundant with month), `booking_changes`, `assigned_room_type`, `days_in_waiting_list`, `agent`, `company`, `reservation_status*`, parking and special requests.

Unknown category at inference → all-zero one-hot group (deterministic; tested). Wallet history is used only when the quote has a `buyer_wallet`; otherwise both history features are 0.

### Metrics reported (`ml/reports/`)

All on the **test split of the training population, booking level, full window expansion**:
1. ROC-AUC of the model and of a lead-time-only baseline (expect ≈ 0.70–0.73 vs ≈ 0.64);
2. Brier score next to the base-rate Brier `p̄(1 − p̄)`;
3. reliability curve, 10 equal-count bins, before and after isotonic → `ml/reports/reliability.json` (the web app renders it; a PNG is optional);
4. table of mean predicted vs observed `q_k` per window (report drift honestly — window 3 is over-predicted ~2–3× on 2017 data).

Person-period AUC and Harrell's C are not reported. Demo wording: *"modestly discriminative (AUC ≈ 0.71 vs 0.64 for lead time alone) and calibrated on held-out 2017 arrivals."*

**Toolchain:** `ml/` depends only on numpy, pandas, lightgbm and `sklearn.isotonic`. AUC (rank formula), Brier and reliability bins are implemented in `ml/stumari_ml/metrics.py` (numpy). On this Windows host an Application Control policy blocks `sklearn.metrics` (`_pairwise_fast` DLL); if any compiled wheel is blocked, run `ml/` in WSL (`python3 -m venv ~/stumari-ml`).

### Honest limitation

This is a **prior** learned from Portugal 2015–2017, shared by all hotels in the MVP; each hotel tunes it only through its policy inputs. Each hotel's own on-chain outcomes are the labels for recalibration — roadmap, not MVP.

## 3. Exported artifact — `packages/core/model/model.json`

```jsonc
{
  "format": "stumari-gbdt-hazard/2",
  "version": "hazard-gbdt-YYYY-MM-DD",
  "windows": { "lower_days": [30,14,7,3,1,0] },
  "feature_order": ["lead_time", "...", "window_0", "...", "exposure_days"],
  "encoding": {
    "numeric": ["lead_time","arrival_month","arrival_dow","weekend_nights","week_nights","adults","children","is_repeated_guest","previous_bookings_not_canceled","exposure_days"],
    "one_hot": { "market_segment": ["..."], "distribution_channel": ["..."], "customer_type": ["..."], "hotel": ["..."], "meal": ["..."], "window": ["0","1","2","3","4","5"] }
  },
  "init_score": 0.0,
  "trees": [ { "nodes": [ { "f": 3, "t": 12.5, "l": 1, "r": 2 }, { "v": -0.12 }, { "v": 0.08 } ] } ],
  "calibration": { "type": "isotonic_on_raw_margin", "x": [ ... ], "y": [ ... ] },
  "link": "logistic",
  "metrics": { "...": "..." },
  "population_q_test_mean": [ ... ],
  "training": { "dataset": "hotel-booking-demand", "population": "No Deposit ...", "bookings": 0, "person_period_rows": 0, "split": "..." }
}
```

**Semantics.** Internal node `{f, t, l, r}` → go to `l` iff `x[f] <= t`, else `r`; leaf `{v}`; root = node 0; a tree whose root is a leaf is `nodes: [{v}]`. `raw = Σ tree(x)` summed **sequentially in tree order** (`init_score` is always 0.0 — boost_from_average is already inside tree 0; never add a base-rate logit). `hazard = interp(raw)` with `numpy.interp` semantics (linear, clipped at both ends) over `calibration.x` (raw margins) / `calibration.y`. `link` is used only for the explain block's uncalibrated `p = 1/(1+e^−raw)`. The evaluator throws on any non-finite input.

**Export rules** (`ml/stumari_ml/export.py`, all asserted): train with `lgb.train` on a float64 numpy matrix whose columns are exactly `feature_order` (`feature_name=feature_order`, `categorical_feature=[]`, `objective='binary'`, `boosting='gbdt'`, `linear_tree=False`, deterministic seeds, fixed `num_threads`); assert no NaN/inf before training; export from `booster.dump_model(num_iteration=booster.best_iteration or None)`; assert `objective == 'binary sigmoid:1'`, every internal node has `decision_type == '<='` and `missing_type == 'None'`, and `max_feature_idx + 1 == len(feature_order)`; write floats with Python's default repr (never round `t` or `v` — one-hot splits use threshold `1.0000000180025095e-35`). Isotonic: `IsotonicRegression(out_of_bounds='clip', increasing=True, y_min=0, y_max=1)` fit on validation **raw margins** vs labels; export `X_thresholds_`, `y_thresholds_`. Before writing files, a pure-Python walker of the JSON must reproduce `booster.predict(raw_score=True)` exactly on ≥ 5,000 rows.

### `packages/core/model/parity.json`

```jsonc
{
  "format": "stumari-parity/2",
  "model_version": "hazard-gbdt-YYYY-MM-DD",
  "vectors": [ { "x": [/* feature_order */], "raw": 0.0, "hazard": 0.0 } ],
  "requests": [
    {
      "request": {
        "issued_at": 1790798400, "checkin_ts": 1793872800, "checkin_date": "2026-11-05", "checkout_date": "2026-11-08",
        "adults": 2, "children": 0, "buyer_type": "guest", "hotel_type": "City Hotel", "meal": "BB",
        "is_repeated_guest": 0, "previous_bookings_not_canceled": 0
      },
      "features": { "lead_time": 35, "arrival_month": 11, "arrival_dow": 3, "weekend_nights": 2, "week_nights": 1, "...": "..." },
      "hazard": [0.01, 0.02, 0.02, 0.03, 0.02, 0.01],
      "q": [0.01, 0.0198, 0.019404, 0.02852388, 0.0184454424, 0.009038266776],
      "p_cancel": 0.105211589176
      // null appears only when lead_time < lower_days[k], e.g. lead_time 20 → hazard[0] = null, q[0] = 0
    }
  ]
}
```

(Illustrative: `issued_at` = 2026-10-01 00:00 and `checkin_ts` = 2026-11-05 14:00 in Asia/Tbilisi, so L = 35; 2026-11-05 is a Thursday, so the nights of Thu/Fri/Sat include 2 weekend nights under the Fri/Sat rule.) ≥ 500 `vectors`; ≥ 30 `requests` covering same-day, 1–400-day leads, Fri/Sat vs weekday arrivals, children, repeat guests, agent buyers, unknown meal, year boundaries. Tolerances: `raw` must match **exactly** (same sequential sum), `hazard`, `q`, `p_cancel` to `1e-12` absolute; `features` exactly.

## 4. Contract templates (MVP)

| Template | Tiers `(secs_before → refund)` | Plain language |
|---|---|---|
| `flexible` | `86400 → 100%`, `0 → 50%` | Full refund until 24 h before check-in, then 50% |
| `standard` | `604800 → 100%`, `259200 → 50%`, `0 → 0%` | Full refund until 7 days, 50% until 3 days, then none |
| `nonrefundable` | `0 → 0%` | No refund |

Per-window refund fraction `r_T`: flexible `[1,1,1,1,1,0.5]`, standard `[1,1,1,0.5,0,0]`, nonrefundable `[0,0,0,0,0,0]`.

## 5. Pricing: price room and terms together

**Hotel policy** (all bps; validated in API + DB): `reference_template` R (the blanket policy the hotel uses today, default `standard`), `enabled_templates` (non-empty), `resale_bps[6]` each 0–10000 (default `[9000, 8000, 6500, 4500, 2500, 1000]`), `min_mult_bps` 5000–10000 (default 8500), `max_mult_bps` 10000–20000 (default 13000). Base price `B` = sum of nightly base rates (weekend rate on Fri/Sat nights when set).

**Resale probability** `s_k = resale_bps[k]/10000`: the probability that a night freed by a cancellation in window k is sold to a guest who could not otherwise have been accommodated (i.e. the night would otherwise have sold out). Defaults assume high-season sell-outs; the onboarding checklist asks the hotel's typical occupancy and suggests `[5000, 4000, 3000, 2000, 1000, 0]` below 70%. `s` is shown in the explain block.

**Risk cost of template T for this request:**

```
c_T(x) = Σ_k q_k(x) · max(0, r_T,k − s_k)
```

A cancellation that returns no money is assumed to become a silent no-show (no resale), so the hotel is never credited with profit from a cancellation — conservative. Properties (tested): `c_T ≥ 0`; `c_nonrefundable = 0`; `c_T` is non-decreasing in `r_T` pointwise, hence `P_nonrefundable ≤ P_standard ≤ P_flexible`.

**Per-request anchor.** Reference revenue is what the hotel expects from *this same guest* under its current policy at its base rate: `E_ref(x) = B · (1 − c_R(x))`. Multiplier

```
m_T(x) = (1 − c_R(x)) / (1 − c_T(x)),    P_T = m_T(x) · B
```

so `m_R ≡ 1`: **the hotel's current policy always costs exactly its base rate**; less generous contracts cost less and more generous ones more, by exactly this guest's risk; every shown option earns the hotel the same expected revenue as its current policy would from this guest. (The multiplier is independent of B.)

**Integer money:** for T = R, `m_bps = 10000` directly (never computed). Otherwise `m_bps = round_half_up(m_T(x) · 10000)`. `price_minor = ((B · m_bps + 99_999_999) / 100_000_000) · 10_000` in bigint (B·m_bps/10⁴ rounded **up** to a whole cent). Floats appear only in `c_T`, `m_T` and the explain block.

**Guards.**
- If `1 − c_T(x) ≤ 0.05` or `m_bps > max_mult_bps`, T is **withheld** (explain `withheld: "risk_exceeds_bounds"`) — selling it at the cap would earn less than today's policy.
- If `m_bps < min_mult_bps`, T is priced at `min_mult_bps` (the hotel earns more than today; explain `clamped: "floor"`).
- R is never withheld (`m_R ≡ 1`).
- If two enabled templates have identical refund fractions on **every reachable window** (e.g. standard and non-refundable when L < 3), show only one: R if it is one of them, otherwise the first in the order flexible, standard, non-refundable.
- Assumes a booking stays `Pending` no longer than the confirm window (cron confirms within ~10 min); the 100% refund while Pending is not priced.

## 6. Worked examples (defaults; unit tests in `packages/core`)

B = 100.00 USDC, R = standard, default `resale_bps`.

**Request A (lead 60 d):** `q = [0.132, 0.052, 0.044, 0.043, 0.020, 0.017]`, P(cancel) 0.308.
- `c_std = 0.1·0.132 + 0.2·0.052 + 0.35·0.044 + 0.05·0.043 = 0.04115`
- `c_flex = 0.04115 + 0.55·0.043 − 0.05·0.043 + 0.75·0.020 + 0.4·0.017 = 0.08445`
- `c_nr = 0`
- flexible `m = 0.95885 / 0.91555 = 1.04729` → `m_bps 10473` → **104.73**; standard **100.00**; non-refundable `m = 0.95885` → `m_bps 9589` → **95.89**.

**Request B (lead 2 d):** `q = [0, 0, 0, 0, 0.05, 0.03]`.
- `c_std = c_nr = 0`; `c_flex = 0.75·0.05 + 0.4·0.03 = 0.0495`
- flexible `m = 1/0.9505 = 1.05208` → `m_bps 10521` → **105.21**; standard **100.00**; non-refundable is identical to standard on the reachable windows and is **not shown**.
