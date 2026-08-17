"""Phase-2 NWP + MOS evaluation harness.

Pipeline under test (PERN accuracy plan, Phase 2):
    center(t+h) = a(h,s) + b(h,s) * NWP(t+h) + c(h,s) * anomaly(t)

NWP for this harness is the Open-Meteo ERA5 archive at the same grid points
("proxy NWP").  ERA5 is a reanalysis, so it is near-truth: the numbers below
prove the MOS machinery (bias removal, rolling adaptation, blending, conformal
intervals) end-to-end, but they do NOT measure real forecast-skill decay with
lead time.  The gate measurement needs live NWP (Open-Meteo forecast API,
16-day, one snapshot per day) accumulated over the coming weeks, or a GFS
hindcast archive (deferred: requires a native GRIB2 decoder).

All centers are fit on the calibration slice (first CALIB_FRAC) and evaluated
out-of-sample on the remaining days, exactly like eval_horizons.py.
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

from math import erf

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.ml.metrics import mae, rmse  # noqa: E402
from app.ml.mos import MOSModel, blend_weights  # noqa: E402
from eval_horizons import (  # noqa: E402
    ALPHA,
    CALIB_FRAC,
    build_center,
    build_series,
)

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "models"
AGR_CSV = DATA / "real_history_3y.csv"
NWP_CACHE = DATA / "nwp_era5.csv"
NWP_LIVE = DATA / "nwp_live"

HORIZONS = (1, 3, 7, 14, 30)
TOL = 1.667  # ~ +-3 F
ANOMALY_NORMAL = "harmonic"
ANOMALY_HARMONICS = 3
ARCHIVE = ("https://archive-api.open-meteo.com/v1/archive?"
           "latitude={lat}&longitude={lng}&start_date={s}&end_date={e}&"
           "daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min"
           "&timezone=UTC")


def fetch_era5(lat, lng, start, end, retries=3):
    """One grid point's daily ERA5 series from the Open-Meteo archive."""
    url = ARCHIVE.format(lat=lat, lng=lng, s=start, e=end)
    last = None
    for _ in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                import json as _json
                d = _json.loads(r.read())
            mean = d["daily"].get("temperature_2m_mean")
            tmax = d["daily"]["temperature_2m_max"]
            tmin = d["daily"]["temperature_2m_min"]
            if mean is None:
                mean = [(mx + mn) / 2.0 for mx, mn in zip(tmax, tmin)]
            return pd.DataFrame({
                "date": pd.to_datetime(d["daily"]["time"]),
                "latitude": float(lat), "longitude": float(lng),
                "nwp_mean": mean, "nwp_max": tmax, "nwp_min": tmin,
            })
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(f"ERA5 fetch failed for ({lat},{lng}): {last}")


def build_nwp_cache(df_obs, force=False):
    """Fetch ERA5 for every grid point in the obs history; cache to CSV."""
    if NWP_CACHE.exists() and not force:
        return pd.read_csv(NWP_CACHE, parse_dates=["date"])
    start = df_obs.ts.min()[:10]
    end = df_obs.ts.max()[:10]
    frames = []
    for (lat, lng), _ in df_obs.groupby(["latitude", "longitude"]):
        print(f"  era5 {lat},{lng} ...", flush=True)
        frames.append(fetch_era5(lat, lng, start, end))
    nwp = pd.concat(frames, ignore_index=True)
    nwp.to_csv(NWP_CACHE, index=False)
    return nwp


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


def _crps_normal(mu, sigma, y):
    """CRPS of a Normal(mu, sigma) predictive vs observation y."""
    if not np.isfinite(mu) or not np.isfinite(sigma) or sigma <= 0:
        return float("nan")
    z = (y - mu) / sigma
    phi = np.exp(-0.5 * z * z) / np.sqrt(2.0 * np.pi)
    Phi = 0.5 * (1.0 + erf(z / np.sqrt(2.0)))
    return float(sigma * (z * (2.0 * Phi - 1.0) + 2.0 * phi - 1.0 / np.sqrt(np.pi)))


def _triple(sites, nwp_map, anomaly, i, j, k):
    """(nwp[k], anomaly[j], obs[k]) for site i, j->k forecast pair."""
    date_k = pd.Timestamp(sites[i][0][k]).normalize()
    nwp_k = nwp_map.get((i, date_k), float("nan"))
    a_j = sites[i][1][j] - anomaly.normal(i, j)
    return nwp_k, a_j, sites[i][1][k]


def evaluate_horizon(sites, nwp_map, h, tol=TOL, pairs=None):
    """Out-of-sample accuracy/RMSE/skill/CRPS for anomaly, MOS, normal, blend."""
    cal_pairs, ev = pairs if pairs is not None else _split(sites, h)

    anomaly = build_center("anomaly", sites, cal_pairs,
                           anomaly_normal=ANOMALY_NORMAL,
                           anomaly_per_site=True,
                           anomaly_harmonics=ANOMALY_HARMONICS)

    # ---- MOS: OLS per site on [1, NWP(k), anomaly(j)] -> obs(k) ----
    mos = MOSModel(horizon=h)
    site_triples = {}
    cal_err = {c: [] for c in ("anomaly", "normal")}
    for i, j, k in cal_pairs:
        nwp_k, a_j, obs_k = _triple(sites, nwp_map, anomaly, i, j, k)
        if np.isfinite(nwp_k) and np.isfinite(a_j) and np.isfinite(obs_k):
            site_triples.setdefault(i, []).append((nwp_k, a_j, obs_k))
        cal_err["anomaly"].append(obs_k - anomaly(i, j, k))
        cal_err["normal"].append(obs_k - anomaly.normal(i, k))
    for i, triples in site_triples.items():
        arr = np.asarray(triples, float)
        mos.fit(i, arr[:, 0], arr[:, 1], arr[:, 2])
    cal_err["mos"] = np.concatenate([
        np.asarray(t, float)[:, 2] - mos.center(i, np.asarray(t, float)[:, 0],
                                                np.asarray(t, float)[:, 1])
        for i, t in site_triples.items()
    ]) if site_triples else np.asarray([])

    # ---- blend weights from calibration MSE per center ----
    skill = {c: float(-np.mean(np.asarray(e) ** 2)) for c, e in cal_err.items()}
    weights = blend_weights(skill)
    # predictive sigma per model from the cal |residual| 90th percentile
    sigma_cal = {c: float(np.quantile(np.abs(np.asarray(e)), 0.9)) / 1.645
                 for c, e in cal_err.items()}
    sigma_cal["blend"] = float(np.sqrt(
        weights.get("mos", 0.0) ** 2 * sigma_cal["mos"] ** 2
        + weights.get("anomaly", 0.0) ** 2 * sigma_cal["anomaly"] ** 2
        + weights.get("normal", 0.0) ** 2 * sigma_cal["normal"] ** 2))
    print(f"  h={h:>2}d  blend weights { {c: round(w, 3) for c, w in weights.items()} }")

    # ---- out-of-sample evaluation ----
    res = {c: [] for c in ("anomaly", "mos", "normal", "blend")}
    crps = {c: [] for c in ("anomaly", "mos", "normal", "blend")}
    coverage = {"mos": []}
    for i, j, k in ev:
        nwp_k, a_j, obs_k = _triple(sites, nwp_map, anomaly, i, j, k)
        c_anom = anomaly(i, j, k)
        c_norm = anomaly.normal(i, k)
        c_mos = mos.center(i, nwp_k, a_j) if np.isfinite(nwp_k) else float("nan")
        w_mos = weights.get("mos", 0.0) if np.isfinite(c_mos) else 0.0
        w_norm = weights.get("normal", 0.0) if np.isfinite(c_norm) else 0.0
        w_anom = weights.get("anomaly", 0.0) if np.isfinite(c_anom) else 0.0
        w_sum = w_mos + w_norm + w_anom or 1.0
        c_blend = (w_mos * c_mos + w_norm * c_norm + w_anom * c_anom) / w_sum
        if not np.isfinite(c_blend):
            c_blend = c_anom
        for lab, c in (("anomaly", c_anom), ("mos", c_mos), ("normal", c_norm), ("blend", c_blend)):
            if np.isfinite(c):
                res[lab].append(obs_k - c)
                crps[lab].append(_crps_normal(c, sigma_cal[lab], obs_k))
        if np.isfinite(c_mos):
            lo, hi = mos.interval(i, nwp_k, a_j)
            coverage["mos"].append(int(lo <= obs_k <= hi))

    clim_mse = float(np.mean(np.asarray(res["normal"]) ** 2))
    out = {}
    for lab, errs in res.items():
        errs = np.asarray(errs, float)
        cr = np.asarray(crps[lab], float)
        out[lab] = {
            "accuracy": round(float(np.mean(np.abs(errs) <= tol)), 4),
            "rmse": round(float(np.sqrt(np.mean(errs ** 2))), 3),
            "skill_vs_clim": round(1.0 - float(np.mean(errs ** 2)) / clim_mse, 3),
            "crps": round(float(np.nanmean(cr)), 3),
        }
    out["coverage_90_mos"] = round(float(np.mean(coverage["mos"])), 3) if coverage["mos"] else None
    out["blend_weights"] = {c: round(w, 3) for c, w in weights.items()}
    out["anomaly_rho"] = round(anomaly.rho, 3)
    out["crps_gate"] = bool(out["blend"]["crps"] < out["anomaly"]["crps"])
    return out


def load_live_snapshots():
    """Concatenate data/nwp_live/*.csv issued-forecast snapshots."""
    files = sorted(NWP_LIVE.glob("*.csv"))
    if not files:
        return None
    return pd.concat([pd.read_csv(f, parse_dates=["init_date", "valid_date"])
                      for f in files], ignore_index=True)


def live_pairs(sites, geo, live, h):
    """(site, init, valid) pairs from issued snapshots with verified obs.

    A snapshot issued at j is a valid-day forecast for j..j+16; only the
    j->j+h lead is used here.  Pairs are ordered by init date, then split
    60/40 so the same honest protocol applies.
    """
    pairs = []
    for i, (dates, vals) in enumerate(sites):
        idx = {pd.Timestamp(d).normalize(): t for t, d in enumerate(dates)}
        sub = live[(live.latitude == float(geo[i][0]))
                   & (live.longitude == float(geo[i][1]))]
        for _, row in sub.iterrows():
            j = idx.get(row.valid_date - pd.Timedelta(days=h))
            k = idx.get(row.valid_date)
            if j is None or k is None or k - j != h:
                continue
            if np.isfinite(vals[j]) and np.isfinite(vals[k]):
                pairs.append((i, j, k))
    pairs.sort(key=lambda p: (p[2], p[0]))
    n_cal = int(len(pairs) * CALIB_FRAC)
    return pairs[:n_cal], pairs[n_cal:]


def live_nwp_map(sites, geo, live):
    """{(site, valid_date): nwp_mean} from issued forecasts (lead j->k)."""
    out = {}
    for i, (lat, lng) in enumerate(geo):
        sub = live[(live.latitude == float(lat)) & (live.longitude == float(lng))]
        for _, row in sub.iterrows():
            out[(i, row.valid_date.normalize())] = float(row.nwp_mean)
    return out


def evaluate_ensemble(sites, nwp_map, h, pairs, tol=TOL):
    """LightGBM quantile ensemble on {NWP, normal, anomaly, lag, doy, site}.

    Returns per-model metrics plus a parsimony comparison against the blend
    (the plan ships the blend if the ensemble does not beat it).
    """
    from app.ml.quantile_ensemble import FEATURES, QuantileEnsemble  # noqa: PLC0415

    cal_pairs, ev = pairs if pairs is not None else _split(sites, h)
    anomaly = build_center("anomaly", sites, cal_pairs,
                           anomaly_normal=ANOMALY_NORMAL, anomaly_per_site=True,
                           anomaly_harmonics=ANOMALY_HARMONICS)

    def features(ps):
        rows = []
        obs = []
        for i, j, k in ps:
            nwp_k, a_j, obs_k = _triple(sites, nwp_map, anomaly, i, j, k)
            if not (np.isfinite(nwp_k) and np.isfinite(a_j) and np.isfinite(obs_k)):
                continue
            rows.append([nwp_k, anomaly.normal(i, k), a_j, sites[i][1][j],
                         float(pd.Timestamp(sites[i][0][k]).dayofyear), i])
            obs.append(obs_k)
        return np.asarray(rows, float), np.asarray(obs, float)

    X_cal, y_cal = features(cal_pairs)
    X_ev, y_ev = features(ev)
    if len(X_cal) < 100 or len(X_ev) < 30:
        return {"note": "too few pairs", "features": FEATURES}
    model = QuantileEnsemble(horizon=h).fit(X_cal, y_cal)
    c, lo, hi = model.predict(X_ev).T
    errs = y_ev - c
    acc = float(np.mean(np.abs(errs) <= tol))
    clim_mse = float(np.mean((y_ev - np.nanmean(y_ev)) ** 2))
    out = {
        "accuracy": round(acc, 4),
        "rmse": round(float(np.sqrt(np.mean(errs ** 2))), 3),
        "skill_vs_mean": round(1.0 - float(np.mean(errs ** 2)) / clim_mse, 3),
        "coverage_90": round(float(np.mean((y_ev >= lo) & (y_ev <= hi))), 3),
        "n_train": int(len(X_cal)),
    }
    sigma = np.clip((hi - lo) / (2.0 * 1.645), 1e-3, None)
    crps = np.nanmean([_crps_normal(m, s, y) for m, s, y in zip(c, sigma, y_ev)])
    out["crps"] = round(float(crps), 3)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force-nwp", action="store_true", help="refetch the ERA5 cache")
    ap.add_argument("--live", action="store_true",
                    help="evaluate accumulated issued forecasts (data/nwp_live) "
                         "instead of the ERA5 proxy")
    ap.add_argument("--ensemble", action="store_true",
                    help="also fit the LightGBM quantile ensemble container and "
                         "run the parsimony gate vs the hand blend")
    ap.add_argument("--out", default=OUT / "phase2_eval.json")
    args = ap.parse_args()

    df = pd.read_csv(AGR_CSV)
    sites = build_series(df, "temperature")
    # attach per-site geo in the same (sort=False) order build_series used
    df2 = df.copy()
    df2["ts"] = pd.to_datetime(df2["ts"])
    geo = [(g.latitude.iloc[0], g.longitude.iloc[0])
           for _, g in df2.sort_values("ts").groupby(["latitude", "longitude"], sort=False)]
    # keep sites as 2-tuples (build_series contract); geo stays parallel

    if args.live:
        live = load_live_snapshots()
        if live is None or live.empty:
            print("No snapshots in data/nwp_live yet. Run `python snapshot_nwp.py` "
                  "daily and re-run `--live` once ~3+ weeks have accumulated so "
                  "forecasts have verified.")
            return
        nwp_map = live_nwp_map(sites, geo, live)
        mode = f"live Open-Meteo forecast snapshots ({len(live)} rows)"
        horizons = {h: live_pairs(sites, geo, live, h) for h in HORIZONS}
    else:
        print("Building ERA5 NWP proxy cache ...")
        nwp = build_nwp_cache(df, force=args.force_nwp)
        nwp_map = {}
        for i, (lat, lng) in enumerate(geo):
            sub = nwp[(nwp.latitude == float(lat)) & (nwp.longitude == float(lng))].set_index("date")
            for d in (pd.Timestamp(t).normalize() for t in sites[i][0]):
                val = sub["nwp_mean"].get(d)
                if val is not None and np.isfinite(val):
                    nwp_map[(i, d)] = float(val)
        mode = "open-meteo ERA5 archive (proxy; near-truth, NOT forecast skill)"
        horizons = {h: None for h in HORIZONS}

    report = {"alpha": ALPHA, "calib_frac": CALIB_FRAC, "tol": TOL,
              "nwp": mode, "horizons": {}}
    for h in HORIZONS:
        print(f"\n=== horizon {h}d ===")
        cal, ev = horizons[h] or ([], [])
        if not ev:
            print(f"  no verified live pairs yet (snapshot {len(live)} rows) — "
                  f"need ~3+ weeks of snapshots to score {h}d")
            continue
        d = evaluate_horizon(sites, nwp_map, h, pairs=horizons[h])
        if args.ensemble:
            d["ensemble"] = evaluate_ensemble(sites, nwp_map, h, horizons[h])
            d["parsimony_blend"] = {
                "blend_rmse": d["blend"]["rmse"],
                "ensemble_rmse": d["ensemble"].get("rmse"),
                "ship_blend": not (isinstance(d["ensemble"].get("rmse"), float)
                                   and d["ensemble"]["rmse"] < d["blend"]["rmse"]),
            }
        report["horizons"][f"{h}d"] = d

    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n=== Phase-2 out-of-sample ===")
    print(f"({'live NWP' if args.live else 'ERA5 proxy'})")
    print(f"{'h':>4} {'model':<9} {'acc(+/-3F)':>10} {'rmse':>6} {'skill':>6} {'crps':>6} {'crps_gate':>10}")
    for h in HORIZONS:
        if f"{h}d" not in report["horizons"]:
            continue
        d = report["horizons"][f"{h}d"]
        for lab, m in d.items():
            if lab in ("anomaly", "mos", "normal", "blend"):
                print(f"{h:>4} {lab:<9} {m['accuracy']:>10.3f} {m['rmse']:>6.3f} "
                      f"{m['skill_vs_clim']:>6.3f} {m['crps']:>6.3f}")
        print(f"    (CRPS gate blend<anomaly: {d['crps_gate']}; "
              f"MOS 90% interval coverage: {d['coverage_90_mos']})")
        if args.ensemble:
            e = d["ensemble"]
            if "rmse" in e:
                print(f"    ensemble rmse {e['rmse']} vs blend {d['blend']['rmse']} -> "
                      f"{'ship blend (parsimony)' if d['parsimony_blend']['ship_blend'] else 'ensemble wins'}"
                      f" (cov {e['coverage_90']})")
            else:
                print(f"    ensemble: {e.get('note')}")


if __name__ == "__main__":
    main()
