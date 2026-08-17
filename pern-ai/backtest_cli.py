"""CLI: run a conformalized quantile backtest on a labeled dataset CSV.

Usage:
    python backtest_cli.py data.csv --target temperature \
        --split temporal --group agriculture
"""
import argparse
import sys

import numpy as np
import pandas as pd

from app.ml.backtest import confidence_score, run_backtest
from app.ml.cv import leave_locations_out_split, temporal_block_split
from app.ml.metrics import summarize


def _load(path):
    df = pd.read_csv(path)
    df["ts"] = pd.to_datetime(df["ts"])
    return df


def main(argv=None):
    ap = argparse.ArgumentParser(description="PERN AI backtest")
    ap.add_argument("dataset")
    ap.add_argument("--target", required=True)
    ap.add_argument("--split", choices=["temporal", "spatial"], default="temporal")
    ap.add_argument("--group", default=None)
    ap.add_argument("--alpha", type=float, default=0.1)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--model", choices=["lightgbm", "sklearn", "persistence"], default="lightgbm")
    args = ap.parse_args(argv)

    df = _load(args.dataset)
    if args.group:
        df = df[df["feature_group"] == args.group]
    if len(df) < 50:
        print(f"dataset too small ({len(df)} rows); need >= 50", file=sys.stderr)
        return 2

    if args.split == "temporal":
        folds = temporal_block_split(df, n_folds=args.folds)
    else:
        folds = leave_locations_out_split(df, n_groups=args.folds)

    if args.model == "lightgbm":
        from app.ml.models import LightGBMQuantile

        model = LightGBMQuantile(n_estimators=200)
    elif args.model == "sklearn":
        from app.ml.models import SklearnQuantile

        model = SklearnQuantile(max_iter=150)
    else:
        from app.ml.backtest import feature_columns
        from app.ml.models import PersistenceResidual

        model = PersistenceResidual(
            temp_idx=feature_columns(df, args.target).index("temperature")
        )

    result = run_backtest(df, model, args.target, folds, alpha=args.alpha)

    print(f"\nfeatures ({len(result['features'])}): {', '.join(result['features'])}")
    print(f"folds: {len(result['folds'])} | alpha: {result['alpha']}")
    print(f"\n{'metric':<14}{'value':>12}")
    print("-" * 26)
    for k, v in result["metrics"].items():
        print(f"{k:<14}{v:>12.4f}")

    target_std = df[args.target].std()
    score = confidence_score(
        result["metrics"]["interval_width"],
        target_std,
        result["metrics"]["coverage"],
        alpha=args.alpha,
    )
    print(f"\nconfidence score: {score} / 100")
    return 0


if __name__ == "__main__":
    sys.exit(main())
