"""Quantile regression models with a uniform interface.

Interface:
    fit(X, y)
    predict_quantiles(X, alphas=None) -> (n_samples, n_levels)
    predict(X) -> center (median)
    predict_interval(X, alpha=0.1) -> (center, lower, upper)
"""
import numpy as np

DEFAULT_ALPHAS = (0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95)


class LightGBMQuantile:
    """LightGBM regressors, one per quantile level (fast, CPU)."""

    def __init__(self, alphas=DEFAULT_ALPHAS, n_estimators=200, learning_rate=0.05, num_leaves=31, min_data_in_leaf=20, verbose=-1):
        self.alphas = tuple(alphas)
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.num_leaves = num_leaves
        self.min_data_in_leaf = min_data_in_leaf
        self.verbose = verbose
        self.models_ = []
        self.is_fitted_ = False

    def fit(self, X, y):
        import lightgbm as lgb

        X = np.asarray(X)
        y = np.asarray(y, dtype=float)
        if len(self.models_) == 0:
            self.models_ = [
                lgb.LGBMRegressor(
                    objective="quantile",
                    alpha=a,
                    n_estimators=self.n_estimators,
                    learning_rate=self.learning_rate,
                    num_leaves=self.num_leaves,
                    min_data_in_leaf=self.min_data_in_leaf,
                    verbose=self.verbose,
                )
                for a in self.alphas
            ]
        for m in self.models_:
            m.fit(X, y)
        self.is_fitted_ = True
        return self

    def predict_quantiles(self, X, alphas=None):
        if not self.is_fitted_:
            raise RuntimeError("model not fitted")
        X = np.asarray(X)
        levels = alphas if alphas is not None else self.alphas
        cols = []
        for level in levels:
            idx = self.alphas.index(level)
            cols.append(self.models_[idx].predict(X))
        return np.column_stack(cols)

    def predict(self, X):
        return self.predict_quantiles(X, alphas=(0.5,))[:, 0]

    def predict_interval(self, X, alpha=0.1):
        levels = (alpha / 2, 1 - alpha / 2)
        q = self.predict_quantiles(X, alphas=levels)
        return self.predict(X), q[:, 0], q[:, 1]


class PersistenceResidual:
    """Persistence center + conformal residual calibration.

    The point forecast is 'today's observed temperature' (persistence): on real
    Nile-Delta 1-day-ahead data every learned correction adds noise, so the
    optimal center is persistence. The split-conformal layer (CQR on
    |residual|) then attaches a calibrated prediction interval. Intervals
    returned here are zero-width; the conformal caller adds the calibrated
    width — keeping the exact same interface as the tree models.
    """

    def __init__(self, temp_idx=0):
        self.temp_idx = temp_idx
        self.is_fitted_ = False

    def fit(self, X, y):
        self.is_fitted_ = True
        return self

    def predict(self, X):
        return np.asarray(X)[:, self.temp_idx]

    def predict_interval(self, X, alpha=0.1):
        t = np.asarray(X)[:, self.temp_idx]
        return t, t, t

    def predict_quantiles(self, X, alphas=None):
        t = np.asarray(X)[:, self.temp_idx][:, None]
        return np.tile(t, (1, len(alphas) if alphas else 1))


class SeasonalClimatology:
    """Day-of-year climatology center with triangular smoothing.

    Fits the mean observed value per smoothed day-of-year from the training
    rows. For horizons beyond ~2 days, climatology beats persistence (the
    ForecastWatch finding: persistence only wins at 1 day; climatology
    dominates afterwards), so this is the honest center for weekly/monthly
    forecasts. Intervals are zero-width; the conformal layer attaches the
    calibrated width — identical interface to PersistenceResidual.
    """

    def __init__(self, doy_idx=0, window_days=15):
        self.doy_idx = doy_idx
        self.window_days = int(window_days)
        self.clim_ = np.zeros(367)
        self.is_fitted_ = False

    def fit(self, X, y):
        doy = np.asarray(X)[:, self.doy_idx]
        y = np.asarray(y, dtype=float)
        sums = np.zeros(367)
        counts = np.zeros(367)
        for d, val in zip(doy, y):
            dd = int(round(float(d))) % 366
            dd = dd if dd > 0 else 366
            sums[dd] += val
            counts[dd] += 1
        w = self.window_days
        supported = np.zeros(367, dtype=bool)
        for d in range(1, 367):
            acc, n = 0.0, 0
            for k in range(d - w, d + w + 1):
                dd = ((k - 1) % 366) + 1
                if counts[dd] > 0:
                    acc += sums[dd] / counts[dd]
                    n += 1
            if n > 0:
                self.clim_[d] = acc / n
                supported[d] = True
        # Extend to days with no window support (e.g. test horizons beyond the
        # calibration season) via nearest supported day-of-year (circular).
        for d in range(1, 367):
            if supported[d]:
                continue
            dist = 1
            while True:
                for cand in (d - dist, d + dist):
                    c = ((cand - 1) % 366) + 1
                    if supported[c]:
                        self.clim_[d] = self.clim_[c]
                        supported[d] = True
                        break
                if supported[d] or dist > 366:
                    break
                dist += 1
        self.is_fitted_ = True
        return self

    def predict(self, X):
        if not self.is_fitted_:
            raise RuntimeError("model not fitted")
        doy = np.asarray(X)[:, self.doy_idx]
        out = np.zeros(len(doy))
        for i, d in enumerate(doy):
            dd = int(round(float(d))) % 366
            out[i] = self.clim_[dd if dd > 0 else 366]
        return out

    def predict_interval(self, X, alpha=0.1):
        c = self.predict(X)
        return c, c, c

    def predict_quantiles(self, X, alphas=None):
        c = self.predict(X)
        return np.tile(c[:, None], (1, len(alphas) if alphas else 1))


class ClimateNormals:
    """Fourier-harmonic climate normals with a seasonal normal-band.

    Fits the smooth seasonal mean as a harmonic (Fourier) regression on
    day-of-year (up to `n_harmonics`, plus an optional linear year trend for
    multi-year records). The harmonic basis is periodic and smooth, so unlike
    the binned SeasonalClimatology it extrapolates naturally to any day of the
    year. The normal band is the per-day-of-year residual standard deviation,
    smoothed circularly, so `predict_std` returns the climatological spread —
    the anchor for the Phase-1 anomaly-persistence center
    ``normal(t+h) + rho*(obs(t) - normal(t))`` and for the conformal width.
    """

    def __init__(self, doy_idx=0, year_idx=1, n_harmonics=4, std_window_days=15):
        self.doy_idx = doy_idx
        self.year_idx = year_idx
        self.n_harmonics = int(n_harmonics)
        self.std_window_days = int(std_window_days)
        self.coef_ = None
        self.std_ = np.zeros(367)
        self.is_fitted_ = False

    def _basis(self, doy, year=None):
        doy = np.asarray(doy, dtype=float)
        cols = [np.ones_like(doy)]
        if year is not None:
            cols.append(np.asarray(year, dtype=float))
        for k in range(1, self.n_harmonics + 1):
            theta = 2.0 * np.pi * k * doy / 365.25
            cols.append(np.sin(theta))
            cols.append(np.cos(theta))
        return np.column_stack(cols)

    def fit(self, X, y):
        X = np.asarray(X, dtype=float)
        y = np.asarray(y, dtype=float)
        year = X[:, self.year_idx] if X.shape[1] > self.year_idx else None
        A = self._basis(X[:, self.doy_idx], year)
        mask = np.isfinite(A).all(axis=1) & np.isfinite(y)
        if mask.sum() < 2:
            raise ValueError("ClimateNormals.fit needs >= 2 finite rows")
        self.coef_, *_ = np.linalg.lstsq(A[mask], y[mask], rcond=None)

        resid = y[mask] - A[mask] @ self.coef_
        doy = X[mask, self.doy_idx]
        sums = np.zeros(367)
        counts = np.zeros(367)
        for d, r in zip(doy, resid):
            dd = int(round(float(d))) % 366
            dd = dd if dd > 0 else 366
            sums[dd] += r * r
            counts[dd] += 1
        w = self.std_window_days
        supported = np.zeros(367, dtype=bool)
        for d in range(1, 367):
            acc, n = 0.0, 0
            for k in range(d - w, d + w + 1):
                dd = ((k - 1) % 366) + 1
                if counts[dd] > 0:
                    acc += sums[dd] / counts[dd]
                    n += 1
            if n > 0:
                self.std_[d] = float(np.sqrt(acc / n))
                supported[d] = True
        for d in range(1, 367):
            if supported[d]:
                continue
            dist = 1
            while True:
                for cand in (d - dist, d + dist):
                    c = ((cand - 1) % 366) + 1
                    if supported[c]:
                        self.std_[d] = self.std_[c]
                        supported[d] = True
                        break
                if supported[d] or dist > 366:
                    break
                dist += 1
        self.is_fitted_ = True
        return self

    def predict(self, X):
        if not self.is_fitted_:
            raise RuntimeError("model not fitted")
        X = np.asarray(X, dtype=float)
        year = X[:, self.year_idx] if X.shape[1] > self.year_idx else None
        return self._basis(X[:, self.doy_idx], year) @ self.coef_

    def predict_std(self, X):
        if not self.is_fitted_:
            raise RuntimeError("model not fitted")
        doy = np.asarray(X)[:, self.doy_idx]
        out = np.zeros(len(doy))
        for i, d in enumerate(doy):
            dd = int(round(float(d))) % 366
            out[i] = self.std_[dd if dd > 0 else 366]
        return out

    def predict_interval(self, X, alpha=0.1):
        c = self.predict(X)
        return c, c, c

    def predict_quantiles(self, X, alphas=None):
        c = self.predict(X)
        return np.tile(c[:, None], (1, len(alphas) if alphas else 1))


class SklearnQuantile:
    """Fallback: HistGradientBoostingRegressor with quantile loss (no lightgbm)."""

    def __init__(self, alphas=DEFAULT_ALPHAS, max_iter=150, **kwargs):
        from sklearn.ensemble import HistGradientBoostingRegressor

        self.alphas = tuple(alphas)
        self.max_iter = max_iter
        self.kwargs = kwargs
        self._cls = HistGradientBoostingRegressor
        self.models_ = []
        self.is_fitted_ = False

    def fit(self, X, y):
        X = np.asarray(X)
        y = np.asarray(y, dtype=float)
        self.models_ = [
            self._cls(loss="quantile", quantile=a, max_iter=self.max_iter, **self.kwargs).fit(X, y)
            for a in self.alphas
        ]
        self.is_fitted_ = True
        return self

    def predict_quantiles(self, X, alphas=None):
        if not self.is_fitted_:
            raise RuntimeError("model not fitted")
        levels = alphas if alphas is not None else self.alphas
        cols = []
        for level in levels:
            idx = self.alphas.index(level)
            cols.append(self.models_[idx].predict(np.asarray(X)))
        return np.column_stack(cols)

    def predict(self, X):
        return self.predict_quantiles(X, alphas=(0.5,))[:, 0]

    def predict_interval(self, X, alpha=0.1):
        levels = (alpha / 2, 1 - alpha / 2)
        q = self.predict_quantiles(X, alphas=levels)
        return self.predict(X), q[:, 0], q[:, 1]
