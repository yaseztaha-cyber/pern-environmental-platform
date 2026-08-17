"""MOS — Model Output Statistics bias correction + NWP ensemble blend.

Phase-2 center model (PERN accuracy plan, Phase 2):
    center(t+h) = a(h, s) + b(h, s) * NWP(t+h) + c(h, s) * anomaly(t)

fit per horizon h and per site s (optionally site-clustered) on a rolling
window of (init forecast, observation) pairs — never on future data.  The
anomaly term is the departure of today's observation from its seasonal normal
(persistence of the departure), exactly the term learned per horizon in Phase
1 with fitted rho.

Uncertainty is a conformal width on the MOS residuals, consistent with the
rest of the engine: |actual - center| over the training window, pooled per
site where the per-site sample is thin.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class MOSModel:
    """OLS MOS center per (site, horizon), rolling-window fit."""

    horizon: int
    window: int = 60  # rolling window of (nwp, anomaly, obs) triples per site
    min_samples: int = 5
    # coef[site] = [a, b, c] fitted on [1, NWP, anomaly]
    coef: dict = field(default_factory=dict)
    # conformal half-width per site from |obs - center| residuals
    half_width: dict = field(default_factory=dict)
    n: dict = field(default_factory=dict)

    def _fit_site(self, site, nwp, anomaly, obs):
        X = np.column_stack([np.ones(len(obs)), nwp, anomaly])
        mask = np.isfinite(X).all(axis=1) & np.isfinite(obs)
        if mask.sum() < self.min_samples:
            return None
        X = X[mask]
        y = obs[mask]
        coef, *_ = np.linalg.lstsq(X, y, rcond=None)
        resid = np.abs(y - X @ coef)
        return coef, np.quantile(resid, 0.9), len(y)

    def fit(self, site, nwp, anomaly, obs, cal_frac=0.25):
        """Fit one site with rolling-OLS on the fit portion + split-conformal.

        The input is split by time: the first (1-cal_frac) portion supplies
        the OLS training (rolling `window` most recent samples for adaptivity),
        the last cal_frac portion is held out and its |residual| 90th
        percentile becomes the interval half-width.  Falls back to in-sample
        residuals when the holdout is too thin.
        """
        nwp = np.asarray(nwp, float)
        anomaly = np.asarray(anomaly, float)
        obs = np.asarray(obs, float)
        n = len(obs)
        if n < 2 * self.min_samples:
            cal_frac = 0.0
        n_hold = int(n * cal_frac)
        n_fit = n - n_hold

        X_fit = np.column_stack([np.ones(n_fit), nwp[:n_fit], anomaly[:n_fit]])
        y_fit = obs[:n_fit]
        w = min(self.window, n_fit)
        if w < n_fit:
            X_ols, y_ols = X_fit[-w:], y_fit[-w:]
        else:
            X_ols, y_ols = X_fit, y_fit
        result = self._fit_site(site, X_ols[:, 1], X_ols[:, 2], y_ols)
        if result is None:
            return self
        coef, _, n_used = result

        if n_hold >= 8:
            X_h = np.column_stack([np.ones(n_hold), nwp[n_fit:], anomaly[n_fit:]])
            resid = np.abs(obs[n_fit:] - X_h @ coef)
        else:
            X_all = np.column_stack([np.ones(n), nwp, anomaly])
            resid = np.abs(obs - X_all @ coef)
        hw = float(np.quantile(resid, 0.9))

        self.coef[site] = coef
        self.half_width[site] = hw
        self.n[site] = n_used
        return self

    def center(self, site, nwp, anomaly):
        coef = self.coef.get(site)
        nwp = np.asarray(nwp, float)
        anomaly = np.asarray(anomaly, float)
        if coef is None:
            out = np.full(np.shape(nwp), np.nan)
        else:
            out = coef[0] + coef[1] * nwp + coef[2] * anomaly
        return float(out) if np.ndim(out) == 0 else out

    def interval(self, site, nwp, anomaly, alpha=0.10):
        c = self.center(site, nwp, anomaly)
        hw = self.half_width.get(site)
        if not np.isfinite(c) or hw is None:
            return (c, c)
        return (c - hw, c + hw)

    def params(self, site):
        coef = self.coef.get(site)
        if coef is None:
            return None
        return {"a": coef[0], "b": coef[1], "c": coef[2], "n": self.n.get(site, 0)}


def blend_weights(scores):
    """Normalized softmax weights from (negative) rolling skill scores.

    scores: dict {label: mean_skill} where higher is better (e.g. negative
    rolling MSE).  Labels at a NaN score (no fit) are dropped.
    """
    scores = {k: v for k, v in scores.items() if np.isfinite(v)}
    if not scores:
        return {}
    exp = np.exp(np.clip(np.asarray(list(scores.values())), -50, 50))
    total = exp.sum()
    return {k: float(v / total) for k, v in zip(scores.keys(), exp)}


def rolling_skill(errs, window=60):
    """Negative rolling mean-squared error per label series.

    errs: {label: np.ndarray of errors in forecast order}.  Returns per-label
    trailing skill usable by blend_weights.
    """
    out = {}
    for label, arr in errs.items():
        arr = np.asarray(arr, float)
        arr = arr[np.isfinite(arr)]
        if arr.size == 0:
            out[label] = float("nan")
            continue
        tail = arr[-window:] if arr.size > window else arr
        out[label] = float(-np.mean(tail**2))
    return out
