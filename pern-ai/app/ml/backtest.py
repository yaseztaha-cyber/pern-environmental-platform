"""Backtest orchestration: anti-leakage CV + conformal + metrics."""
import copy

import numpy as np

from .cv import calibration_split
from .conformal import cqr_intervals
from .metrics import summarize
from .models import DEFAULT_ALPHAS


META_COLS = {"ts", "latitude", "longitude", "feature_group", "source_id", "snapshot", "quality", "provenance"}


def feature_columns(df, target_col):
    cols = []
    for c in df.columns:
        if c in META_COLS or c == target_col:
            continue
        if np.issubdtype(df[c].dtype, np.number):
            cols.append(c)
    return cols


def feature_matrix(df, feature_cols, median_source=None):
    """Numeric feature matrix with NaN filled by column median.

    median_source: optional row mask (or array of indices) used to compute the
    medians. When given, the medians are estimated ONLY from those rows — the
    caller MUST pass the training rows so no test information leaks into the
    imputation statistics. When omitted, all rows are used (safe only when
    there is no holdout set to protect).
    """
    X = df[feature_cols].to_numpy(dtype=float).copy()
    if median_source is None:
        med = np.nanmedian(X, axis=0)
    else:
        med = np.nanmedian(X[median_source], axis=0)
    med = np.where(np.isnan(med), 0.0, med)
    inds = np.where(np.isnan(X))
    X[inds] = np.take(med, inds[1])
    return X


def run_backtest(df, model, target_col, folds, alpha=0.1, calib_frac=0.3):
    """Run conformalized quantile backtest over folds.

    model: a *factory* (zero-arg callable returning an unfitted model with the
    unified quantile interface), or an unfitted instance (deep-copied per fold).
    Returns dict with pooled metrics, per-fold metrics, and aligned arrays.
    """
    feature_cols = feature_columns(df, target_col)
    X_raw = df[feature_cols].to_numpy(dtype=float)
    y = df[target_col].to_numpy(dtype=float)

    per_fold = []
    all_y, all_center, all_lower, all_upper, all_q = [], [], [], [], []
    for train_idx, test_idx in folds:
        fit_idx, calib_idx = calibration_split(train_idx, df, frac=calib_frac)
        # Imputation medians come from training rows only — never the test fold.
        train_rows = np.concatenate([fit_idx, calib_idx])
        med = np.nanmedian(X_raw[train_rows], axis=0)
        med = np.where(np.isnan(med), 0.0, med)
        X_fit = X_raw[fit_idx].copy()
        X_cal = X_raw[calib_idx].copy()
        X_test = X_raw[test_idx].copy()
        for Xi in (X_fit, X_cal, X_test):
            nan_mask = np.isnan(Xi)
            if nan_mask.any():
                inds = np.where(nan_mask)
                Xi[inds] = np.take(med, inds[1])

        m = copy.deepcopy(model) if callable(getattr(model, "fit", None)) else model()
        m.fit(X_fit, y[fit_idx])

        cal_y = y[calib_idx]
        center, lower, upper = cqr_intervals(m.predict_interval, X_cal, cal_y, X_test, alpha=alpha)
        q_grid = m.predict_quantiles(X_test, alphas=DEFAULT_ALPHAS)

        fold_metrics = summarize(y[test_idx], center, lower, upper, q_grid, DEFAULT_ALPHAS)
        fold_metrics["n_train"] = int(len(fit_idx))
        fold_metrics["n_calib"] = int(len(calib_idx))
        fold_metrics["n_test"] = int(len(test_idx))
        per_fold.append(fold_metrics)

        all_y.append(y[test_idx])
        all_center.append(center)
        all_lower.append(lower)
        all_upper.append(upper)
        all_q.append(q_grid)

    pooled = summarize(
        np.concatenate(all_y),
        np.concatenate(all_center),
        np.concatenate(all_lower),
        np.concatenate(all_upper),
        np.concatenate(all_q),
        list(DEFAULT_ALPHAS),
    )
    return {
        "features": feature_cols,
        "alpha": alpha,
        "folds": per_fold,
        "metrics": pooled,
    }


def confidence_score(interval_width, target_std, coverage, alpha=0.1):
    """Map interval calibration/width to a 0-100 confidence score.

    width_score uses a monotonic, non-saturating mapping so that any interval
    widening (e.g. adaptive factors for new sites / off-distribution inputs)
    always lowers the score — it can never flatten out.
    """
    if target_std is None or not np.isfinite(target_std) or target_std <= 0:
        target_std = 1.0
    width_ratio = float(interval_width) / (2.0 * float(target_std))
    width_score = 1.0 / (1.0 + width_ratio)
    coverage_score = max(0.0, 1.0 - abs(float(coverage) - (1.0 - alpha)))
    score = 0.6 * coverage_score + 0.4 * width_score
    return round(max(0, min(1, score)) * 100, 1)
