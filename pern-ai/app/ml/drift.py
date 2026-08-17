"""Drift detection: feature PSI + residual CUSUM.

PSI flags when the incoming feature distribution shifts away from what the
model was trained on; residual CUSUM flags when forecast errors are growing
persistently (e.g. a changed regime or a stale calibration). Both return
human-readable reasons a scheduled retrainer can act on.
"""
import numpy as np

PSI_MODERATE = 0.1
PSI_SEVERE = 0.25
CUSUM_K = 0.5  # CUSUM allowance, in units of reference std
CUSUM_H = 5.0  # CUSUM decision interval, in units of reference std


def population_stability_index(expected, observed, n_bins=10):
    """PSI between two 1-D numeric samples. 0 = identical, >0.25 = severe."""
    exp = np.asarray(expected, dtype=float)
    obs = np.asarray(observed, dtype=float)
    exp = exp[np.isfinite(exp)]
    obs = obs[np.isfinite(obs)]
    if len(exp) == 0 or len(obs) == 0:
        return 0.0
    edges = np.quantile(exp, np.linspace(0, 1, n_bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    exp_hist, _ = np.histogram(exp, bins=edges)
    obs_hist, _ = np.histogram(obs, bins=edges)
    exp_p = exp_hist / exp_hist.sum()
    obs_p = obs_hist / obs_hist.sum()
    exp_p = np.clip(exp_p, 1e-6, None)
    obs_p = np.clip(obs_p, 1e-6, None)
    return float(np.sum((obs_p - exp_p) * np.log(obs_p / exp_p)))


def feature_psi(reference, recent, columns):
    """Per-column PSI between a reference DataFrame and a recent slice."""
    out = {}
    for col in columns:
        if col not in reference.columns or col not in recent.columns:
            continue
        out[col] = population_stability_index(reference[col], recent[col])
    return out


def residual_cusum(residuals, ref_std, k=CUSUM_K, h=CUSUM_H):
    """Two-sided CUSUM on residuals. Returns (cusum_high, cusum_low, alerts)."""
    residuals = np.asarray(residuals, dtype=float)
    ref_std = float(ref_std) if np.isfinite(ref_std) and ref_std > 0 else 1.0
    k = float(k) * ref_std
    h = float(h) * ref_std
    s_hi = np.zeros(len(residuals))
    s_lo = np.zeros(len(residuals))
    alert_hi = np.zeros(len(residuals), dtype=bool)
    alert_lo = np.zeros(len(residuals), dtype=bool)
    for i, r in enumerate(residuals):
        s_hi[i] = max(0.0, s_hi[i - 1] + r - k) if i > 0 else max(0.0, r - k)
        s_lo[i] = max(0.0, s_lo[i - 1] - r - k) if i > 0 else max(0.0, -r - k)
        alert_hi[i] = s_hi[i] > h
        alert_lo[i] = s_lo[i] > h
        if alert_hi[i]:
            s_hi[i] = 0.0
        if alert_lo[i]:
            s_lo[i] = 0.0
    return s_hi, s_lo, {"high": int(alert_hi.sum()), "low": int(alert_lo.sum())}


def drift_summary(reference, recent, columns, resid=None, ref_std=None):
    """Combine feature PSI and optional residual CUSUM into one report."""
    report = {
        "feature_psi": feature_psi(reference, recent, columns),
        "flagged_features": [],
        "residual_cusum": None,
        "alerts": [],
        "level": "none",
    }
    for col, psi in report["feature_psi"].items():
        if psi > PSI_SEVERE:
            report["flagged_features"].append(col)
            report["alerts"].append(f"feature '{col}' PSI {psi:.3f} > severe {PSI_SEVERE}")
        elif psi > PSI_MODERATE:
            report["flagged_features"].append(col)
            report["alerts"].append(f"feature '{col}' PSI {psi:.3f} > moderate {PSI_MODERATE}")
    if resid is not None and len(resid) > 0:
        _, _, alerts = residual_cusum(resid, ref_std if ref_std is not None else 1.0)
        report["residual_cusum"] = alerts
        if alerts["high"] > 0:
            report["alerts"].append(f"residual CUSUM fired high {alerts['high']}x (errors growing)")
        if alerts["low"] > 0:
            report["alerts"].append(f"residual CUSUM fired low {alerts['low']}x (errors shrinking)")
    if report["alerts"]:
        report["level"] = "severe" if any("severe" in a or "fired high" in a for a in report["alerts"]) else "moderate"
    return report
