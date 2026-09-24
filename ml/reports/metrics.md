# Cancellation model: what it is and how good it is

Model `hazard-gbdt-2026-09-25` - 44 trees, trained on 163,579 person-period rows
from 41,062 bookings; every number below is on **36,294 held-out bookings arriving
January-August 2017** that the model never saw (booking level, all reachable windows scored).

## 30-second summary

- **What it predicts:** for each of six time windows before check-in, the chance a guest cancels in that
  window if they have not cancelled yet. Summed up, that gives the probability the booking cancels at all.
- **Ranking (AUC):** **0.713** vs **0.634** for ranking by lead time
  alone (+0.079). Modestly discriminative: it tells risky requests from safe ones clearly better than
  the single strongest rule of thumb, but it is not a crystal ball.
- **Accuracy (Brier score, lower is better):** **0.1917** vs **0.2136** for
  always predicting the true 2017 cancel rate (30.9%) - 10.3% better than a
  forecaster who already knew the base rate in advance.
- **Calibration:** Platt scaling was fit on July-December 2016 arrivals. On 2017 arrivals the average
  predicted cancel probability is 29.9% against 30.9% observed, and
  across ten equal-size groups of bookings predictions are off by 0.038 on average
  (expected calibration error; 0.041 uncalibrated;
  0.029 with isotonic regression, which is a step
  function and would make nearby requests share identical prices). See `reliability.json`.

## Per-window cancellation (mean over test bookings)

| Window | Predicted mean q | Observed q | Predicted / observed |
|---|---|---|---|
| 0 (30+ days) | 0.1540 | 0.1976 | 0.78x |
| 1 (14-30 days) | 0.0502 | 0.0529 | 0.95x |
| 2 (7-14 days) | 0.0370 | 0.0317 | 1.17x |
| 3 (3-7 days) | 0.0325 | 0.0125 | 2.61x |
| 4 (1-3 days) | 0.0140 | 0.0078 | 1.81x |
| 5 (last day) | 0.0115 | 0.0069 | 1.67x |

**Drift, honestly:** the largest per-window gap is window 3 (3-7 days), over-predicted 2.61x on 2017 arrivals. The timing of cancellations moved: 2.37% of July-December 2016 bookings (the calibration set) cancelled in that window versus 1.25% in 2017. Overall P(cancel) stays close because per-window errors partly offset, but pricing uses the per-window q, so this drift matters and is the first thing per-hotel recalibration corrects.

## Honest limitations

- **Transfer:** this is a prior learned from two Portuguese hotels, 2015-2017 (Hotel Booking Demand,
  Antonio, Almeida & Nunes 2019). Tbilisi hotels in 2026 differ in guests, seasonality and channels. Every
  hotel shares this prior in the MVP and tunes it only through its own policy inputs; recalibration on each
  hotel's on-chain outcomes is roadmap.
- Only request-time information is used (lead time, dates, party size, meal plan, hotel type, wallet
  history). No price, country or deposit features.
- AI agents are scored as direct bookers (ADR-0014).

## Reproducibility

`python -m stumari_ml.train` (from `ml/`) rebuilds everything deterministically. The exported
`packages/core/model/model.json` was checked tree-by-tree: a pure-Python walker reproduces LightGBM's raw
score exactly on 6,000 test rows; `parity.json` carries vectors for the TypeScript evaluator.
