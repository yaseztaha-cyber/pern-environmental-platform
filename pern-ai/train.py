"""Train a conformalized quantile model and persist the artifact.

Usage:
    python train.py --dataset data/synthetic_labeled.csv --group agriculture
    python train.py   # synthetic fallback
    python train.py --promote   # only replace the served artifact if the
                                # candidate backtest beats the incumbent

Writes:
    models/artifact.joblib  — {features, model, alpha, qhat, target_std, trained_ts}
    models/metrics.json     — backtest summary (temporal + spatial splits)
    models/promotions.jsonl — promotion-gate log (with --promote)
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd

from app.ml.backtest import confidence_score, feature_columns, run_backtest
from app.ml.conformal import cqr_quantile
from app.ml.cv import calibration_split, leave_locations_out_split, temporal_block_split
from app.ml.labels import load_training_data
from app.ml.metrics import interval_coverage, rmse
from app.ml.models import LightGBMQuantile, PersistenceResidual, SklearnQuantile


def _model(kind, fast=False, temp_idx=0):
    if kind == "sklearn":
        return SklearnQuantile(max_iter=100 if fast else 150)
    if kind == "persistence":
        return PersistenceResidual(temp_idx=temp_idx)
    return LightGBMQuantile(n_estimators=100 if fast else 200)


def main(argv=None):
    ap = argparse.ArgumentParser(description="PERN AI training")
    ap.add_argument("--dataset", default=None)
    ap.add_argument("--group", default=None)
    ap.add_argument("--model", choices=["lightgbm", "sklearn", "persistence"], default="persistence")
    ap.add_argument("--alpha", type=float, default=0.1)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--out", default="models/artifact.joblib")
    ap.add_argument("--fast", action="store_true", help="smaller models (smoke runs)")
    ap.add_argument(
        "--promote",
        action="store_true",
        help="promotion gate: replace the served artifact only if the candidate "
        "temporal backtest is at least as calibrated and accurate as the incumbent",
    )
    ap.add_argument("--promote-coverage-tol", type=float, default=0.02)
    ap.add_argument("--promote-rmse-tol", type=float, default=1.02)
    ap.add_argument(
        "--holdout-days",
        type=int,
        default=14,
        help="evaluate on a final slice of this many most-recent days that model "
        "selection must NEVER touch; 0 disables",
    )
    ap.add_argument(
        "--transform",
        choices=["level", "delta"],
        default="level",
        help="'delta' models the day-over-day change (target - temperature), "
        "anchored to observed temperature at inference; more robust under trend.",
    )
    args = ap.parse_args(argv)

    df = load_training_data(dataset_path=args.dataset, feature_group=args.group)
    if args.transform == "delta":
        if "temperature" not in df.columns:
            print("--transform delta requires a 'temperature' feature column", file=sys.stderr)
            return 2
        df = df.dropna(subset=["temperature"]).copy()
        df["target"] = df["target"] - df["temperature"]
    print(f"rows: {len(df)} | target std: {df['target'].std():.3f} | transform: {args.transform}")

    temporal = temporal_block_split(df, n_folds=args.folds)
    spatial = leave_locations_out_split(df, n_groups=min(args.folds, df["latitude"].nunique()))

    bt_cols = feature_columns(df, "target")
    bt_temp_idx = bt_cols.index("temperature") if args.model == "persistence" else 0

    results = {}
    for name, folds in (("temporal", temporal), ("spatial", spatial)):
        m = _model(args.model, fast=args.fast, temp_idx=bt_temp_idx)
        results[name] = run_backtest(df, m, "target", folds, alpha=args.alpha)

    # Final holdout: the most recent N days, used once at the end. Model
    # selection (lag/neighbor/gamma experiments, model_type choice) must not
    # look at this slice — it is the only unbiased estimate of served skill.
    holdout_metrics = None
    if args.holdout_days and args.holdout_days > 0:
        order = df["ts"].argsort().to_numpy()
        cutoff = df["ts"].iloc[order[-1]] - pd.Timedelta(days=args.holdout_days)
        ho_idx = np.where(df["ts"].iloc[order].to_numpy() >= cutoff)[0]
        if 0 < len(ho_idx) < len(order) and len(order) - len(ho_idx) >= 50:
            ho = order[ho_idx]
            holdout_fold = [(order[:len(order) - len(ho)], ho)]
            hm = _model(args.model, fast=args.fast, temp_idx=bt_temp_idx)
            holdout_metrics = run_backtest(df, hm, "target", holdout_fold, alpha=args.alpha)
        elif args.holdout_days > 0:
            print(f"[holdout] skipped: {args.holdout_days}d slice too small "
                  f"(n={len(ho_idx)})", file=sys.stderr)

    out_dir = os.path.dirname(args.out)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(args.out))[0]
    metrics_name = "metrics.json" if stem in ("", "artifact") else f"{stem}_metrics.json"
    promotions_name = "promotions.jsonl" if stem in ("", "artifact") else f"{stem}_promotions.jsonl"
    metrics_path = os.path.join(out_dir or ".", metrics_name)
    promotions_path = os.path.join(out_dir or ".", promotions_name)

    # Promotion gate: candidate must not be materially worse than the
    # incumbent on the temporal (forecast) split before it may replace the
    # served artifact.
    promoted = True
    gate_reasons = []
    if args.promote and os.path.exists(metrics_path):
        with open(metrics_path) as fh:
            incumbent = json.load(fh)
        inc_t = incumbent.get("temporal", {}).get("metrics", {})
        cand_t = results["temporal"]["metrics"]
        inc_cov, cand_cov = inc_t.get("coverage", 0), cand_t["coverage"]
        inc_rmse, cand_rmse = inc_t.get("rmse", 1e9), cand_t["rmse"]
        nominal = 1.0 - args.alpha
        if abs(cand_cov - nominal) > abs(inc_cov - nominal) + args.promote_coverage_tol:
            gate_reasons.append(
                f"coverage degrades: candidate {cand_cov:.3f} vs incumbent {inc_cov:.3f} "
                f"(nominal {nominal:.3f})"
            )
        if cand_rmse > inc_rmse * args.promote_rmse_tol + 1e-9:
            gate_reasons.append(f"rmse worse: candidate {cand_rmse:.3f} vs incumbent {inc_rmse:.3f}")
        promoted = not gate_reasons
        decision = "promoted" if promoted else "rejected"
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "decision": decision,
            "model": args.model,
            "transform": args.transform,
            "dataset": args.dataset,
            "candidate_temporal": cand_t,
            "incumbent_temporal": inc_t,
            "reasons": gate_reasons,
        }
        with open(promotions_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
        print(f"[gate] {decision}: " + ("; ".join(gate_reasons) or "candidate is at least as good as incumbent"))
        if not promoted:
            return 0

    # Final model: fit on all data, calibrate on held-out most-recent slice.
    fit_idx, calib_idx = calibration_split(np.arange(len(df)), df, frac=0.3)
    features = list(df.drop(columns=["target", "ts"]).select_dtypes(include=[np.number]).columns)
    final_temp_idx = features.index("temperature") if args.model == "persistence" else 0
    model = _model(args.model, fast=args.fast, temp_idx=final_temp_idx)
    X = df.drop(columns=["target", "ts"]).select_dtypes(include=[np.number]).to_numpy()
    y = df["target"].to_numpy(dtype=float)
    # No holdout exists for the final artifact, so all-data medians are safe.
    med = np.nanmedian(X, axis=0)
    if np.isnan(X).any():
        med = np.where(np.isnan(med), 0.0, med)
        inds = np.where(np.isnan(X))
        X[inds] = np.take(med, inds[1])
    model.fit(X[fit_idx], y[fit_idx])
    qhat = cqr_quantile(model.predict_interval, X[calib_idx], y[calib_idx], alpha=args.alpha)

    artifact = {
        "features": features,
        "model": model,
        "model_type": args.model,
        "alpha": args.alpha,
        "qhat": float(qhat),
        "target_std": float(df["target"].std()),
        "target_transform": args.transform,
        "reference_stats": {
            c: {"mean": float(np.nanmean(X[:, i])), "std": float(np.nanstd(X[:, i]))}
            for i, c in enumerate(features)
        },
        "training_sites": [
            [float(r.latitude), float(r.longitude)]
            for r in df[["latitude", "longitude"]].drop_duplicates().itertuples()
        ],
        "trained_ts": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(artifact, args.out)

    summary = {}
    for name in results:
        r = results[name]
        summary[name] = {
            "metrics": r["metrics"],
            "confidence_score": confidence_score(
                r["metrics"]["interval_width"], artifact["target_std"], r["metrics"]["coverage"], alpha=args.alpha
            ),
        }
    summary["alpha"] = args.alpha
    summary["rows"] = len(df)
    summary["qhat"] = float(qhat)
    summary["transform"] = args.transform
    if holdout_metrics is not None:
        summary["final_holdout"] = {
            "metrics": holdout_metrics["metrics"],
            "days": args.holdout_days,
            "n": holdout_metrics["metrics"]["n"],
            "confidence_score": confidence_score(
                holdout_metrics["metrics"]["interval_width"],
                artifact["target_std"],
                holdout_metrics["metrics"]["coverage"],
                alpha=args.alpha,
            ),
        }
    if args.transform == "delta":
        # Report reconstructed (temperature scale) metrics on the temporal split.
        temp = df["temperature"].to_numpy(dtype=float)
        X_ = X
        all_y, all_rec, all_lo, all_hi = [], [], [], []
        for tr, te in temporal:
            fit, cal = tr[: int(len(tr) * 0.7)], tr[int(len(tr) * 0.7):]
            m = _model(args.model, fast=args.fast)
            m.fit(X_[fit], y[fit])
            c, lo, hi = m.predict_interval(X_[te], alpha=args.alpha)
            qhat_ = cqr_quantile(m.predict_interval, X_[cal], y[cal], alpha=args.alpha)
            all_y.extend(df["target"].iloc[te].to_numpy() + temp[te])
            all_rec.extend(temp[te] + c)
            all_lo.extend(temp[te] + lo - qhat_)
            all_hi.extend(temp[te] + hi + qhat_)
        summary["reconstructed_temporal"] = {
            "rmse": round(rmse(np.array(all_y), np.array(all_rec)), 4),
            "coverage": round(interval_coverage(np.array(all_y), np.array(all_lo), np.array(all_hi)), 4),
            "width": round(float(np.mean(np.array(all_hi) - np.array(all_lo))), 4),
        }
    with open(metrics_path, "w") as fh:
        json.dump(summary, fh, indent=2, default=str)

    print(f"\nqhat: {qhat:.3f} | artifact -> {args.out}")
    for name in results:
        mets = results[name]["metrics"]
        print(f"\n== {name} split ({args.transform} scale) ==")
        print(f"  rmse {mets['rmse']:.3f} | mae {mets['mae']:.3f} | crps {mets['crps']:.3f}")
        print(f"  coverage {mets['coverage']:.3f} | width {mets['interval_width']:.3f}")
        print(f"  confidence score: {summary[name]['confidence_score']} / 100")
    if args.transform == "delta":
        rt = summary["reconstructed_temporal"]
        print(f"\n== reconstructed (temperature scale), temporal ==")
        print(f"  rmse {rt['rmse']:.3f} | coverage {rt['coverage']:.3f} | width {rt['width']:.3f}")
    if holdout_metrics is not None:
        hm = holdout_metrics["metrics"]
        print(f"\n== FINAL HOLDOUT (last {args.holdout_days}d, untouched by selection) ==")
        print(f"  rmse {hm['rmse']:.3f} | mae {hm['mae']:.3f} | coverage {hm['coverage']:.3f}")
        print(f"  width {hm['interval_width']:.3f} | n {hm['n']}")
        print(f"  confidence score: {summary['final_holdout']['confidence_score']} / 100")
    print(f"\nmetrics -> {metrics_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
