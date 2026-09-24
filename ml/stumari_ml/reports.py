"""Write ml/reports/: metrics.json, reliability.json, metrics.md and optional PNGs."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from .windows import LOWER_DAYS

WINDOW_LABELS = ("30+ days", "14-30 days", "7-14 days", "3-7 days", "1-3 days", "last day")
SERIES_1 = "#2a78d6"  # blue: calibrated / predicted
SERIES_2 = "#eb6834"  # orange: uncalibrated / observed
SURFACE = "#fcfcfb"
INK = "#2b2b29"
MUTED = "#8a8a84"


def _write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")


def _window_rows(windows: list[Mapping[str, Any]]) -> str:
    lines = ["| Window | Predicted mean q | Observed q | Predicted / observed |", "|---|---|---|---|"]
    for row in windows:
        ratio = "n/a" if row["ratio"] is None else f"{row['ratio']:.2f}x"
        lines.append(
            f"| {row['window']} ({WINDOW_LABELS[row['window']]}) | {row['predicted_q']:.4f} | "
            f"{row['observed_q']:.4f} | {ratio} |"
        )
    return "\n".join(lines)


def _drift_note(test_windows: list[Mapping[str, Any]], validation_windows: list[Mapping[str, Any]]) -> str:
    worst = max((w for w in test_windows if w["ratio"] is not None), key=lambda w: abs(w["ratio"] - 1.0))
    k = worst["window"]
    direction = "over" if worst["ratio"] > 1 else "under"
    return (
        f"**Drift, honestly:** the largest per-window gap is window {k} ({WINDOW_LABELS[k]}), "
        f"{direction}-predicted {worst['ratio']:.2f}x on 2017 arrivals. The timing of cancellations moved: "
        f"{validation_windows[k]['observed_q']:.2%} of July-December 2016 bookings (the calibration set) "
        f"cancelled in that window versus {worst['observed_q']:.2%} in 2017. Overall P(cancel) stays close "
        "because per-window errors partly offset, but pricing uses the per-window q, so this drift matters and "
        "is the first thing per-hotel recalibration corrects."
    )


def markdown(
    version: str,
    test: Mapping[str, Any],
    validation: Mapping[str, Any],
    training: Mapping[str, Any],
    walker_rows: int,
) -> str:
    auc_gain = test["auc"] - test["auc_lead_time_only"]
    brier_gain = 1.0 - test["brier"] / test["brier_base_rate"]
    splits = training["bookings_by_split"]
    return f"""# Cancellation model: what it is and how good it is

Model `{version}` - {training['trees']} trees, trained on {training['person_period_rows']:,} person-period rows
from {splits['train']:,} bookings; every number below is on **{test['bookings']:,} held-out bookings arriving
January-August 2017** that the model never saw (booking level, all reachable windows scored).

## 30-second summary

- **What it predicts:** for each of six time windows before check-in, the chance a guest cancels in that
  window if they have not cancelled yet. Summed up, that gives the probability the booking cancels at all.
- **Ranking (AUC):** **{test['auc']:.3f}** vs **{test['auc_lead_time_only']:.3f}** for ranking by lead time
  alone (+{auc_gain:.3f}). Modestly discriminative: it tells risky requests from safe ones clearly better than
  the single strongest rule of thumb, but it is not a crystal ball.
- **Accuracy (Brier score, lower is better):** **{test['brier']:.4f}** vs **{test['brier_base_rate']:.4f}** for
  always predicting the true 2017 cancel rate ({test['cancel_rate']:.1%}) - {brier_gain:.1%} better than a
  forecaster who already knew the base rate in advance.
- **Calibration:** {test['calibration']} was fit on July-December 2016 arrivals. On 2017 arrivals the average
  predicted cancel probability is {test['mean_p_cancel']:.1%} against {test['cancel_rate']:.1%} observed, and
  across ten equal-size groups of bookings predictions are off by {test['ece']:.3f} on average
  (expected calibration error; {test['ece_uncalibrated']:.3f} uncalibrated;
  {test['alternative_calibration']['ece']:.3f} with {test['alternative_calibration']['method']}, which is a step
  function and would make nearby requests share identical prices). See `reliability.json`.

## Per-window cancellation (mean over test bookings)

{_window_rows(test['windows'])}

{_drift_note(test['windows'], validation['windows'])}

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
score exactly on {walker_rows:,} test rows; `parity.json` carries vectors for the TypeScript evaluator.
"""


def _plots(reports_dir: Path, test: Mapping[str, Any]) -> list[str]:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return []

    def style(ax: Any) -> None:
        ax.set_facecolor(SURFACE)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(MUTED)
        ax.tick_params(colors=INK, labelsize=9)
        ax.grid(color="#e4e4df", linewidth=0.6)
        ax.set_axisbelow(True)

    written = []
    fig, ax = plt.subplots(figsize=(6, 5), dpi=150, facecolor=SURFACE)
    style(ax)
    limit = max(max(b["mean_predicted"], b["observed_rate"]) for key in ("reliability_before", "reliability_after")
                for b in test[key]) * 1.05
    ax.plot([0, limit], [0, limit], color=MUTED, linewidth=1, linestyle="--", label="perfect calibration")
    for key, color, label in (
        ("reliability_before", SERIES_2, "uncalibrated"),
        ("reliability_after", SERIES_1, f"after {test['calibration']}"),
    ):
        bins = test[key]
        ax.plot([b["mean_predicted"] for b in bins], [b["observed_rate"] for b in bins], color=color,
                linewidth=2, marker="o", markersize=5, label=label)
    ax.set_xlim(0, limit)
    ax.set_ylim(0, limit)
    ax.set_xlabel("Predicted P(cancel) - bin mean", color=INK)
    ax.set_ylabel("Observed cancel rate", color=INK)
    ax.set_title("Calibration on 2017 test bookings (10 equal-count bins)", color=INK, fontsize=11)
    ax.legend(frameon=False, fontsize=9, labelcolor=INK)
    fig.tight_layout()
    fig.savefig(reports_dir / "calibration.png", facecolor=SURFACE)
    plt.close(fig)
    written.append("calibration.png")

    fig, ax = plt.subplots(figsize=(7, 4), dpi=150, facecolor=SURFACE)
    style(ax)
    positions = range(len(LOWER_DAYS))
    width = 0.38
    ax.bar([p - width / 2 - 0.01 for p in positions], [w["predicted_q"] for w in test["windows"]], width,
           color=SERIES_1, label="predicted")
    ax.bar([p + width / 2 + 0.01 for p in positions], [w["observed_q"] for w in test["windows"]], width,
           color=SERIES_2, label="observed")
    ax.set_xticks(list(positions), WINDOW_LABELS)
    ax.set_ylabel("Share of bookings cancelling in window", color=INK)
    ax.set_title("Cancellation by window before check-in (2017 test bookings)", color=INK, fontsize=11)
    ax.legend(frameon=False, fontsize=9, labelcolor=INK)
    fig.tight_layout()
    fig.savefig(reports_dir / "hazard_by_window.png", facecolor=SURFACE)
    plt.close(fig)
    written.append("hazard_by_window.png")
    return written


def write_all(
    reports_dir: Path,
    *,
    version: str,
    test: Mapping[str, Any],
    validation: Mapping[str, Any],
    training: Mapping[str, Any],
    model_bytes: int,
    walker_rows: int,
) -> list[str]:
    reports_dir.mkdir(parents=True, exist_ok=True)
    reliability = {
        "model_version": version,
        "split": "test",
        "level": "booking, full window expansion",
        "bins": 10,
        "binning": "equal-count over predicted P(cancel), sorted ascending",
        "before": test["reliability_before"],
        "after": test["reliability_after"],
    }
    _write_json(reports_dir / "reliability.json", reliability)
    _write_json(
        reports_dir / "metrics.json",
        {
            "model_version": version,
            "test": test,
            "validation": {k: v for k, v in validation.items() if not k.startswith("reliability")},
            "training": training,
            "model_json_bytes": model_bytes,
            "walker_parity_rows": walker_rows,
        },
    )
    (reports_dir / "metrics.md").write_text(markdown(version, test, validation, training, walker_rows), encoding="utf-8",
                                            newline="\n")
    return ["reliability.json", "metrics.json", "metrics.md", *_plots(reports_dir, test)]
