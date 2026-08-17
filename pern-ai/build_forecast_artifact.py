"""Phase-4 artifact builder: persist the Phase-3-gated forecast stack for serving.

Builds `models/forecast_artifact.joblib` from the exact Phase-3 gate protocol
(harmonic per-site normals, 60/40 split, conditional-conformal interval tables)
plus the Phase-2 NWP+MOS layer for h <= 7:

  - 16 sites from data/real_history_3y.csv in build_series order
  - per-horizon (1, 7, 30) anomaly center: per-site Fourier ClimateNormals
    (3 harmonics) on the calibration slice + per-horizon fitted rho
  - conditional-conformal interval tables per horizon (month x seasonal-
    volatility x |anomaly| bins, per-bin finite-sample qhats, month-max
    fallback, tuned alpha, holdout inflation + width caps) — identical to the
    Phase-3 gate, via eval_horizons.conditional_calibration
  - MOS (NWP+MOS) coefs + blend weights for h in (1, 7) fitted on the ERA5
    proxy cache, so the served engine can blend nwp+mos with anomaly
  - the P2 LightGBM quantile ensemble container at h=7 (parsimony-gated: it
    ships only when its eval RMSE beats the NWP+MOS blend's on the same 60/40
    split, per the plan; h=30 keeps the anomaly center because NWP has no
    serve-time coverage beyond 16 days, and h=1 keeps the blend because the
    ensemble loses there).  The served engine predicts the ensemble when NWP
    is supplied, else falls back to the blend / anomaly rungs.

P3 (30 d) was measured and rejected: fitting the 30 d normal on the 5-year
record (5 harmonics, per-month rho) regressed rmse 1.80 -> 2.96 on the same
3-year eval window, so the artifact keeps the 3-year baseline for every
horizon.  The eval_horizons.py anomaly_rho_monthly option remains available
for future work.

The served engine (app/ml/forecast.py) reads only this artifact.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import joblib  # noqa: E402

from app.ml.metrics import rmse  # noqa: E402
from app.ml.mos import MOSModel, blend_weights  # noqa: E402
from app.ml.quantile_ensemble import QuantileEnsemble  # noqa: E402
from eval_horizons import (  # noqa: E402
    ALPHA,
    CALIB_FRAC,
    build_center,
    build_series,
    conditional_calibration,
)

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "models"

AGR_CSV = DATA / "real_history_3y.csv"
NWP_CACHE = DATA / "nwp_era5.csv"
ARTIFACT = OUT / "forecast_artifact.joblib"
META_JSON = OUT / "forecast_artifact_meta.json"

HORIZONS = (1, 7, 30)
ANOMALY_NORMAL = "harmonic"
ANOMALY_HARMONICS = 3
ANOMALY_WINDOW = 1
ANOMALY_RHO_PER_SITE = True


def _split(sites, h):
    """Calibration/eval pair lists identical to eval_horizons.py."""
    cal_pairs, ev = [], []
    for site_i, site in enumerate(sites):
        dates, vals = site[0], site[1]
        n = len(vals)
        pairs = list(range(n - h))
        n_cal = int(len(pairs) * CALIB_FRAC)
        for idx in pairs[:n_cal]:
            cal_pairs.append((site_i, idx, idx + h))
        for idx in pairs[n_cal:]:
            ev.append((site_i, idx, idx + h))
    return cal_pairs, ev


def _nwp_map(sites, geo):
    """{(site, date): nwp_mean} from the ERA5 proxy cache, eval_nwp.py layout."""
    nwp = pd.read_csv(NWP_CACHE, parse_dates=["date"])
    out = {}
    for i, (lat, lng) in enumerate(geo):
        sub = nwp[(nwp.latitude == float(lat)) & (nwp.longitude == float(lng))].set_index("date")
        for d in (pd.Timestamp(t).normalize() for t in sites[i][0]):
            val = sub["nwp_mean"].get(d)
            if val is not None and np.isfinite(val):
                out[(i, d)] = float(val)
    return out


def _mos_layer(sites, nwp_map, anomaly, h):
    """MOSModel fit per site on the calibration slice + blend weights."""
    mos = MOSModel(horizon=h)
    site_triples = {}
    cal_err = {"anomaly": [], "normal": [], "mos": []}
    for i, j, k in _split(sites, h)[0]:
        date_k = pd.Timestamp(sites[i][0][k]).normalize()
        nwp_k = nwp_map.get((i, date_k), float("nan"))
        a_j = sites[i][1][j] - anomaly.normal(i, j)
        obs_k = sites[i][1][k]
        if np.isfinite(nwp_k) and np.isfinite(a_j) and np.isfinite(obs_k):
            site_triples.setdefault(i, []).append((nwp_k, a_j, obs_k))
        cal_err["anomaly"].append(obs_k - anomaly(i, j, k))
        cal_err["normal"].append(obs_k - anomaly.normal(i, k))
    for i, triples in site_triples.items():
        arr = np.asarray(triples, float)
        mos.fit(i, arr[:, 0], arr[:, 1], arr[:, 2])
    if site_triples:
        cal_err["mos"] = np.concatenate([
            np.asarray(t, float)[:, 2]
            - mos.center(i, np.asarray(t, float)[:, 0], np.asarray(t, float)[:, 1])
            for i, t in site_triples.items()
        ])
    skill = {c: float(-np.mean(np.asarray(e) ** 2)) for c, e in cal_err.items()
             if len(e) > 0}
    weights = blend_weights(skill)
    return {
        "coef": {str(i): list(map(float, mos.coef[i])) for i in mos.coef},
        "half_width": {str(i): float(mos.half_width[i]) for i in mos.half_width},
        "n": {str(i): int(mos.n[i]) for i in mos.n},
        "blend_weights": {c: round(w, 3) for c, w in weights.items()},
    }


def _ensemble_layer(sites, nwp_map, anomaly, cal_pairs, ev, h, alpha=ALPHA):
    """Fit the P2 LightGBM quantile ensemble on the calibration slice.

    Features are exactly what /v1/forecast can supply at serve time —
    {NWP(k), normal(k), anomaly(j), obs(j), day-of-year(k), site} — so no
    future data leaks into the container.  Returns (model, eval_rmse) or
    (None, None) when the NWP coverage is too thin to fit honestly.
    """

    def features(ps):
        rows, obs = [], []
        for i, j, k in ps:
            date_k = pd.Timestamp(sites[i][0][k]).normalize()
            nwp_k = nwp_map.get((i, date_k), float("nan"))
            a_j = sites[i][1][j] - anomaly.normal(i, j)
            obs_k = sites[i][1][k]
            if not (np.isfinite(nwp_k) and np.isfinite(a_j) and np.isfinite(obs_k)):
                continue
            rows.append([nwp_k, anomaly.normal(i, k), a_j, sites[i][1][j],
                         float(pd.Timestamp(sites[i][0][k]).dayofyear), i])
            obs.append(obs_k)
        return np.asarray(rows, float), np.asarray(obs, float)

    X_cal, y_cal = features(cal_pairs)
    X_ev, y_ev = features(ev)
    if len(X_cal) < 100 or len(X_ev) < 30:
        return None, None
    model = QuantileEnsemble(horizon=h, alpha=alpha).fit(X_cal, y_cal)
    c, _, _ = model.predict(X_ev).T
    eval_rmse = float(np.sqrt(np.mean((y_ev - c) ** 2)))
    return model, eval_rmse


def _blend_eval_rmse(sites, nwp_map, anomaly, mos_layer, ev, h):
    """Served NWP+MOS blend RMSE on the eval slice (the parsimony yardstick).

    Mirrors forecast.py's served h<=7 blend: weighted (MOS | anomaly | normal)
    with the artifact's blend weights, so the ensemble competes against the
    exact center the engine would otherwise ship.
    """
    w = mos_layer.get("blend_weights", {})
    wm, wa, wn = w.get("mos", 0.0), w.get("anomaly", 0.0), w.get("normal", 0.0)
    denom = wm + wa + wn
    if denom <= 0:
        return None
    errs = []
    for i, j, k in ev:
        date_k = pd.Timestamp(sites[i][0][k]).normalize()
        nwp_k = nwp_map.get((i, date_k), float("nan"))
        a_j = sites[i][1][j] - anomaly.normal(i, j)
        obs_k = sites[i][1][k]
        coef = mos_layer.get("coef", {}).get(str(i))
        if not (np.isfinite(nwp_k) and np.isfinite(a_j) and np.isfinite(obs_k) and coef):
            continue
        a, b, c = coef
        c_mos = a + b * nwp_k + c * a_j
        c_blend = (wm * c_mos + wa * anomaly(i, j, k) + wn * anomaly.normal(i, k)) / denom
        errs.append(obs_k - c_blend)
    if len(errs) < 30:
        return None
    return float(np.sqrt(np.mean(np.asarray(errs) ** 2)))


def _normals(sites, pred):
    """Picklable per-site ClimateNormals (doy+year basis) from the anomaly center."""
    if not getattr(pred, "norm_per_site", False):
        return {"_pooled": pred.norm_model}
    out = {}
    for si, m in pred.norm_model.items():
        if m is not None:
            out[str(si)] = {"coef": list(map(float, m.coef_)),
                            "std": list(map(float, m.std_)),
                            "n_harmonics": int(m.n_harmonics)}
    return out


def _rebuild_normal(rec, si):
    from app.ml.models import ClimateNormals  # noqa: PLC0415
    m = ClimateNormals(doy_idx=0, year_idx=1, n_harmonics=rec["n_harmonics"])
    m.coef_ = np.asarray(rec["coef"], float)
    m.std_ = np.asarray(rec["std"], float)
    m.is_fitted_ = True
    m.si = si
    return m


def main(force_nwp=False, out_json=None):
    df = pd.read_csv(AGR_CSV)
    sites = build_series(df, "temperature")
    df2 = df.copy()
    df2["ts"] = pd.to_datetime(df2["ts"])
    geo = [(g.latitude.iloc[0], g.longitude.iloc[0])
           for _, g in df2.sort_values("ts").groupby(["latitude", "longitude"], sort=False)]
    if len(sites) != 16:
        raise RuntimeError(f"expected 16 sites, got {len(sites)}")
    nwp_map = _nwp_map(sites, geo)

    artifact = {
        "version": 1,
        "build_ts": pd.Timestamp.utcnow().isoformat(),
        "config": {"alpha": ALPHA, "calib_frac": CALIB_FRAC,
                   "anomaly_normal": ANOMALY_NORMAL, "anomaly_harmonics": ANOMALY_HARMONICS,
                   "anomaly_window": ANOMALY_WINDOW},
        "sites": [{"latitude": float(lat), "longitude": float(lng)} for lat, lng in geo],
        "horizons": {},
    }
    meta = {"config": artifact["config"], "horizons": {}}

    for h in HORIZONS:
        cal_pairs, ev = _split(sites, h)
        anomaly = build_center("anomaly", sites, cal_pairs,
                               anomaly_normal=ANOMALY_NORMAL, anomaly_per_site=True,
                               anomaly_harmonics=ANOMALY_HARMONICS,
                               anomaly_window=ANOMALY_WINDOW,
                               anomaly_rho_per_site=ANOMALY_RHO_PER_SITE)
        cal_center = np.array([anomaly(i, j, k) for i, j, k in cal_pairs], dtype=float)
        cal_y = np.array([sites[i][1][k] for i, _, k in cal_pairs], dtype=float)
        ev_center = np.array([anomaly(i, j, k) for i, j, k in ev], dtype=float)
        ev_actual = np.array([sites[i][1][k] for i, _, k in ev], dtype=float)
        lower, upper, cm = conditional_calibration(
            sites, anomaly, cal_pairs, cal_center, cal_y, ev, ev_center, h)
        coverage = float(np.mean((ev_actual >= lower) & (ev_actual <= upper)))
        width = float(np.mean(upper - lower))
        cov_by_month = {}
        for m in sorted(set(pd.Timestamp(sites[i][0][k]).month for i, _, k in ev)):
            msk = np.array([pd.Timestamp(sites[i][0][k]).month for i, _, k in ev]) == m
            if msk.sum() >= 10:
                cov_by_month[str(m)] = round(float(np.mean(
                    (ev_actual[msk] >= lower[msk]) & (ev_actual[msk] <= upper[msk]))), 4)

        horizons_rec = {
            "rho": round(float(anomaly.rho), 4),
            "rho_by_site": ({str(i): round(float(r), 4) for i, r in anomaly.rho_by_site.items()}
                            if anomaly.rho_by_site else {}),
            "rho_by_month": ({str(m): round(float(r), 4) for m, r in anomaly.rho_by_month.items()}
                             if anomaly.rho_by_month else {}),
            "anomaly_window": int(anomaly.anomaly_window),
            "normals": _normals(sites, anomaly),
            "alpha_tuned": cm["alpha_tuned"],
            "inflation": cm["inflation"],
            "holdout_coverage": cm["holdout_coverage"],
            "n_bins": cm["n_bins"],
            "min_bin": cm["min_bin"],
            "vol_edges": cm["vol_edges"],
            "anom_edges": cm["anom_edges"],
            "qhats": cm["qhats"],
            "month_fallback": cm["month_fallback"],
            "global_fallback": cm["global_fallback"],
            "coverage": round(coverage, 4),
            "interval_width": round(width, 3),
            "rmse": round(float(rmse(ev_actual, ev_center)), 3),
            "target_std": round(float(np.std(ev_actual)), 3),
            "coverage_by_month": cov_by_month,
            "center": "anomaly",
        }
        if h in (1, 7):
            mos_layer = _mos_layer(sites, nwp_map, anomaly, h)
            horizons_rec["mos"] = mos_layer
            ens_rmse, blend_rmse = None, None
            if h == 7:
                ens_model, ens_rmse = _ensemble_layer(
                    sites, nwp_map, anomaly, cal_pairs, ev, h)
                blend_rmse = _blend_eval_rmse(
                    sites, nwp_map, anomaly, mos_layer, ev, h)
                if ens_model is not None and (blend_rmse is None or ens_rmse < blend_rmse):
                    horizons_rec["ensemble"] = ens_model
                    print(f"  h= 7d  ensemble ships (rmse {ens_rmse:.3f} "
                          f"vs blend {blend_rmse})")
                elif ens_model is not None:
                    print(f"  h= 7d  blend ships (parsimony): ensemble rmse "
                          f"{ens_rmse:.3f} >= blend {blend_rmse}")
        artifact["horizons"][str(h)] = horizons_rec
        meta["horizons"][str(h)] = {
            "rho": horizons_rec["rho"], "alpha_tuned": horizons_rec["alpha_tuned"],
            "inflation": horizons_rec["inflation"], "coverage": horizons_rec["coverage"],
            "interval_width": horizons_rec["interval_width"], "rmse": horizons_rec["rmse"],
            "target_std": horizons_rec["target_std"], "n_bins": horizons_rec["n_bins"],
            "holdout_coverage": horizons_rec["holdout_coverage"],
            "coverage_by_month": cov_by_month,
            "worst_month": min(cov_by_month, key=cov_by_month.get),
            "mos": horizons_rec.get("mos", {}).get("blend_weights", {}),
        }
        if "ensemble" in horizons_rec:
            meta["horizons"][str(h)]["ensemble"] = {
                "rmse": round(ens_rmse, 3),
                "vs_blend_rmse": round(blend_rmse, 3) if blend_rmse else None,
            }
        print(f"  h={h:>2}d  cov {coverage:.1%} width {width:.2f} rmse "
              f"{horizons_rec['rmse']} rho {horizons_rec['rho']} "
              f"alpha {horizons_rec['alpha_tuned']} infl x{horizons_rec['inflation']:.3f} "
              f"({horizons_rec['n_bins']} bins)")

    OUT.mkdir(exist_ok=True)
    joblib.dump(artifact, ARTIFACT)
    (out_json or META_JSON).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"wrote -> {ARTIFACT}")
    print(f"wrote -> {out_json or META_JSON}")
    return artifact, meta


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--force-nwp", action="store_true")
    ap.add_argument("--out-json", default=str(META_JSON))
    args = ap.parse_args()
    main(force_nwp=args.force_nwp, out_json=Path(args.out_json))
