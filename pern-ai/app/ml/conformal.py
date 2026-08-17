"""Conformal prediction for calibrated prediction intervals.

Implements Conformalized Quantile Regression (CQR): train a multi-quantile
model, then calibrate the interval width on a separate calibration set so
coverage is (marginal) guaranteed at level 1 - alpha.
"""
import numpy as np


def cqr_quantile(predict_interval_fn, X_cal, y_cal, alpha=0.1):
    """Compute the CQR calibration quantile qhat from a calibration set."""
    _, cal_lower, cal_upper = predict_interval_fn(X_cal)
    y_cal = np.asarray(y_cal, dtype=float)
    scores = np.maximum(cal_lower - y_cal, y_cal - cal_upper)

    n = len(scores)
    level = np.ceil((n + 1) * (1 - alpha)) / n
    level = min(1.0, level)
    return float(np.quantile(scores, level))


def cqr_intervals(predict_interval_fn, X_cal, y_cal, X_test, alpha=0.1):
    """Calibrate a CQR model and return (center, lower, upper) on X_test.

    predict_interval_fn: callable X -> (center, lower, upper) with lower/upper
        produced at quantiles alpha/2 and 1 - alpha/2.
    """
    center, lower, upper = predict_interval_fn(X_test)
    if X_cal is None or len(X_cal) == 0:
        return center, lower, upper
    qhat = cqr_quantile(predict_interval_fn, X_cal, y_cal, alpha)
    return center, lower - qhat, upper + qhat


def quantile_residual_intervals(predict_center_fn, X_cal, y_cal, X_test, alpha=0.1):
    """Classic split conformal on |residual| of a center predictor."""
    center_test = np.asarray(predict_center_fn(X_test), dtype=float)
    if X_cal is None or len(X_cal) == 0:
        return center_test, center_test, center_test

    center_cal = np.asarray(predict_center_fn(X_cal), dtype=float)
    y_cal = np.asarray(y_cal, dtype=float)
    residuals = np.abs(y_cal - center_cal)

    n = len(residuals)
    level = np.ceil((n + 1) * (1 - alpha)) / n
    level = min(1.0, level)
    qhat = np.quantile(residuals, level)

    return center_test, center_test - qhat, center_test + qhat


def grouped_conformal_intervals(center_cal, y_cal, group_cal, center_test, group_test, alpha=0.1):
    """Split conformal with per-group residual quantiles.

    Residual |y - center| distributions differ by season (a calm August week
    has far smaller swings than a stormy April one), so a single pooled qhat is
    dominated by the worst group's tail and over-covers everywhere. This
    calibrates one qhat per group (e.g. month) on the calibration set and
    applies each test row's group width. Each group is an independent conformal
    set, so within-group coverage stays guaranteed at the finite-sample level.
    Groups seen in calibration but not test (and vice versa) are handled via a
    conservative fallback of the largest calibrated qhat.
    """
    center_cal = np.asarray(center_cal, dtype=float)
    y_cal = np.asarray(y_cal, dtype=float)
    group_cal = np.asarray(group_cal)
    center_test = np.asarray(center_test, dtype=float)
    group_test = np.asarray(group_test)

    residuals = np.abs(y_cal - center_cal)
    qhat = {}
    for g in np.unique(group_cal):
        r = residuals[group_cal == g]
        n = len(r)
        level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
        qhat[g] = float(np.quantile(r, level))
    fallback = max(qhat.values()) if qhat else 0.0
    widths = np.array([qhat.get(g, fallback) for g in group_test])
    lower = center_test - widths
    upper = center_test + widths
    return lower, upper


def _bin_level_qhat(r, alpha):
    n = len(r)
    level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
    return float(np.quantile(r, level))


def conditional_conformal_intervals(center_cal, y_cal, bin_cal, center_test, bin_test,
                                    alpha=0.1, min_bin=20, fallback_key=None):
    """Split conformal with per-bin residual quantiles (conditional conformal).

    Each calibration row carries a bin key encoding the conditioning context
    (e.g. "m7|v2|a1" for month x volatility-bin x |anomaly|-bin), so a test row
    is assigned the qhat of its own context rather than a whole-month width.
    Bins with fewer than `min_bin` residuals are not used; their rows are
    covered by the fallback.  The fallback is the max calibrated qhat within
    the same `fallback_key` (e.g. the month prefix "m7"), or the global max
    when the row has no key at all.
    """
    center_cal = np.asarray(center_cal, dtype=float)
    y_cal = np.asarray(y_cal, dtype=float)
    bin_cal = np.asarray(bin_cal)
    center_test = np.asarray(center_test, dtype=float)
    bin_test = np.asarray(bin_test)

    residuals = np.abs(y_cal - center_cal)
    qhat = {}
    for b in np.unique(bin_cal):
        r = residuals[bin_cal == b]
        if len(r) >= min_bin:
            qhat[b] = _bin_level_qhat(r, alpha)
    if not qhat:
        qhat = {"_all": _bin_level_qhat(residuals, alpha)}
    global_fb = max(qhat.values())

    if fallback_key is not None:
        fb = {}
        for b, q in qhat.items():
            key = fallback_key(b)
            if key not in fb or q > fb[key]:
                fb[key] = q
    else:
        fb = {}

    def width_for(b):
        if b in qhat:
            return qhat[b]
        if fallback_key is not None and fb:
            return fb.get(fallback_key(b), global_fb)
        return global_fb

    widths = np.array([width_for(b) for b in bin_test])
    lower = center_test - widths
    upper = center_test + widths
    return lower, upper, {"qhats": qhat, "fallback": fb, "global_fallback": global_fb}
