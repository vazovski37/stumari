"""End-to-end pipeline: python -m stumari_ml.train (run from ml/)."""

from __future__ import annotations

import argparse
import time
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

from . import export, model, parity, reports
from .adapter import build_encoding, encode, feature_order
from .calibrate import describe, fit_isotonic, fit_platt
from .data import POPULATION, SPLIT_DESCRIPTION, SPLITS, Bookings, build_bookings, load_population, vocabulary
from .evaluate import score_bookings, summarize
from .periods import expand

ML_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = ML_DIR.parent
PARITY_VECTORS = 600
WALKER_CHECK_ROWS = 6_000
HEADLINE_KEYS = (
    "bookings", "cancel_rate", "auc", "auc_lead_time_only", "brier", "brier_base_rate", "ece", "mean_p_cancel",
)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ML_DIR / "data" / "raw" / "hotels.csv")
    parser.add_argument("--model-dir", type=Path, default=REPO_DIR / "packages" / "core" / "model")
    parser.add_argument("--reports-dir", type=Path, default=ML_DIR / "reports")
    parser.add_argument("--version-date", default=date.today().isoformat(), help="YYYY-MM-DD in the model version")
    parser.add_argument("--calibration", choices=("platt", "isotonic"), default="platt",
                        help="calibrator exported to model.json (the other is reported for comparison)")
    return parser.parse_args(argv)


def _matrix(bookings: Bookings, encoding: dict[str, Any]) -> np.ndarray:
    return np.array([encode(f, encoding) for f in bookings.features], dtype=np.float64)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    started = time.perf_counter()

    bookings = build_bookings(load_population(args.data))
    split = {name: bookings.subset(name) for name in SPLITS}
    encoding = build_encoding(vocabulary(split["train"]))
    order = feature_order(encoding)
    matrix = {name: _matrix(b, encoding) for name, b in split.items()}
    periods = {
        name: expand(matrix[name], b.lead, b.event_window, truncate=True) for name, b in split.items()
    }
    print(f"bookings {len(bookings)}; person-period rows " + ", ".join(f"{k} {len(v.label)}" for k, v in periods.items()))

    booster = model.train(periods["train"].X, periods["train"].label, periods["validation"].X,
                          periods["validation"].label, order)
    validation_raw = model.predict_raw(booster, periods["validation"].X)
    fitted = {
        "platt": fit_platt(validation_raw, periods["validation"].label),
        "isotonic": fit_isotonic(validation_raw, periods["validation"].label),
    }
    calibration = fitted[args.calibration]
    alternative = fitted["isotonic" if args.calibration == "platt" else "platt"]
    trees = booster.best_iteration or booster.current_iteration()
    print(f"trees {trees}; calibration {describe(calibration)}")

    scores = {
        name: score_bookings(booster, calibration, matrix[name], split[name].lead, split[name].event_window)
        for name in ("validation", "test")
    }
    test = summarize(scores["test"])
    validation = summarize(scores["validation"])
    compare = summarize(score_bookings(booster, alternative, matrix["test"], split["test"].lead,
                                       split["test"].event_window))
    test["calibration"] = describe(calibration)
    test["alternative_calibration"] = {
        "method": describe(alternative),
        "ece": compare["ece"],
        "brier": compare["brier"],
        "auc": compare["auc"],
    }
    headline = {key: test[key] for key in HEADLINE_KEYS}

    training = {
        "dataset": "hotel-booking-demand (Antonio, Almeida & Nunes, Data in Brief 22, 2019)",
        "population": POPULATION,
        "bookings": len(bookings),
        "bookings_by_split": {name: len(b) for name, b in split.items()},
        "person_period_rows": len(periods["train"].label),
        "person_period_rows_validation": len(periods["validation"].label),
        "split": SPLIT_DESCRIPTION,
        "trees": trees,
        "params": {k: v for k, v in model.PARAMS.items() if k not in ("verbosity", "metric")},
        "monotone_decreasing": list(model.MONOTONE_DECREASING),
        "max_trees": model.MAX_TREES,
        "early_stopping_rounds": model.EARLY_STOPPING_ROUNDS,
    }
    version = f"hazard-gbdt-{args.version_date}"
    model_json = export.build_model(
        booster,
        version=version,
        feature_order=order,
        encoding=encoding,
        calibration=calibration,
        metrics=headline,
        population_q_test_mean=[row["predicted_q"] for row in test["windows"]],
        training=training,
    )

    rng = np.random.default_rng(model.SEED)
    test_rows = periods["test"].X
    check = np.sort(rng.choice(len(test_rows), WALKER_CHECK_ROWS, replace=False))
    checked = export.assert_walker_parity(model_json, booster, test_rows[check])
    sample = np.sort(rng.permutation(check)[:PARITY_VECTORS])  # representative, not the lowest indices
    parity_json = parity.build_parity(model_json, test_rows[sample])
    print(f"walker == booster.predict(raw_score=True) on {checked} rows")

    model_bytes = export.write_model(args.model_dir / "model.json", model_json)
    (args.model_dir / "parity.json").write_text(export.dumps(parity_json) + "\n", encoding="utf-8", newline="\n")
    written = reports.write_all(
        args.reports_dir,
        version=version,
        test=test,
        validation=validation,
        training=training,
        model_bytes=model_bytes,
        walker_rows=checked,
    )
    print("reports: " + ", ".join(written))
    print(
        f"test AUC {test['auc']:.4f} (lead-only {test['auc_lead_time_only']:.4f}); "
        f"Brier {test['brier']:.4f} (base rate {test['brier_base_rate']:.4f}); "
        f"model.json {model_bytes} bytes; {time.perf_counter() - started:.0f}s"
    )


if __name__ == "__main__":
    main()
