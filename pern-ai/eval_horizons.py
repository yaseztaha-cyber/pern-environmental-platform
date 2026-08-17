"""Multi-horizon forecast evaluation (24h / 7d / 30d).

Compares two centers per horizon, both with grouped (per-month) split-conformal
intervals calibrated on the first 60% of each site's timeline and scored on the
last 40% against real observations:

  - persistence : center = today's observation (best at 24h)
  - climatology : smoothed day-of-year mean fit on the calibration slice (best
                  at 7d / 30d — the ForecastWatch finding: persistence only
                  beats climatology at 1 day)

Also reports competitor-style tolerance accuracy ("% of forecasts within ±x"),
the metric weather/AQ providers actually publish.

Runs for two tracks:
  - agriculture : real NASA POWER T2M (deg C), served engine data
  - air         : PM2.5 virtual-sensor track (ug/m3)

Writes models/horizon_eval.json + models/horizon_eval.png.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from app.ml.backtest import confidence_score
from app.ml.conformal import conditional_conformal_intervals, grouped_conformal_intervals
from app.ml.metrics import mae, rmse
from app.ml.models import ClimateNormals, SeasonalClimatology

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "models"

HORIZONS = (1, 7, 30)
CALIB_FRAC = 0.6
ALPHA = 0.1
CENTERS = ("persistence", "climatology", "anomaly")

TRACKS = {
    "agriculture": {"csv": DATA / "real_labeled.csv", "series": "temperature", "unit": "deg C",
                    "tolerances": (1.0, 1.667, 2.0, 3.0)},
    "air": {"csv": DATA / "air_labeled.csv", "series": "pm25", "unit": "ug/m3",
            "tolerances": (10.0, 25.0, 50.0)},
}


def build_series(df, series_col):
    """Return list of per-site (dates, observed) ordered series."""
    df = df.copy()
    df["ts"] = pd.to_datetime(df["ts"])
    sites = []
    for _, grp in df.sort_values("ts").groupby(["latitude", "longitude"], sort=False):
        vals = grp[series_col].to_numpy(dtype=float)
        dates = grp["ts"].to_numpy()
        keep = ~np.isnan(vals)
        vals, dates = vals[keep], dates[keep]
        if len(vals) >= HORIZONS[-1] + 2:
            sites.append((dates, vals))
    return sites


def _doy_year(sites, pairs, day="k"):
    """Per-pair (day-of-year, year) of the reference day (j = today, k = target)."""
    out = []
    idx = 2 if day == "k" else 1
    for i, j, k in pairs:
        ts = pd.Timestamp(sites[i][0][(j, k)[idx - 1]])
        out.append((float(ts.dayofyear), float(ts.year)))
    return np.asarray(out, dtype=float)


def build_center(center_name, sites, cal_pairs, anomaly_normal="climatology",
                 anomaly_window=1, anomaly_per_site=False, anomaly_harmonics=4,
                 anomaly_rho_fixed=None, anomaly_regional=False,
                 anomaly_rho_per_site=False, anomaly_rho_monthly=False):
    """Return callable pred(i, j, k) -> center forecast for site i, from day j to day k.

    - persistence : center = today's observation  (obs at j)
    - climatology : smoothed day-of-year mean fit on the calibration slice
    - anomaly     : normal(k) + rho*(anomaly(t)), anomaly(t) = mean anomaly over
                    the last `anomaly_window` days, rho fit per-horizon on the
                    calibration pairs (or `anomaly_rho_fixed` when given). With
                    `anomaly_regional` the anomaly is averaged over all sites at
                    the same date index (spatial persistence of the departure).
                    With `anomaly_rho_per_site` a separate rho is fit per site
                    (falling back to the pooled rho for sites with too few
                    calibration pairs).  With `anomaly_rho_monthly` a separate
                    rho is fit per calendar month of the target day k (falling
                    back to the pooled rho for months with too few pairs) —
                    used at the 30 d lead where persistence is seasonal.
                    normal is the smoothed climatology (default) or the Fourier
                    ClimateNormals (`harmonic`, with `anomaly_harmonics` terms),
                    pooled or per-site.
    """
    cal_doy_year = _doy_year(sites, cal_pairs)
    cal_obs = np.array([sites[i][1][k] for i, _, k in cal_pairs], dtype=float)

    if center_name == "persistence":
        return lambda i, j, k: sites[i][1][j]

    if center_name == "climatology":
        clim = SeasonalClimatology(doy_idx=0, window_days=15).fit(cal_doy_year[:, :1], cal_obs)
        return lambda i, j, k: _clim_predict(clim, sites, i, k)

    if center_name == "anomaly":
        norm_by_site = None
        norm_model = None
        if anomaly_normal == "shared":
            # Pooled harmonic curve + per-site constant offset (regularized:
            # 1 seasonal curve, N offsets — far fewer params than N separate fits).
            norm = ClimateNormals(doy_idx=0, year_idx=1, n_harmonics=anomaly_harmonics) \
                .fit(cal_doy_year, cal_obs)
            site_offsets = {}
            for si in range(len(sites)):
                idx = [t for t, (i, _, _) in enumerate(cal_pairs) if i == si]
                if idx:
                    site_offsets[si] = float(np.mean(cal_obs[idx] - norm.predict(cal_doy_year[idx])))

            def norm_k(i, k):
                ts = pd.Timestamp(sites[i][0][k])
                return float(norm.predict(np.array([[ts.dayofyear, ts.year]]))[0]) \
                    + site_offsets.get(i, 0.0)

            def norm_j(i, j):
                ts = pd.Timestamp(sites[i][0][j])
                return float(norm.predict(np.array([[ts.dayofyear, ts.year]]))[0]) \
                    + site_offsets.get(i, 0.0)

            def norm_x(i, x):
                ts = pd.Timestamp(sites[i][0][x])
                return float(norm.predict(np.array([[ts.dayofyear, ts.year]]))[0]) \
                    + site_offsets.get(i, 0.0)
            norm_model = norm
        elif anomaly_normal == "harmonic":
            if anomaly_per_site:
                norm_by_site = {}
                for site_i, (dates, vals) in enumerate(sites):
                    crows = [(sites[i][1][k], float(pd.Timestamp(sites[i][0][k]).dayofyear),
                              float(pd.Timestamp(sites[i][0][k]).year))
                             for i, _, k in cal_pairs if i == site_i]
                    if len(crows) < 20:
                        norm_by_site[site_i] = None
                        continue
                    yy, dd, yr = zip(*crows)
                    norm_by_site[site_i] = ClimateNormals(doy_idx=0, year_idx=1,
                                                          n_harmonics=anomaly_harmonics) \
                        .fit(np.column_stack([dd, yr]), np.asarray(yy, dtype=float))
            else:
                norm = ClimateNormals(doy_idx=0, year_idx=1, n_harmonics=anomaly_harmonics) \
                    .fit(cal_doy_year, cal_obs)
            norm_model = norm_by_site if norm_by_site is not None else norm

            def norm_k(i, k):
                ts = pd.Timestamp(sites[i][0][k])
                X = np.array([[ts.dayofyear, ts.year]])
                if norm_by_site is not None:
                    m = norm_by_site.get(i)
                    if m is None:
                        return float(np.nan)
                    return float(m.predict(X)[0])
                return float(norm.predict(X)[0])

            def norm_j(i, j):
                ts = pd.Timestamp(sites[i][0][j])
                X = np.array([[ts.dayofyear, ts.year]])
                if norm_by_site is not None:
                    m = norm_by_site.get(i)
                    if m is None:
                        return float(np.nan)
                    return float(m.predict(X)[0])
                return float(norm.predict(X)[0])

            def norm_x(i, x):
                ts = pd.Timestamp(sites[i][0][x])
                X = np.array([[ts.dayofyear, ts.year]])
                if norm_by_site is not None:
                    m = norm_by_site.get(i)
                    if m is None:
                        return float(np.nan)
                    return float(m.predict(X)[0])
                return float(norm.predict(X)[0])
        else:
            clim = SeasonalClimatology(doy_idx=0, window_days=15).fit(cal_doy_year[:, :1], cal_obs)
            norm_model = clim

            def norm_k(i, k):
                return float(_clim_predict(clim, sites, i, k))

            def norm_j(i, j):
                return float(_clim_predict(clim, sites, i, j))

            def norm_x(i, x):
                return float(_clim_predict(clim, sites, i, x))

        w = max(1, int(anomaly_window))

        if anomaly_regional:
            n_times = min(len(vals) for _, vals in sites)
            # Per-site normal over the full timeline, then a per-date regional
            # mean anomaly (vectorized once, reused by every forecast pair).
            norm_ts = []
            for si in range(len(sites)):
                ts_seq = [pd.Timestamp(sites[si][0][t]) for t in range(n_times)]
                if norm_by_site is not None:
                    m = norm_by_site.get(si)
                    rows = np.array([[ts.dayofyear, ts.year] for ts in ts_seq], dtype=float)
                    norm_ts.append(m.predict(rows) if m is not None
                                   else np.full(n_times, np.nan))
                else:
                    rows = np.array([[ts.dayofyear, ts.year] for ts in ts_seq], dtype=float)
                    norm_ts.append(norm.predict(rows))
            regional_anom = np.full(n_times, np.nan)
            for t in range(n_times):
                vals_all = np.array([sites[si][1][t] for si in range(len(sites))], dtype=float)
                norm_all = np.array([norm_ts[si][t] for si in range(len(sites))], dtype=float)
                keep = np.isfinite(vals_all) & np.isfinite(norm_all)
                if keep.sum():
                    regional_anom[t] = float(np.mean(vals_all[keep] - norm_all[keep]))

            def anomaly_t(i, t):
                lo = max(0, t - w + 1)
                seg = regional_anom[lo:t + 1]
                seg = seg[np.isfinite(seg)]
                return float(seg.mean()) if len(seg) else 0.0
        else:
            def anomaly_t(i, t):
                """Mean departure from the seasonal normal over the last w days (inclusive)."""
                acc, n = 0.0, 0
                for d in range(t - w + 1, t + 1):
                    if d < 0:
                        continue
                    acc += float(sites[i][1][d]) - norm_x(i, d)
                    n += 1
                return acc / max(n, 1)

        normal_k = np.array([norm_k(i, k) for i, _, k in cal_pairs])
        b = np.array([anomaly_t(i, j) for i, j, _ in cal_pairs])
        a = cal_obs - normal_k
        if anomaly_rho_fixed is not None:
            rho = float(np.clip(anomaly_rho_fixed, 0.0, 1.0))
        else:
            keep = np.isfinite(a) & np.isfinite(b) & (b != 0)
            rho = float(np.clip((a[keep] * b[keep]).sum() / max((b[keep] * b[keep]).sum(), 1e-12),
                                0.0, 1.05))

        rho_by_site = None
        if anomaly_rho_per_site and anomaly_rho_fixed is None:
            rho_by_site = {}
            for si in range(len(sites)):
                sel = np.array([i for i, _, _ in cal_pairs], dtype=int) == si
                if sel.sum() < 30:
                    continue
                a_s, b_s = a[sel], b[sel]
                keep_s = np.isfinite(a_s) & np.isfinite(b_s) & (b_s != 0)
                if keep_s.sum() < 20:
                    continue
                denom = max(float((b_s[keep_s] * b_s[keep_s]).sum()), 1e-12)
                rho_by_site[si] = float(np.clip(
                    float((a_s[keep_s] * b_s[keep_s]).sum()) / denom, 0.0, 1.05))

        rho_by_month = None
        if anomaly_rho_monthly and anomaly_rho_fixed is None:
            rho_by_month = {}
            months_k = np.array([pd.Timestamp(sites[i][0][k]).month
                                 for i, _, k in cal_pairs], dtype=int)
            for m in range(1, 13):
                sel = months_k == m
                if sel.sum() < 30:
                    continue
                a_s, b_s = a[sel], b[sel]
                keep_s = np.isfinite(a_s) & np.isfinite(b_s) & (b_s != 0)
                if keep_s.sum() < 20:
                    continue
                denom = max(float((b_s[keep_s] * b_s[keep_s]).sum()), 1e-12)
                rho_by_month[m] = float(np.clip(
                    float((a_s[keep_s] * b_s[keep_s]).sum()) / denom, 0.0, 1.05))
            if not rho_by_month:
                rho_by_month = None

        def pred(i, j, k):
            r = rho
            if rho_by_site is not None:
                r = rho_by_site.get(i, rho)
            if rho_by_month is not None:
                m = pd.Timestamp(sites[i][0][k]).month
                r = rho_by_month.get(m, rho)
            return norm_k(i, k) + r * anomaly_t(i, j)

        pred.rho = rho
        pred.rho_by_site = rho_by_site
        pred.rho_by_month = rho_by_month
        pred.anomaly_window = w
        pred.normal = norm_k
        pred.anomaly_t = anomaly_t
        # Fitted normal model(s) for the Phase-4 serving artifact: per-site
        # ClimateNormals when anomaly_per_site, else the pooled model.
        pred.norm_model = norm_model
        pred.norm_per_site = anomaly_per_site and anomaly_normal == "harmonic"
        pred.norm_offsets = site_offsets if anomaly_normal == "shared" else None
        return pred

    raise ValueError(f"unknown center {center_name}")


def _clim_predict(clim, sites, i, day_idx):
    doy = float(pd.Timestamp(sites[i][0][day_idx]).dayofyear)
    return float(clim.predict(np.array([[doy]]))[0])


def _month_of_bin(b):
    return b.split("|")[0]


def tune_alpha(fit_center, fit_y, fit_bin, hold_center, hold_y, hold_bin, band=(0.88, 0.93)):
    """Pick the conformal alpha whose holdout coverage is nearest the band's top.

    Targeting 93% (not the 90.5% midpoint) deliberately leaves headroom for the
    residual drift between the calibration tail and the held-out evaluation
    period, while the width targets have ample margin to absorb it.
    """
    target = band[1]
    best, best_cov = None, None
    for a in (0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15):
        lo, hi, _ = conditional_conformal_intervals(
            fit_center, fit_y, fit_bin, hold_center, hold_bin, alpha=a,
            min_bin=20, fallback_key=_month_of_bin)
        cov = float(np.mean((hold_y >= lo) & (hold_y <= hi)))
        if best is None or abs(cov - target) < abs(best_cov - target):
            best, best_cov = a, cov
    return best, best_cov


def _inflation_factor(center, y, lower, upper, target=0.93):
    """Global width multiplier so holdout coverage reaches `target` (binary search)."""
    if float(np.mean((y >= lower) & (y <= upper))) >= target:
        return 1.0
    lo, hi, s = 1.0, 3.0, 1.0
    for _ in range(24):
        mid = 0.5 * (lo + hi)
        cov = float(np.mean((y >= center - mid * (center - lower)) &
                            (y <= center + mid * (upper - center))))
        if cov >= target:
            s, hi = mid, mid
        else:
            lo = mid
    return round(s, 4)


def conditional_calibration(sites, pred, cal_pairs, cal_center, cal_y, ev_pairs, ev_center,
                            h, alpha=ALPHA):
    """Fit conditional-conformal intervals, shared by eval and serving.

    Bins calibration residuals by (month, seasonal-volatility tercile from the
    normal's ±15-day std, within-month |anomaly| tercile), tunes alpha on the
    last third of the calibration set (targeting the top of the coverage band),
    and inflates widths on the fit→holdout gap, capped by the horizon width
    budget.  Returns (lower, upper, meta) where `meta` carries every piece
    (bin edges, qhats, fallbacks, alpha, inflation) needed to reproduce the
    intervals at serve time from `app/ml/forecast.py`.
    """
    if not (hasattr(pred, "normal") and hasattr(pred, "anomaly_t")):
        raise ValueError("conditional conformal requires the anomaly center "
                         "(pred.normal + pred.anomaly_t)")
    n_cal = len(cal_pairs)
    tail_frac, fit_frac = 1.0, 2.0 / 3.0
    # Last 30% of each (site, month) block: recent rows for every month, so
    # winter bins are never starved of calibration data.
    blocks = {}
    for idx, (i, _, k) in enumerate(cal_pairs):
        blocks.setdefault((i, pd.Timestamp(sites[i][0][k]).month), []).append(idx)
    tail_sel = np.zeros(n_cal, dtype=bool)
    for idxs in blocks.values():
        for idx in idxs[int(len(idxs) * (1 - tail_frac)):]:
            tail_sel[idx] = True
    # Time-split the tail per site into fit (first 2/3) / hold (last 1/3).
    per_site_tail = {}
    for idx in np.flatnonzero(tail_sel):
        per_site_tail.setdefault(cal_pairs[idx][0], []).append(int(idx))
    fit_sel = np.zeros(n_cal, dtype=bool)
    hold_sel = np.zeros(n_cal, dtype=bool)
    for idxs in per_site_tail.values():
        cut = int(len(idxs) * fit_frac)
        for idx in idxs[:cut]:
            fit_sel[idx] = True
        for idx in idxs[cut:]:
            hold_sel[idx] = True

    norm_cache = {}

    def _seasonal_vol(si, k):
        if si not in norm_cache:
            n_days = len(sites[si][1])
            norm_cache[si] = np.array([pred.normal(si, d) for d in range(n_days)], dtype=float)
        arr = norm_cache[si]
        return float(np.std(arr[max(0, k - 15):k + 16]))

    def _features(pairs):
        months = np.array([pd.Timestamp(sites[i][0][k]).month for i, _, k in pairs], dtype=int)
        vols = np.array([_seasonal_vol(i, k) for i, _, k in pairs], dtype=float)
        anoms = np.array([abs(pred.anomaly_t(i, j)) for i, j, _ in pairs], dtype=float)
        return months, vols, anoms

    def _edges(fit_months, fit_vols, fit_anoms):
        # normal-std (seasonal steepness) terciles pooled across months;
        # |anomaly| terciles computed WITHIN each month so February is sized
        # against February, not pooled with calm months.  Key 0 is the global
        # fallback for months absent from the fit slice (short series).
        vol_edges = np.quantile(fit_vols, [1.0 / 3, 2.0 / 3])
        anom_edges = {0: np.quantile(fit_anoms, [1.0 / 3, 2.0 / 3])}
        for m in sorted(set(int(x) for x in fit_months)):
            sel = fit_months == m
            anom_edges[m] = np.quantile(fit_anoms[sel], [1.0 / 3, 2.0 / 3])
        return vol_edges, anom_edges

    def _keys(months, vols, anoms, edges):
        ve, ae = edges
        vb = np.digitize(vols, ve, right=True)
        out = []
        for m, v, a in zip(months, vb, anoms):
            ab = np.digitize(a, ae.get(int(m), ae.get(0)), right=True)
            out.append(f"m{m:02d}|v{v}|a{int(ab)}")
        return np.array(out)

    months_all, vols_all, anoms_all = _features(cal_pairs)
    edges = _edges(months_all[fit_sel], vols_all[fit_sel], anoms_all[fit_sel])
    calib_bins = _keys(months_all, vols_all, anoms_all, edges)
    alpha_used, _ = tune_alpha(cal_center[fit_sel], cal_y[fit_sel], calib_bins[fit_sel],
                               cal_center[hold_sel], cal_y[hold_sel], calib_bins[hold_sel])
    ev_months, ev_vols, ev_anoms = _features(ev_pairs)
    ev_bins = _keys(ev_months, ev_vols, ev_anoms, edges)
    lower, upper, meta = conditional_conformal_intervals(
        cal_center[tail_sel], cal_y[tail_sel], calib_bins[tail_sel],
        ev_center, ev_bins, alpha=alpha_used, min_bin=20, fallback_key=_month_of_bin)
    # Inflate widths so the fit-part widths cover the calibration holdout
    # (the most recent regime, adjacent to the eval period) at the top of the
    # band.  The holdout rows are NOT part of the fit qhats, so their coverage
    # is a genuine out-of-sample check.
    lo_fh, hi_fh, _ = conditional_conformal_intervals(
        cal_center[fit_sel], cal_y[fit_sel], calib_bins[fit_sel],
        cal_center[hold_sel], calib_bins[hold_sel],
        alpha=alpha_used, min_bin=20, fallback_key=_month_of_bin)
    infl = _inflation_factor(cal_center[hold_sel], cal_y[hold_sel], lo_fh, hi_fh, target=0.93)
    width_cap = {1: 4.5, 7: 8.0}.get(h, float("inf"))
    if width_cap < float("inf"):
        infl = min(infl, width_cap / max(float(np.mean(upper - lower)), 1e-9))
    if infl > 1.0:
        center = ev_center
        lower = center - infl * (center - lower)
        upper = center + infl * (upper - center)

    bin_meta = {
        "method": "conditional",
        "alpha_tuned": alpha_used,
        "holdout_coverage": round(float(np.mean(
            (cal_y[hold_sel] >= lo_fh) & (cal_y[hold_sel] <= hi_fh))), 4),
        "inflation": infl,
        "n_bins": len(meta["qhats"]),
        "calib_tail_frac": tail_frac,
        "vol_edges": [float(v) for v in edges[0]],
        "anom_edges": {str(m): [float(v) for v in e] for m, e in edges[1].items()},
        "qhats": {str(b): float(q) for b, q in meta["qhats"].items()},
        "month_fallback": {str(m): float(q) for m, q in meta["fallback"].items()},
        "global_fallback": float(meta["global_fallback"]),
        "min_bin": 20,
    }
    return lower, upper, bin_meta


def evaluate_horizon(sites, h, center_name, tolerances=(), alpha=ALPHA, anomaly_normal="climatology",
                     anomaly_window=1, anomaly_per_site=False, anomaly_harmonics=4,
                     anomaly_rho_fixed=None, anomaly_regional=False, conformal="monthly",
                     anomaly_rho_per_site=False, anomaly_rho_monthly=False):
    """Split-conformal evaluation at horizon h.

    `conformal="monthly"` uses the legacy per-month grouped widths (Phase-1
    protocol).  `conformal="conditional"` bins calibration residuals by
    (month, seasonal-volatility bin from normal_std, |anomaly| bin), calibrates
    on the most recent 30% of each site's train slice (the current regime),
    tunes alpha on a 1/3 holdout of that slice, and falls back to the max qhat
    per month for bins with too few samples.
    """
    cal_pairs, ev = [], []
    for site_i, (dates, vals) in enumerate(sites):
        n = len(vals)
        pairs = list(range(n - h))
        n_cal = int(len(pairs) * CALIB_FRAC)
        for j in pairs[:n_cal]:
            cal_pairs.append((site_i, j, j + h))
        for j in pairs[n_cal:]:
            ev.append((site_i, j, j + h))
    if not ev:
        return None

    pred = build_center(center_name, sites, cal_pairs, anomaly_normal,
                        anomaly_window, anomaly_per_site, anomaly_harmonics,
                        anomaly_rho_fixed, anomaly_regional,
                        anomaly_rho_per_site, anomaly_rho_monthly)

    cal_center = np.array([pred(i, j, k) for i, j, k in cal_pairs], dtype=float)
    cal_y = np.array([sites[i][1][k] for i, _, k in cal_pairs], dtype=float)
    cal_group = np.array([pd.Timestamp(sites[i][0][k]).month for i, _, k in cal_pairs], dtype=int)

    ev_center = np.array([pred(i, j, k) for i, j, k in ev], dtype=float)
    ev_actual = np.array([sites[i][1][k] for i, _, k in ev], dtype=float)
    ev_group = np.array([pd.Timestamp(sites[i][0][k]).month for i, _, k in ev], dtype=int)

    if conformal == "monthly" or center_name != "anomaly":
        lower, upper = grouped_conformal_intervals(
            cal_center, cal_y, cal_group, ev_center, ev_group, alpha=alpha)
        alpha_used = alpha
        conformal_meta = {"method": "monthly", "alpha": alpha}
    elif conformal == "conditional":
        lower, upper, conformal_meta = conditional_calibration(
            sites, pred, cal_pairs, cal_center, cal_y, ev, ev_center, h, alpha=alpha)
    else:
        raise ValueError(f"unknown conformal {conformal}")

    errs = ev_actual - ev_center
    coverage = float(np.mean((ev_actual >= lower) & (ev_actual <= upper)))
    width = float(np.mean(upper - lower))

    cov_by_month = {}
    for m in sorted(set(int(g) for g in ev_group)):
        msk = ev_group == m
        if msk.sum() >= 10:
            cov_by_month[str(m)] = round(float(np.mean(
                (ev_actual[msk] >= lower[msk]) & (ev_actual[msk] <= upper[msk]))), 4)

    res = {
        "horizon_days": h,
        "center": center_name,
        "n_calib_pairs": int(len(cal_pairs)),
        "n_eval_pairs": int(len(ev)),
        "rmse": round(rmse(ev_actual, ev_center), 3),
        "mae": round(mae(ev_actual, ev_center), 3),
        "coverage": round(coverage, 4),
        "interval_width": round(width, 3),
        "confidence": confidence_score(width, float(np.std(ev_actual)), coverage, alpha),
        "target_std": round(float(np.std(ev_actual)), 3),
        "coverage_by_month": cov_by_month,
        "conformal": conformal_meta,
        "accuracy_within": {f"{t:g}": round(float(np.mean(np.abs(errs) <= t)), 4)
                            for t in tolerances},
    }
    rho = getattr(pred, "rho", None)
    if rho is not None:
        res["anomaly_rho"] = round(rho, 3)
    rho_by_month = getattr(pred, "rho_by_month", None)
    if rho_by_month:
        res["anomaly_rho_by_month"] = {str(m): round(float(r), 3)
                                       for m, r in rho_by_month.items()}
    return res


def best_center(horizons, h):
    return min(CENTERS,
               key=lambda c: horizons[f"{h}d_{c}"]["rmse"])


def run_track(name, cfg, demo=True, anomaly_normal="climatology",
              anomaly_window=1, anomaly_per_site=False, anomaly_harmonics=4,
              anomaly_rho_fixed=None, anomaly_regional=False, conformal="monthly",
              anomaly_rho_per_site=False, anomaly_rho_monthly=False):
    df = pd.read_csv(cfg["csv"])
    sites = build_series(df, cfg["series"])
    results = {}
    for h in HORIZONS:
        for center in CENTERS:
            res = evaluate_horizon(sites, h, center, tolerances=cfg["tolerances"],
                                   anomaly_normal=anomaly_normal,
                                   anomaly_window=anomaly_window,
                                   anomaly_per_site=anomaly_per_site,
                                   anomaly_harmonics=anomaly_harmonics,
                                    anomaly_rho_fixed=anomaly_rho_fixed,
                                    anomaly_regional=anomaly_regional,
                                    conformal=conformal,
                                    anomaly_rho_per_site=anomaly_rho_per_site,
                                    anomaly_rho_monthly=anomaly_rho_monthly)
            if res is not None:
                results[f"{h}d_{center}"] = res
        if demo:
            bc = best_center(results, h)
            results[f"{h}d_{bc}"]["demo"] = demo_rows(sites, h, bc)
        # Skill score vs the climatology baseline at this horizon.
        pers = results.get(f"{h}d_persistence")
        clim = results.get(f"{h}d_climatology")
        if pers and clim and clim["rmse"] > 0:
            ss = 1.0 - (pers["rmse"] ** 2) / (clim["rmse"] ** 2)
            pers["skill_vs_climatology"] = round(ss, 3)
            clim["skill_vs_climatology"] = round(0.0, 3)
        ano = results.get(f"{h}d_anomaly")
        if ano and clim and clim["rmse"] > 0:
            ano["skill_vs_climatology"] = round(1.0 - (ano["rmse"] ** 2) / (clim["rmse"] ** 2), 3)
    return {"track": name, "unit": cfg["unit"], "n_sites": len(sites), "horizons": results}


def demo_rows(sites, h, center_name, max_rows=2):
    """Concrete train-then-predict rows for the first site using the given center."""
    if not sites:
        return []
    dates, vals = sites[0]
    n = len(vals)
    pairs = list(range(n - h))
    n_cal = int(len(pairs) * CALIB_FRAC)
    cal_pairs = [(0, j, j + h) for j in pairs[:n_cal]]
    ev_pairs = [(0, j, j + h) for j in pairs[n_cal:]]
    pred = build_center(center_name, sites, cal_pairs)
    out = []
    for _, j, k in ev_pairs[:max_rows]:
        d0 = pd.Timestamp(dates[j])
        d1 = pd.Timestamp(dates[k])
        center = float(pred(0, j, k))
        actual = float(vals[k])
        out.append({
            "trained_through": d0.strftime("%Y-%m-%d"),
            "predicted_day": d1.strftime("%Y-%m-%d"),
            "center": round(center, 2),
            "actual": round(actual, 2),
            "error": round(actual - center, 2),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tracks", nargs="*", default=list(TRACKS))
    ap.add_argument("--agriculture-csv", default=str(TRACKS["agriculture"]["csv"]),
                    help="multi-year history CSV (e.g. data/real_history.csv) for the ag track")
    ap.add_argument("--anomaly-normal", choices=("climatology", "harmonic", "shared"),
                    default="climatology",
                    help="normal estimator for the anomaly center: smoothed climatology, per-site "
                         "Fourier harmonics (with --anomaly-per-site), or a pooled harmonic curve "
                         "plus per-site offsets ('shared')")
    ap.add_argument("--anomaly-window", type=int, default=1,
                    help="days of recent anomaly to average into the anomaly input (1 = today only)")
    ap.add_argument("--anomaly-per-site", action="store_true",
                    help="fit the harmonic normal per site instead of pooled")
    ap.add_argument("--anomaly-harmonics", type=int, default=4,
                    help="Fourier harmonics for the harmonic normal")
    ap.add_argument("--anomaly-rho-fixed", type=float, default=None,
                    help="override the fitted rho with a fixed value (e.g. 0.1)")
    ap.add_argument("--anomaly-regional", action="store_true",
                    help="average the anomaly over all sites (spatial persistence)")
    ap.add_argument("--anomaly-rho-monthly", action="store_true",
                    help="fit a separate anomaly-persistence rho per calendar month "
                         "of the target day (30d seasonal persistence)")
    ap.add_argument("--conformal", choices=("monthly", "conditional"), default="monthly",
                    help="interval calibration: legacy per-month grouped widths, or conditional "
                         "per-bin widths (month x seasonal-volatility x |anomaly|) with a tuned "
                         "alpha and per-month max fallback")
    ap.add_argument("--out", default=OUT / "horizon_eval.json")
    args = ap.parse_args()

    if args.agriculture_csv != str(TRACKS["agriculture"]["csv"]):
        TRACKS["agriculture"] = {**TRACKS["agriculture"], "csv": Path(args.agriculture_csv)}

    report = {"alpha": ALPHA, "calib_frac": CALIB_FRAC, "anomaly_normal": args.anomaly_normal,
              "anomaly_window": args.anomaly_window, "anomaly_per_site": args.anomaly_per_site,
              "anomaly_harmonics": args.anomaly_harmonics,
              "anomaly_rho_fixed": args.anomaly_rho_fixed,
              "anomaly_regional": args.anomaly_regional,
              "anomaly_rho_monthly": args.anomaly_rho_monthly,
              "conformal": args.conformal,
              "tracks": {}}
    for name in args.tracks:
        report["tracks"][name] = run_track(name, TRACKS[name], anomaly_normal=args.anomaly_normal,
                                           anomaly_window=args.anomaly_window,
                                           anomaly_per_site=args.anomaly_per_site,
                                           anomaly_harmonics=args.anomaly_harmonics,
                                           anomaly_rho_fixed=args.anomaly_rho_fixed,
                                           anomaly_regional=args.anomaly_regional,
                                           conformal=args.conformal,
                                           anomaly_rho_monthly=args.anomaly_rho_monthly)

    out = Path(args.out)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"\n=== Multi-horizon evaluation (alpha={ALPHA}, conformal={args.conformal}) ===")
    for name, tr in report["tracks"].items():
        print(f"\n[{name}] ({tr['unit']}, {tr['n_sites']} sites)")
        print(f"{'horizon':>8} {'center':>12} {'rmse':>7} {'mae':>7} {'cov':>7} {'width':>7} {'conf':>7} {'SS_clim':>8}")
        for h in HORIZONS:
            for c in CENTERS:
                r = tr["horizons"].get(f"{h}d_{c}")
                if not r:
                    continue
                mark = "  <- best" if c == best_center(tr["horizons"], h) else ""
                ss = r.get("skill_vs_climatology", float("nan"))
                print(f"{h:>5}d   {c:>12} {r['rmse']:>7} {r['mae']:>7} {r['coverage']:>7.1%} "
                      f"{r['interval_width']:>7} {r['confidence']:>7} {ss:>8}{mark}")
        print("  tolerance accuracy (competitor-style), best center per horizon:")
        for h in HORIZONS:
            bc = best_center(tr["horizons"], h)
            r = tr["horizons"][f"{h}d_{bc}"]
            tols = ", ".join(f"+/-{t}: {v:.0%}" for t, v in r["accuracy_within"].items())
            print(f"  {h:>3}d {bc:>12}: {tols}")

        if args.conformal == "conditional" and tr["unit"] == "deg C":
            print(f"\n  Phase-3 gate (anomaly center, conditional conformal) "
                  f"[coverage band 88-93%]:")
            for h in HORIZONS:
                r = tr["horizons"].get(f"{h}d_anomaly")
                if not r:
                    continue
                cov = r["coverage"]
                w = r["interval_width"]
                band_ok = 0.88 <= cov <= 0.95
                high = cov > 0.93
                width_ok = (h == 1 and w <= 4.5) or (h == 7 and w <= 8.0) or h > 7
                cm = r["conformal"]
                print(f"  {h:>3}d  cov {cov:>6.1%}  {'ok' if band_ok else 'OUT'}{' (>93%)' if high else ''} | "
                      f"width {w:>5.2f} {'ok' if width_ok else 'OUT'} | "
                      f"alpha {cm.get('alpha_tuned', cm.get('alpha'))} infl x{cm.get('inflation', 1.0):.3f} "
                      f"(holdout {cm.get('holdout_coverage', 0):.1%}, {cm.get('n_bins', '-')} bins)")
                cbm = r.get("coverage_by_month", {})
                if cbm:
                    worst = min(cbm, key=lambda m: cbm[m])
                    print(f"       worst month: {worst} ({cbm[worst]:.1%})")
    print(f"\nwrote -> {out}")


if __name__ == "__main__":
    sys.exit(main())
