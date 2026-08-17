"""LightGBM quantile ensemble container (Phase-2 top of the hierarchy).

The plan's eventual container is a quantile regressor on
{NWP, normal, anomaly, lag, day-of-year, site cluster} that should beat the
hand-rolled blend; if it does not, the parsimony gate ships the blend.  This
module trains per-horizon LightGBM quantile models at [alpha/2, 0.5, 1-alpha/2]
and CQR-calibrates the intervals on the calibration slice (never future data).
"""
from __future__ import annotations

import numpy as np

FEATURES = ["nwp", "normal", "anomaly", "lag", "day_of_year", "site"]


class QuantileEnsemble:
    """Per-horizon LightGBM quantile regression + CQR calibration."""

    def __init__(self, horizon, alpha=0.1, params=None):
        self.horizon = horizon
        self.alpha = alpha
        self.params = {
            "num_leaves": 31,
            "learning_rate": 0.05,
            "n_estimators": 200,
            "min_data_in_leaf": 20,
        }
        if isinstance(params, dict):
            self.params.update(params)
        self.models = None
        self.qhat = 0.0

    def _build_models(self):
        from lightgbm import LGBMRegressor  # noqa: PLC0415

        base = {k: v for k, v in self.params.items() if k != "n_estimators"}
        return {
            q: LGBMRegressor(objective="quantile", alpha=q, verbosity=-1, **base)
            for q in (self.alpha / 2.0, 0.5, 1.0 - self.alpha / 2.0)
        }

    def fit(self, X_cal, y_cal):
        """X_cal: (n, 6) in FEATURES order.  Fits quantiles + CQR qhat."""
        X_cal = np.asarray(X_cal, float)
        y_cal = np.asarray(y_cal, float)
        mask = np.isfinite(X_cal).all(axis=1) & np.isfinite(y_cal)
        X_cal, y_cal = X_cal[mask], y_cal[mask]
        self.models = self._build_models()
        for _, model in self.models.items():
            model.fit(X_cal, y_cal)

        def predict_interval(X):
            lo = self.models[self.alpha / 2.0].predict(X)
            hi = self.models[1.0 - self.alpha / 2.0].predict(X)
            c = self.models[0.5].predict(X)
            return c, lo, hi

        from app.ml.conformal import cqr_quantile  # noqa: PLC0415
        self.qhat = cqr_quantile(predict_interval, X_cal, y_cal, self.alpha)
        return self

    def predict(self, X_test):
        """(center, lower, upper) with CQR-calibrated intervals."""
        X_test = np.asarray(X_test, float)
        mask = np.isfinite(X_test).all(axis=1)
        out = np.full((len(X_test), 3), np.nan)
        if self.models is None or not mask.any():
            return out
        X = X_test[mask]
        lo = self.models[self.alpha / 2.0].predict(X) - self.qhat
        hi = self.models[1.0 - self.alpha / 2.0].predict(X) + self.qhat
        c = self.models[0.5].predict(X)
        out[mask] = np.column_stack([c, lo, hi])
        return out
