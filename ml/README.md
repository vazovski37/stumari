# ml/ — cancellation hazard model

Trains the discrete-time time-to-cancel model of `docs/architecture/pricing-and-risk-model.md` (§1–3; that
spec is the contract) and exports it for the TypeScript evaluator in `packages/core`.

## Run

From `ml/`, using the existing host venv (Windows, Python 3.11.9):

```bash
./.venv/Scripts/python.exe -m stumari_ml.train      # ~5 s: trains, calibrates, evaluates, exports
./.venv/Scripts/python.exe -m stumari_ml.selftest   # tests in ml/tests (pytest also works: python -m pytest)
```

Options: `--data` (default `data/raw/hotels.csv`), `--model-dir` (default `../packages/core/model`),
`--reports-dir` (default `reports`), `--version-date YYYY-MM-DD` (default today; it only sets the version
string). The pipeline is deterministic: fixed seed, `deterministic=True`, `force_col_wise=True`,
`num_threads=4`, no bagging or feature sampling. Two consecutive runs produce byte-identical outputs.

Dataset: `data/raw/hotels.csv` (gitignored; public copy at
`https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-02-11/hotels.csv`).
Dependencies are pinned in `requirements.txt` (numpy, pandas, lightgbm, scikit-learn for
`sklearn.isotonic` only, matplotlib for the optional PNGs).

**Application Control note.** This Windows host blocks `sklearn.metrics` (`_pairwise_fast` DLL), so
metrics are implemented in `stumari_ml/metrics.py` with numpy and only `sklearn.isotonic` is imported.
Everything the pipeline needs imports fine on the host today. If a compiled wheel is ever blocked, run the
same commands in WSL: `python3 -m venv ~/stumari-ml && ~/stumari-ml/bin/pip install -r requirements.txt`, then
`cd /mnt/c/Users/User/Workspace/colosseum/ml && ~/stumari-ml/bin/python -m stumari_ml.train`.

## Outputs

| File | What |
|---|---|
| `packages/core/model/model.json` | `stumari-gbdt-hazard/2`: trees, isotonic table, encoding, headline metrics (~105 KB) |
| `packages/core/model/parity.json` | `stumari-parity/2`: 600 raw vectors + 38 end-to-end request cases |
| `reports/metrics.md` | 30-second plain-language summary for judges |
| `reports/metrics.json` | full test and validation metrics, training metadata |
| `reports/reliability.json` | 10 equal-count bins before/after isotonic (the web app renders this) |
| `reports/calibration.png`, `reports/hazard_by_window.png` | optional plots |

## Package layout (`stumari_ml/`)

| Module | Role |
|---|---|
| `windows.py` | window bounds, reachability, exposure, `q_from_hazard`, `p_cancel` |
| `adapter.py` | **the reference feature adapter** (request → features) and one-hot encoding |
| `data.py` | load CSV, population filter, cleaning, reconstructed requests, split |
| `periods.py` | person-period expansion (truncated for training, full for scoring) |
| `model.py` | `lgb.train` on a float64 matrix in `feature_order`, monotone constraints, early stopping |
| `calibrate.py` | `IsotonicRegression` on validation raw margins |
| `jsonmodel.py` | pure-Python evaluator of `model.json` (sequential raw sum + `numpy.interp`) |
| `export.py` | `dump_model` → JSON with every spec assertion; walker == booster on 6,000 rows |
| `evaluate.py`, `metrics.py` | booking-level metrics on the full window expansion |
| `parity.py` | parity vectors and the request fixtures |
| `reports.py`, `train.py`, `selftest.py` | reports, entrypoint, test runner |

## Adapter rules (port these exactly)

Input request: `{issued_at, checkin_ts, checkin_date, checkout_date, adults, children, buyer_type,
hotel_type, meal, is_repeated_guest, previous_bookings_not_canceled}`.

Validation (throw): `issued_at`, `checkin_ts` integers ≥ 0 with `checkin_ts ≥ issued_at`; dates are
`YYYY-MM-DD` with `checkout_date > checkin_date`; `buyer_type ∈ {guest, agent}`; `adults ≥ 1`,
`children ≥ 0`, `previous_bookings_not_canceled ≥ 0` integers (booleans rejected); `is_repeated_guest ∈ {0, 1}`.

| Feature | Rule |
|---|---|
| `lead_time` | `floor((checkin_ts − issued_at) / 86400)` — integer division on seconds, never from the dates |
| `arrival_month` | month of `checkin_date` (1–12) |
| `arrival_dow` | weekday of `checkin_date`, **Monday = 0 … Sunday = 6** |
| `weekend_nights` | nights `checkin_date + i` (i = 0 … nights−1) whose date is a **Friday or Saturday** |
| `week_nights` | `nights − weekend_nights`, with `nights = checkout_date − checkin_date` in days |
| `adults`, `children` | as given |
| `is_repeated_guest` | as given (server: wallet has ≥ 1 `released` booking; 0 without `buyer_wallet`) |
| `previous_bookings_not_canceled` | `min(value, 3)` |
| `market_segment`, `distribution_channel`, `customer_type` | always `Direct`, `Direct`, `Transient` — for guests **and** agents (ADR-0014) |
| `hotel` | `hotel_type` as given |
| `meal` | `meal` as given (no mapping at inference) |

Dates are read from the date strings only; timestamps are used only for `lead_time`. Calendar arithmetic
is proleptic Gregorian on plain dates (no time zone involved).

**Encoding.** The booking vector is, in order: the nine numeric features above (the order of
`encoding.numeric` minus `exposure_days`), then for each group in `market_segment, distribution_channel,
customer_type, hotel, meal` one indicator per value in `encoding.one_hot[group]` (1 if the feature equals
that value, else 0). An unknown value (e.g. meal `AI`, hotel `Guest House`) yields an all-zero group. The
per-window row appends `window_0 … window_5` (one-hot of k) and `exposure_days`. Column names are
`<group>_<slug(value)>` where slug lowercases and replaces each run of non-alphanumerics with `_`
(`Offline TA/TO` → `market_segment_offline_ta_to`); `model.json.feature_order` is authoritative.

**Scoring a request.** For each k in 0…5: reachable iff `lead_time ≥ lower_days[k]`; if reachable,
`x = booking_vector ++ onehot(k) ++ [exposure_days(L, k)]` with
`exposure = max(0, min(L, upper_k) − lower_k)`, `upper = [L, 30, 14, 7, 3, 1]`; `raw` = sequential sum of
tree outputs in tree order starting from `init_score` (0.0); `hazard = interp(raw, calibration.x,
calibration.y)` with numpy semantics (linear, clamped to the end values; `x` is strictly increasing).
Then with `s = 1.0`, for k = 0…5: unreachable → `q_k = 0`; reachable → `q_k = h_k · s`, `s = s · (1 − h_k)`.
`p_cancel = q_0 + q_1 + … + q_5`, summed left to right.

**Training-only override.** Reconstructed training rows call `adapt(request, channel=...)` with the
dataset's `market_segment`, `distribution_channel` and `customer_type`; serving never passes `channel`.
Training requests are `issued_at = arrival 00:00 UTC − lead_time days`, `checkin_ts = arrival 00:00 UTC`,
`checkout = arrival + (weekend + week nights)`, so `lead_time` equals the dataset's lead time exactly.
Dataset cleaning (in `data.py`, not the adapter): `children` NaN → 0, meal `Undefined` → `SC`.

## parity.json

- `vectors[]`: `{x, raw, hazard}` for 600 rows sampled (seeded) from test person-period rows. `x` is in
  `feature_order`. `raw` must match **exactly**; `hazard` to 1e-12.
- `requests[]`: `{note, request, features, raw, hazard, q, p_cancel}`. Timestamps are realistic Asia/Tbilisi
  times (UTC+4, no DST). `features` is the **encoded booking vector as an object** keyed by column name
  (every `feature_order` entry except `window_*` and `exposure_days`), integers — compare exactly.
  `raw`/`hazard` are per window with `null` when unreachable (`q` is then 0). `raw` is an extra field beyond
  the spec example, for debugging the exact sum. Cases cover same-day and sub-24 h quotes (lead 0), exact
  boundary leads (3, 7, 14, 30 to the second), leads 1–400, Fri/Sat vs weekday arrivals, children, repeat
  guests (history 7 capped to 3), agent buyers (identical features to guests), unknown meal and hotel type,
  year boundaries, a leap day and non-14:00 check-in times.

## Model notes

- Population: No Deposit, defined segment/channel, ≥ 1 adult, ≥ 1 night → 103,588 bookings (27.4% cancelled).
- Split by arrival: train < 2016-07-01 ≤ validation < 2017-01-01 ≤ test. Early stopping on validation
  person-period log loss (≤ 300 trees, 31 leaves); isotonic fit on validation raw margins.
- Monotone constraint −1 on `is_repeated_guest` and `previous_bookings_not_canceled` (tested on the export).
- The isotonic table is a step function, so nearby raw margins share a hazard (178 reachable request
  windows in parity.json map to 19 distinct hazards). This is the spec's calibrator; see `reports/metrics.md`
  for accuracy and drift.
