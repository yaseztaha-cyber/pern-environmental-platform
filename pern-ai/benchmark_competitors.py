"""Competitor benchmark: PERN tolerance-accuracy vs published provider numbers.

Weather/AQ providers publish "accuracy within tolerance" (typically within
±3 °F) rather than calibration scores. This script measures PERN on the same
yardstick over the identical eval protocol used by eval_horizons.py (first 60%
of each site's timeline calibrates, last 40% is scored against real
observations) and overlays the published figures:

  - NWS / ForecastWatch industry accuracy (within ±3 °F): ~90-95% (1-3 d),
    ~80-85% (4-5 d), ~70-80% (6-7 d), 30-60% (10 d)
  - ForecastWatch 2021 provider averages (1-5 d, within ±3 °F): Microsoft 79.5%,
    TWC/IBM 79.2%, Foreca 77.7%
  - OpenWeather ~89% (24 h), ~82% (7 d)
  - Weatherbit ~91% (24 h), ~84% (7 d)
  - Ambee >90% accuracy

Phase-4 headline row: the **served ForecastEngine** (models/forecast_artifact
.joblib) — the actual product — scored out-of-sample on the same 60/40 split.
Its lead hierarchy mirrors the plan §4 (h=1 anomaly center — NWP+MOS blend
when NWP is supplied —, h<=7 the P2 LightGBM quantile ensemble on the ERA5
proxy cache with the NWP+MOS blend / anomaly as fallback, h=30 anomaly), and
its within-tolerance accuracy is compared one-to-one against each published
competitor band
(report["comparison"]). Bare-center rows stay for transparency.

Phase-0 (living contract) extras:
  - month- and site-stratified within-tolerance tables (one aggregate hides the
    spread across the 16 grid sites / seasons)
  - skill score vs climatology (SS = 1 - MSE/MSE_clim) per horizon
  - flat models/benchmark.csv contract table + models/benchmark_strata.csv
  - --lock writes models/benchmark_baseline.json for check_benchmark.py gates
  - cold-start sensitivity (report["history_sensitivity"] + models/
    benchmark_history.csv + models/charts/benchmark_history_sensitivity.png):
    per-site "user entered only W days of data" — first W days calibrate, next
    30 days scored at each lead; best center per window vs the published bands.

Writes models/benchmark.json + models/benchmark.csv + models/benchmark_strata.csv
+ models/benchmark_baseline.json (--lock) + charts.
"""
import argparse
import collections
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from eval_horizons import (
    ALPHA,
    CALIB_FRAC,
    HORIZONS,
    TRACKS,
    build_center,
    build_series,
    evaluate_horizon,
)
from app.ml.backtest import confidence_score
from app.ml.metrics import rmse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "models"
CHARTS = OUT / "charts"
CHARTS.mkdir(exist_ok=True)

# Phase-4 served-engine inputs: multi-year record (the artifact's training CSV)
# and the ERA5 proxy NWP cache used to fit the artifact's MOS layer.
AGR_CSV = DATA / "real_history_3y.csv"
NWP_CACHE = DATA / "nwp_era5.csv"
SERVED_ARTIFACT = OUT / "forecast_artifact.joblib"

YARDSTICK_F = 3.0
YARDSTICK_C = round(YARDSTICK_F * 5 / 9, 3)  # 1.667
TOL3 = str(YARDSTICK_C)

# Published numbers (web research, Aug 2026). lo/hi give the honest range.
COMPETITORS_TEMP = [
    {"label": "NWS / ForecastWatch industry", "horizon": "1-3 d", "lo": 90, "hi": 95},
    {"label": "NWS / ForecastWatch industry", "horizon": "4-5 d", "lo": 80, "hi": 85},
    {"label": "NWS / ForecastWatch industry", "horizon": "6-7 d", "lo": 70, "hi": 80},
    {"label": "NWS / ForecastWatch industry", "horizon": "10 d", "lo": 30, "hi": 60},
    {"label": "ForecastWatch provider avg (Microsoft)", "horizon": "1-5 d", "lo": 79.5, "hi": 79.5},
    {"label": "ForecastWatch provider avg (TWC/IBM)", "horizon": "1-5 d", "lo": 79.2, "hi": 79.2},
    {"label": "ForecastWatch provider avg (Foreca)", "horizon": "1-5 d", "lo": 77.7, "hi": 77.7},
    {"label": "OpenWeather", "horizon": "24 h", "lo": 89, "hi": 89},
    {"label": "OpenWeather", "horizon": "7 d", "lo": 82, "hi": 82},
    {"label": "Weatherbit", "horizon": "24 h", "lo": 91, "hi": 91},
    {"label": "Weatherbit", "horizon": "7 d", "lo": 84, "hi": 84},
    {"label": "Ambee", "horizon": "24 h", "lo": 90, "hi": 100},  # ">90%"
]

AG_TOLS = [0.5, 1.0, 1.5, YARDSTICK_C, 2.0, 2.5, 3.0, 4.0]
AIR_TOLS = [5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 40.0, 50.0, 60.0, 80.0]
# Tolerances with stratified (month/site) tables — keep the JSON lean.
STRATA_TOLS = {"agriculture": [YARDSTICK_C], "air": [10.0, 25.0, 50.0]}

# Competitor yardsticks are temperature-only (air providers publish little).
# horizon -> relevant published bands (drawn on the 24h / 7d subplots).
PLOT_BANDS = {
    1: [c for c in COMPETITORS_TEMP if c["horizon"] in ("24 h", "1-3 d")],
    7: [c for c in COMPETITORS_TEMP if c["horizon"] in ("7 d", "6-7 d")],
    30: [c for c in COMPETITORS_TEMP if c["horizon"] == "10 d"],
}

# Short-history ("cold start") sensitivity: what happens when a site has only
# W days of observations (the "user just entered 7 days / 2 weeks / a month"
# case). The first W days calibrate, the next HISTORY_EVAL_DAYS are scored at
# lead h, per site — a true cold-start benchmark, no 60/40 re-split.
HISTORY_WINDOWS = (7, 14, 30, 90, 365)
HISTORY_EVAL_DAYS = 30
MIN_CAL_PAIRS = 3


def tolerance_by_strata(sites, h, center_name, tols, pred=None):
    """Per-month and per-site within-tolerance shares on the eval split.

    `pred` (optional callable(i, j, k)) overrides the built center, so the
    served engine can be stratified without re-fitting a bare center.
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
        return {}, {}
    if pred is None:
        pred = build_center(center_name, sites, cal_pairs)
    ev_center = np.array([pred(i, j, k) for i, j, k in ev], dtype=float)
    ev_actual = np.array([sites[i][1][k] for i, _, k in ev], dtype=float)
    errs = np.abs(ev_actual - ev_center)
    months = np.array([pd.Timestamp(sites[i][0][k]).month for i, _, k in ev], dtype=int)
    site_ids = np.array([i for i, _, _ in ev], dtype=int)

    def table(labels, values):
        out = {}
        for lab in np.unique(labels):
            e = errs[labels == lab]
            out[str(lab)] = {f"{t:g}": round(float(np.mean(e <= t)), 4) for t in tols}
        return out

    return table(months, months), table(site_ids, site_ids)


def evaluate_benchmark_row(sites, h, center, tols, strata_tols, anomaly_normal="harmonic",
                          anomaly_window=1, anomaly_per_site=True, anomaly_harmonics=3,
                          anomaly_rho_per_site=True, anomaly_rho_monthly=False):
    """Full benchmark row: accuracy curves, strata, and skill components."""
    res = evaluate_horizon(sites, h, center, tolerances=tols, anomaly_normal=anomaly_normal,
                           anomaly_window=anomaly_window, anomaly_per_site=anomaly_per_site,
                           anomaly_harmonics=anomaly_harmonics,
                           anomaly_rho_per_site=anomaly_rho_per_site,
                           anomaly_rho_monthly=anomaly_rho_monthly)
    months, site_tab = tolerance_by_strata(sites, h, center, strata_tols)
    return {
        "rmse": res["rmse"],
        "mae": res["mae"],
        "coverage": res["coverage"],
        "interval_width": res["interval_width"],
        "confidence": res["confidence"],
        "n_eval_pairs": res["n_eval_pairs"],
        "accuracy_within": res["accuracy_within"],
        "strata": {"months": months, "sites": site_tab},
    }


def add_skill(row_pers, row_clim):
    for row, ref in ((row_pers, row_clim), (row_clim, row_clim)):
        if row is None or ref is None or ref["rmse"] <= 0:
            continue
        row["skill_vs_climatology"] = round(1.0 - (row["rmse"] ** 2) / (ref["rmse"] ** 2), 3)


def _geo(df):
    """[(lat, lng)] in build_series order (sort=False groupby)."""
    df = df.copy()
    df["ts"] = pd.to_datetime(df["ts"])
    return [(g.latitude.iloc[0], g.longitude.iloc[0])
            for _, g in df.sort_values("ts").groupby(["latitude", "longitude"], sort=False)]


def _nwp_map(sites, geo):
    """{(site_index, date): nwp_mean} from the ERA5 proxy cache (eval_nwp layout)."""
    nwp = pd.read_csv(NWP_CACHE, parse_dates=["date"])
    out = {}
    for i, (lat, lng) in enumerate(geo):
        sub = nwp[(nwp.latitude == float(lat)) & (nwp.longitude == float(lng))].set_index("date")
        for d in (pd.Timestamp(t).normalize() for t in sites[i][0]):
            val = sub["nwp_mean"].get(d)
            if val is not None and np.isfinite(val):
                out[(i, d)] = float(val)
    return out


def _served_split(sites, h):
    """Calibration/eval pair lists identical to eval_horizons.py (bare rows)."""
    cal_pairs, ev = [], []
    for site_i, (dates, vals) in enumerate(sites):
        n = len(vals)
        pairs = list(range(n - h))
        n_cal = int(len(pairs) * CALIB_FRAC)
        for j in pairs[:n_cal]:
            cal_pairs.append((site_i, j, j + h))
        for j in pairs[n_cal:]:
            ev.append((site_i, j, j + h))
    return cal_pairs, ev


def evaluate_served_row(sites, geo, nwp_map, engine, h, tols, strata_tols, no_nwp=False):
    """Score the actual served ForecastEngine out-of-sample on the 60/40 split.

    h==1 -> anomaly center (or NWP+MOS blend when NWP is supplied), h<=7 ->
    NWP+MOS blend fed with the ERA5 proxy, h==30 -> anomaly. Intervals are the
    artifact's calibrated conditional-conformal widths, so coverage/width
    measure what /v1/forecast actually serves.

    `no_nwp=True` forces the NWP input to NaN, so the engine falls back to its
    no-NWP rungs (anomaly center at 24 h, anomaly at 7 d) — the honest number
    a site gets until live NWP lands (the ERA5 proxy overstates real forecast
    skill at 7 d).
    """
    _, ev = _served_split(sites, h)
    if not ev:
        return {}
    rec = engine.artifact["horizons"][str(h)]
    centers, los, his, actuals = [], [], [], []
    methods = collections.Counter()
    for i, j, k in ev:
        lat, lng = geo[i]
        target = pd.Timestamp(sites[i][0][k]).normalize()
        obs = sites[i][1][j]
        nwp = float("nan") if no_nwp else nwp_map.get((i, target), float("nan"))
        r = engine.interval(str(h), lat, lng, sites[i][0][k],
                            obs_temperature=obs, nwp_temperature=nwp)
        centers.append(r["center"])
        los.append(r["lower"])
        his.append(r["upper"])
        actuals.append(sites[i][1][k])
        methods[r["method"]] += 1
    centers = np.asarray(centers, float)
    los = np.asarray(los, float)
    his = np.asarray(his, float)
    actuals = np.asarray(actuals, float)
    errs = actuals - centers
    alpha = float(rec["alpha_tuned"])
    target_std = float(rec["target_std"])
    coverage = float(np.mean((actuals >= los) & (actuals <= his)))
    width = float(np.mean(his - los))
    row = {
        "rmse": round(rmse(actuals, centers), 3),
        "mae": round(float(np.mean(np.abs(errs))), 3),
        "coverage": round(coverage, 4),
        "interval_width": round(width, 3),
        "confidence": round(confidence_score(width, target_std, coverage, alpha), 1),
        "n_eval_pairs": int(len(ev)),
        "accuracy_within": {f"{t:g}": round(float(np.mean(np.abs(errs) <= t)), 4)
                            for t in tols},
        "method_share": {m: round(n / len(ev), 4) for m, n in methods.most_common()},
        "alpha_tuned": alpha,
        "inflation": float(rec["inflation"]),
    }

    def served_pred(i, j, k):
        nwp = float("nan") if no_nwp else nwp_map.get(
            (i, pd.Timestamp(sites[i][0][k]).normalize()), float("nan"))
        r = engine.interval(str(h), geo[i][0], geo[i][1], sites[i][0][k],
                            obs_temperature=sites[i][1][j], nwp_temperature=nwp)
        return r["center"]

    row["strata"] = {"months": {}, "sites": {}}
    months, site_tab = tolerance_by_strata(sites, h, None, strata_tols, pred=served_pred)
    row["strata"] = {"months": months, "sites": site_tab}
    return row


def build_comparison(report, key="served"):
    """Served engine vs each published competitor band (within +/-3 degF).

    `key` selects the served row to compare: "served" (ERA5 NWP proxy input)
    or "served_no_nwp" (the honest no-NWP fallback rungs).
    """
    served = report["pern"]["agriculture"]
    out = {
        "note": f"served ForecastEngine (models/forecast_artifact.joblib) "
                f"vs published provider within-tolerance (+/-3 degF) bands; "
                f"agriculture track, 60/40 out-of-sample eval; row '{key}': "
                + ("h=7 uses the ERA5 archive as the NWP input (proxy, see caveats)."
                   if key == "served"
                   else "NWP input forced to NaN, so 24h = anomaly and "
                        "7d = anomaly (the honest pre-live-NWP capability)."),
        "horizons": {},
    }
    for h in HORIZONS:
        acc = served[f"{h}d"][key]["accuracy_within"][TOL3]
        pern = round(acc * 100, 1)
        entries = []
        for c in PLOT_BANDS[h]:
            if pern >= c["hi"]:
                verdict = "above band"
            elif pern >= c["lo"]:
                verdict = "within band"
            else:
                verdict = f"below band by {c['lo'] - pern:.1f} pts"
            entries.append({"label": c["label"], "horizon": c["horizon"],
                            "lo": c["lo"], "hi": c["hi"], "pern_pct": pern,
                            "verdict": verdict})
        out["horizons"][f"{h}d"] = {
            "pern_served_pct": pern,
            "n_eval_pairs": served[f"{h}d"][key]["n_eval_pairs"],
            "competitors": entries,
        }
    return out


def evaluate_history_window(sites, h, W, tols, anomaly_normal="harmonic",
                            anomaly_window=1, anomaly_per_site=True,
                            anomaly_harmonics=3, anomaly_rho_per_site=True):
    """Accuracy with only W days of training history, scored on FIXED eval days.

    True cold start: a site "entered W days ago" (the user just added 7 days /
    2 weeks / a month of data). Every window scores the SAME final
    HISTORY_EVAL_DAYS real days at lead h, so the ONLY thing that changes
    between windows is the history length — an apples-to-apples comparison.
    Centers are fit exclusively on the last W days before that eval window.
    `available=False` (with a reason) when no center can be fit. The best
    center (by RMSE) is the honest answer for that much history.
    """
    cal_pairs, ev = [], []
    for site_i, (dates, vals) in enumerate(sites):
        n = len(vals)
        if n < W + h + HISTORY_EVAL_DAYS:
            continue
        today = n - HISTORY_EVAL_DAYS - h  # "today" of the first eval forecast
        hstart = today - W                 # history = [hstart, today)
        for jj in range(hstart, today - h):
            cal_pairs.append((site_i, jj, jj + h))
        for k in range(today + h, today + h + HISTORY_EVAL_DAYS):
            ev.append((site_i, k - h, k))
    if not ev:
        return {"available": False, "window": W, "horizon": h, "n_eval_pairs": 0,
                "reason": "no site has W+h+eval_days days"}
    rows = {}
    for center in ("persistence", "climatology", "anomaly"):
        if center != "persistence" and len(cal_pairs) < MIN_CAL_PAIRS:
            continue
        pred = build_center(center, sites, cal_pairs, anomaly_normal=anomaly_normal,
                            anomaly_window=anomaly_window, anomaly_per_site=anomaly_per_site,
                            anomaly_harmonics=anomaly_harmonics,
                            anomaly_rho_per_site=anomaly_rho_per_site)
        centers = np.array([pred(i, j, k) for i, j, k in ev], dtype=float)
        actuals = np.array([sites[i][1][k] for i, _, k in ev], dtype=float)
        keep = np.isfinite(centers) & np.isfinite(actuals)
        if keep.sum() < 2:
            continue
        errs = np.abs(actuals[keep] - centers[keep])
        rows[center] = {
            "rmse": round(float(np.sqrt(np.mean((actuals[keep] - centers[keep]) ** 2))), 3),
            "mae": round(float(np.mean(errs)), 3),
            "accuracy_within": {f"{t:g}": round(float(np.mean(errs <= t)), 4) for t in tols},
            "n_eval_pairs": int(keep.sum()),
        }
    if not rows:
        return {"available": False, "window": W, "horizon": h, "n_eval_pairs": int(len(ev)),
                "reason": "no center fit on the history"}
    best = min(rows, key=lambda c: rows[c]["rmse"])
    return {"available": True, "window": W, "horizon": h,
            "n_eval_pairs": int(len(ev)),
            "best_center": best,
            "best_rmse": rows[best]["rmse"],
            "best_mae": rows[best]["mae"],
            "accuracy_within": rows[best]["accuracy_within"],
            "centers": rows}


def history_sensitivity(sites, tols, windows=HISTORY_WINDOWS, anomaly_normal="harmonic",
                        anomaly_window=1, anomaly_per_site=True, anomaly_harmonics=3,
                        anomaly_rho_per_site=True):
    """Cold-start table: window days x horizon -> best-center accuracy."""
    return {f"{h}d": {str(W): evaluate_history_window(
        sites, h, W, tols, anomaly_normal, anomaly_window=anomaly_window,
        anomaly_per_site=anomaly_per_site,
        anomaly_harmonics=anomaly_harmonics,
        anomaly_rho_per_site=anomaly_rho_per_site) for W in windows}
        for h in HORIZONS}


def history_verdicts(hs):
    """Best-center accuracy at each window vs the horizon's published bands."""
    out = {}
    for h in HORIZONS:
        hk = f"{h}d"
        out[hk] = {}
        for W, row in hs[hk].items():
            if not row["available"]:
                out[hk][W] = {"pern_pct": None, "best_center": None,
                              "competitors": [], "note": row.get("reason", "not available")}
                continue
            acc = row["accuracy_within"][TOL3] * 100
            entries = []
            for c in PLOT_BANDS[h]:
                if acc >= c["hi"]:
                    verdict = "above band"
                elif acc >= c["lo"]:
                    verdict = "within band"
                else:
                    verdict = f"below band by {c['lo'] - acc:.1f} pts"
                entries.append({"horizon": c["horizon"], "band": f"{c['lo']:.0f}-{c['hi']:.0f}%",
                                "pern_pct": round(acc, 1), "verdict": verdict})
            out[hk][W] = {"pern_pct": round(acc, 1), "best_center": row["best_center"],
                          "competitors": entries}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT / "benchmark.json")
    ap.add_argument("--agriculture-csv", default=str(AGR_CSV),
                    help="multi-year history CSV (default data/real_history_3y.csv)")
    ap.add_argument("--anomaly-normal", choices=("climatology", "harmonic"), default="harmonic",
                    help="anomaly normal type; default 'harmonic' matches build_forecast_artifact.py")
    ap.add_argument("--anomaly-per-site", dest="anomaly_per_site", action="store_true",
                    help="fit per-site anomaly normals (default True, matches the artifact)")
    ap.add_argument("--no-anomaly-per-site", dest="anomaly_per_site", action="store_false")
    ap.set_defaults(anomaly_per_site=True)
    ap.add_argument("--anomaly-harmonics", type=int, default=3,
                    help="harmonics for the harmonic normal (default 3, matches the artifact)")
    ap.add_argument("--anomaly-window", type=int, default=1,
                    help="rolling window (days) for per-site harmonic normals (matches the artifact)")
    ap.add_argument("--no-served", action="store_true",
                    help="skip the served ForecastEngine row (e.g. no artifact yet)")
    ap.add_argument("--history-windows", default=",".join(map(str, HISTORY_WINDOWS)),
                    help="cold-start history windows in days, comma-separated")
    ap.add_argument("--no-history", action="store_true",
                    help="skip the short-history (cold-start) sensitivity benchmark")
    ap.add_argument("--lock", action="store_true",
                    help="also write models/benchmark_baseline.json (baseline lock)")
    args = ap.parse_args()
    try:
        history_windows = tuple(int(x) for x in args.history_windows.split(",") if x.strip())
    except ValueError:
        ap.error("--history-windows must be comma-separated integers (days)")

    TRACKS["agriculture"] = {**TRACKS["agriculture"], "csv": Path(args.agriculture_csv)}

    report = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "yardstick": {"deg_f": YARDSTICK_F, "deg_c": YARDSTICK_C, "note": "within +/-3 degF (1.667 degC), the NWS/ForecastWatch convention"},
        "protocol": "calibrate on first 60% of each site's timeline, score last 40% vs real observations (alpha=0.10)",
        "anomaly_normal": args.anomaly_normal,
        "anomaly_per_site": args.anomaly_per_site,
        "anomaly_harmonics": args.anomaly_harmonics,
        "anomaly_window": args.anomaly_window,
        "anomaly_config_note": "benchmark bare/anomaly + history rows use the SAME "
                               "anomaly config the artifact ships (harmonic, per-site, "
                               "3 harmonics, window 1), so the bare rows honestly represent "
                               "the served 30d anomaly center",
        "agriculture_csv": str(TRACKS["agriculture"]["csv"]),
        "served_artifact": str(SERVED_ARTIFACT),
        "nwp_proxy": "open-meteo ERA5 archive (h=7 NWP input; near-truth, NOT live forecast skill)",
        "pern": {},
        "competitors": COMPETITORS_TEMP,
        "caveats": [
            "PERN scores daily-mean temperature; providers score instantaneous/daily-high forecasts, so PERN's within-tolerance share is not strictly comparable (daily means are smoother than instantaneous readings).",
            "The served row (h=1 anomaly center / NWP+MOS, h=7 P2 quantile-ensemble / "
            "NWP+MOS blend, h=30 anomaly) is the plan-§4 product; its h=7 NWP input is the "
            "ERA5 reanalysis proxy, which overstates real forecast skill — the live gate "
            "needs ~3+ weeks of data/nwp_live/ snapshots.",
            "served_no_nwp (same engine, NWP forced off) is the honest row a site gets today: 24h = anomaly center, 7d = anomaly. Promotion of the 7d NWP+MOS number is deferred until the live-NWP gate passes.",
            "Bare anomaly rows use the artifact's anomaly config (harmonic, per-site, 3 harmonics, window 1), so they honestly represent the served 30d anomaly center.",
            "The cold-start 24h≈95% figure is measured on the FINAL 30 days of the record only (recent month); the full-record 60/40 served 24h row is the headline number (≈88% today), not the 95%.",
            "The benchmark runs the multi-year record (data/real_history_3y.csv by default).",
            "Air-quality providers publish no consistent within-tolerance accuracy; the air curves are reported without competitor markers.",
        ],
    }

    # served engine (agriculture only): load once, shared across horizons
    engine = None
    geo = None
    nwp_map = None
    if not args.no_served and SERVED_ARTIFACT.exists():
        from app.ml.forecast import ForecastEngine  # noqa: PLC0415
        engine = ForecastEngine.load(SERVED_ARTIFACT)
    elif not args.no_served:
        print(f"note: {SERVED_ARTIFACT} missing — skipping served row "
              "(run build_forecast_artifact.py)")

    csv_rows, strata_rows = [], []
    ag_sites = None
    for name in ("agriculture", "air"):
        df = pd.read_csv(TRACKS[name]["csv"])
        sites = build_series(df, TRACKS[name]["series"])
        if name == "agriculture":
            ag_sites = sites
        if name == "agriculture" and engine is not None:
            geo = _geo(df)
            nwp_map = _nwp_map(sites, geo)
        tols = AG_TOLS if name == "agriculture" else AIR_TOLS
        strata_tols = STRATA_TOLS[name]
        centers = ("persistence", "climatology", "anomaly") if name == "agriculture" \
            else ("persistence", "climatology")
        track = {}
        for h in HORIZONS:
            row = {}
            for center in centers:
                row[center] = evaluate_benchmark_row(
                    sites, h, center, tols, strata_tols, args.anomaly_normal,
                    anomaly_window=args.anomaly_window,
                    anomaly_per_site=args.anomaly_per_site,
                    anomaly_harmonics=args.anomaly_harmonics)
            if name == "agriculture":
                add_skill(row.get("persistence"), row.get("climatology"))
                add_skill(row.get("anomaly"), row.get("climatology"))
                if engine is not None:
                    row["served"] = evaluate_served_row(sites, geo, nwp_map, engine, h,
                                                        tols, strata_tols)
                    add_skill(row.get("served"), row.get("climatology"))
                    row["served_no_nwp"] = evaluate_served_row(sites, geo, nwp_map, engine, h,
                                                               tols, strata_tols, no_nwp=True)
                    add_skill(row.get("served_no_nwp"), row.get("climatology"))
            track[f"{h}d"] = row

            # flat contract rows + strata csv
            for center, r in row.items():
                csv_rows.append({
                    "track": name, "horizon": h, "center": center,
                    "rmse": r["rmse"], "mae": r["mae"], "coverage": r["coverage"],
                    "interval_width": r["interval_width"], "confidence": r["confidence"],
                    "tol3_accuracy": r["accuracy_within"][TOL3] if TOL3 in r["accuracy_within"] else "",
                    "skill_vs_climatology": r.get("skill_vs_climatology", ""),
                    "n_eval_pairs": r["n_eval_pairs"],
                })
                for stype, tab in r["strata"].items():
                    for lab, accs in tab.items():
                        for t, v in accs.items():
                            strata_rows.append({
                                "track": name, "horizon": h, "center": center,
                                "stratum_type": stype, "stratum": lab, "tol": t, "accuracy": v,
                            })
        report["pern"][name] = track

    if engine is not None:
        report["comparison"] = build_comparison(report)
        report["comparison_no_nwp"] = build_comparison(report, key="served_no_nwp")

    if not args.no_history and ag_sites is not None:
        hs = history_sensitivity(ag_sites, AG_TOLS, history_windows, args.anomaly_normal,
                                 anomaly_window=args.anomaly_window,
                                 anomaly_per_site=args.anomaly_per_site,
                                 anomaly_harmonics=args.anomaly_harmonics)
        report["history_sensitivity"] = {
            "protocol": f"per-site cold start: last W days before a fixed "
                        f"{HISTORY_EVAL_DAYS}-day eval window calibrate; the SAME "
                        f"eval days are scored across every window at lead h "
                        f"(apples-to-apples); best center by RMSE",
            "note": "the eval window is the FINAL 30 days of the record (the most recent "
                    "month); absolute accuracy on that single month is not comparable to "
                    "the full-record 60/40 served rows — it answers the cold-start "
                    "question: 'how much accuracy does a site get with only W days of "
                    "history, forecasting the next month?'",
            "windows": list(history_windows),
            "eval_days": HISTORY_EVAL_DAYS,
            "by_horizon": hs,
            "verdicts": history_verdicts(hs),
        }
        _write_csv(OUT / "benchmark_history.csv",
                   _history_rows(report["history_sensitivity"]),
                   ["horizon", "window_days", "available", "best_center", "best_rmse",
                    "best_mae", "tol3_accuracy", "n_eval_pairs", "verdict_24h"])

    out = Path(args.out)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    _write_csv(OUT / "benchmark.csv", csv_rows,
               ["track", "horizon", "center", "rmse", "mae", "coverage", "interval_width",
                "confidence", "tol3_accuracy", "skill_vs_climatology", "n_eval_pairs"])
    _write_csv(OUT / "benchmark_strata.csv", strata_rows,
               ["track", "horizon", "center", "stratum_type", "stratum", "tol", "accuracy"])

    if args.lock:
        baseline = dict(report)
        baseline["_lock"] = {"locked_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                             "note": "Phase-4 baseline lock; check_benchmark.py gates against this"}
        (OUT / "benchmark_baseline.json").write_text(json.dumps(baseline, indent=2), encoding="utf-8")

    print(f"\n=== Competitor benchmark (within ±{YARDSTICK_F} °F = ±{YARDSTICK_C} °C) ===")
    print("\n[PERN — agriculture, daily-mean T2M persistence/climatology/anomaly]")
    print(f"{'horizon':>8} {'center':>12} {'rmse':>7} {'cov':>7} {'±1°C':>7} "
          f"{'±3°F':>7} {'±2°C':>7} {'±3°C':>7} {'SS_clim':>8}")
    for h in HORIZONS:
        ag = report["pern"]["agriculture"]
        for c in ("persistence", "climatology", "anomaly"):
            r = ag[f"{h}d"][c]
            mark = "  <- best" if c == min(("persistence", "climatology", "anomaly"),
                                           key=lambda cc: ag[f"{h}d"][cc]["rmse"]) else ""
            print(f"{h:>3}d   {c:>12} {r['rmse']:>7} {r['coverage']:>7.1%} {r['accuracy_within']['1']:>7.0%} "
                  f"{r['accuracy_within'][TOL3]:>7.0%} {r['accuracy_within']['2']:>7.0%} {r['accuracy_within']['3']:>7.0%} "
                  f"{r.get('skill_vs_climatology', float('nan')):>8}{mark}")
    if engine is not None:
        print("\n[PERN — served engine (ForecastEngine artifact, the shipped product)]")
        print(f"{'horizon':>8} {'method':>14} {'rmse':>7} {'cov':>7} {'±3°F':>7} "
              f"{'width':>7} {'conf':>6} {'SS_clim':>8}")
        for h in HORIZONS:
            r = ag[f"{h}d"]["served"]
            print(f"{h:>3}d   {'serve()':>14} {r['rmse']:>7} {r['coverage']:>7.1%} "
                  f"{r['accuracy_within'][TOL3]:>7.0%} {r['interval_width']:>7} "
                  f"{r['confidence']:>6.1f} {r.get('skill_vs_climatology', float('nan')):>8}")
            print(f"          methods: "
                  + ", ".join(f"{m} {pct:.0%}" for m, pct in r["method_share"].items()))
        print("\n[PERN — served engine, NWP input forced OFF (honest pre-live-NWP rows)]")
        print(f"{'horizon':>8} {'method':>14} {'rmse':>7} {'cov':>7} {'±3°F':>7} "
              f"{'width':>7} {'conf':>6} {'SS_clim':>8}")
        for h in HORIZONS:
            r = ag[f"{h}d"]["served_no_nwp"]
            print(f"{h:>3}d   {'serve()':>14} {r['rmse']:>7} {r['coverage']:>7.1%} "
                  f"{r['accuracy_within'][TOL3]:>7.0%} {r['interval_width']:>7} "
                  f"{r['confidence']:>6.1f} {r.get('skill_vs_climatology', float('nan')):>8}")
            print(f"          methods: "
                  + ", ".join(f"{m} {pct:.0%}" for m, pct in r["method_share"].items()))
    print("\n[PERN — air, PM2.5 ±10/±25/±50 µg/m³]")
    print(f"{'horizon':>8} {'center':>12} {'rmse':>7} {'cov':>7} {'±10':>7} {'±25':>7} {'±50':>7}")
    for h in HORIZONS:
        for c in ("persistence", "climatology"):
            r = report["pern"]["air"][f"{h}d"][c]
            print(f"{h:>3}d   {c:>12} {r['rmse']:>7} {r['coverage']:>7.1%} {r['accuracy_within']['10']:>7.0%} "
                  f"{r['accuracy_within']['25']:>7.0%} {r['accuracy_within']['50']:>7.0%}")
    if "comparison" in report:
        print("\n[Served engine vs published competitors, within ±3 °F]")
        for hk, entry in report["comparison"]["horizons"].items():
            for c in entry["competitors"]:
                print(f"  {c['horizon']:>7} {c['label']:<34} {c['lo']:.0f}-{c['hi']:.0f}% "
                      f"| PERN {entry['pern_served_pct']:5.1f}% -> {c['verdict']}")
    print("\n[Published competitors, within ±3 °F]")
    print(f"{'provider':>36} {'horizon':>8} {'accuracy':>12}")
    for c in COMPETITORS_TEMP:
        acc = f"{c['lo']:.0f}%" if c["lo"] == c["hi"] else f"{c['lo']:.0f}-{c['hi']:.0f}%"
        print(f"{c['label']:>36} {c['horizon']:>8} {acc:>12}")

    make_charts(report, CHARTS / "benchmark.png", CHARTS / "benchmark_air.png")
    if "comparison" in report:
        make_vs_chart(report, CHARTS / "benchmark_vs_competitors.png")
    if "history_sensitivity" in report:
        print("\n[Cold-start sensitivity — only W days of history, best center, within ±3 °F]")
        print(f"{'horizon':>8} {'W (days)':>9} {'best':>11} {'rmse':>7} {'±3°F':>7} {'pairs':>6}  verdict")
        for hk, by_w in report["history_sensitivity"]["by_horizon"].items():
            for W, row in by_w.items():
                if not row["available"]:
                    print(f"{hk:>8} {W:>9} {'—':>11} {'—':>7} {'—':>7} {row['n_eval_pairs']:>6}  {row.get('reason','')}")
                    continue
                v = report["history_sensitivity"]["verdicts"][hk][W]
                verdict = v["competitors"][0]["verdict"] if v["competitors"] else ""
                print(f"{hk:>8} {W:>9} {row['best_center']:>11} {row['best_rmse']:>7} "
                      f"{row['accuracy_within'][TOL3]:>7.0%} {row['n_eval_pairs']:>6}  {verdict}")
        make_history_chart(report, CHARTS / "benchmark_history_sensitivity.png")
    print(f"\nwrote -> {out}")
    print(f"wrote -> {OUT / 'benchmark.csv'} + benchmark_strata.csv"
          + (" + benchmark_history.csv" if "history_sensitivity" in report else "")
          + (" + benchmark_baseline.json (locked)" if args.lock else ""))


def _write_csv(path, rows, cols):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def _history_rows(hs_report):
    """Flat rows for models/benchmark_history.csv (cold-start sensitivity)."""
    rows = []
    for hk, by_w in hs_report["by_horizon"].items():
        for W, row in by_w.items():
            v = hs_report["verdicts"][hk][W]
            verdict = ""
            if v.get("competitors"):
                verdict = v["competitors"][0]["verdict"]
            rows.append({
                "horizon": hk, "window_days": W, "available": row["available"],
                "best_center": row.get("best_center", ""),
                "best_rmse": row.get("best_rmse", ""),
                "best_mae": row.get("best_mae", ""),
                "tol3_accuracy": row.get("accuracy_within", {}).get(TOL3, ""),
                "n_eval_pairs": row["n_eval_pairs"],
                "verdict_24h": verdict,
            })
    return rows


def make_charts(report, out_temp, out_air):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    ag = report["pern"]["agriculture"]
    tol_c = str(YARDSTICK_C)

    def accs(tr, h, c):
        return tr[f"{h}d"][c]["accuracy_within"]

    # --- temperature: 24h and 7d subplots, served engine + best bare center + competitor markers ---
    fig, axes = plt.subplots(1, 2, figsize=(9.4, 3.0), dpi=200)
    has_served = "served" in ag["1d"]
    for ax, h in zip(axes, (1, 7)):
        if has_served:
            r = accs(ag, h, "served")
            tols = [float(k) for k in r]
            acc = [v for v in r.values()]
            ax.plot(tols, np.array(acc) * 100, color="#0B6E4F", lw=2.4, marker="o", ms=3.4,
                    label=f"PERN served {h}d")
        center = max(("persistence", "climatology"),
                     key=lambda c: accs(ag, h, c)[tol_c])
        r = accs(ag, h, center)
        tols = [float(k) for k in r]
        acc = [v for v in r.values()]
        ax.plot(tols, np.array(acc) * 100, color="#0B6E4F", lw=1.1, ls="--", alpha=0.55,
                marker="o", ms=2.4, label=f"best bare {h}d ({center})")
        ax.axvline(YARDSTICK_C, color="#9AA79E", ls=":", lw=1)
        ax.text(YARDSTICK_C + 0.02, 8, "±3 °F", fontsize=7.5, color="#5B6B63")
        for c in PLOT_BANDS[h]:
            y = (c["lo"] + c["hi"]) / 2
            ax.plot([YARDSTICK_C], [y], "s", ms=6, color="#B7791F")
            ax.vlines(YARDSTICK_C, c["lo"], c["hi"], colors="#B7791F", ls="--", lw=1.0)
        labels = [c["label"].split("(")[0].strip() + " " + c["horizon"] for c in PLOT_BANDS[h]]
        ys = [(c["lo"] + c["hi"]) / 2 for c in PLOT_BANDS[h]]
        for (label, y) in zip(labels, ys):
            ax.annotate(label, (YARDSTICK_C, y), textcoords="offset points", xytext=(7, 2),
                        fontsize=6.4, color="#8A6D1F")
        ax.set_title(f"{h}d horizon (agriculture, ±3 °F = {YARDSTICK_C} °C)", fontsize=9, color="#0F2E22")
        ax.set_xlabel("tolerance (°C)", fontsize=8.5)
        ax.set_ylabel("share of forecasts within ±tol (%)", fontsize=8.5)
        ax.set_ylim(0, 105)
        ax.set_xlim(0, 4.3)
        _brand(ax)
    axes[0].legend(fontsize=6.8, frameon=False, loc="lower right")
    fig.tight_layout()
    fig.savefig(out_temp, bbox_inches="tight")
    plt.close(fig)

    # --- air: curves only (no published AQ tolerance numbers) ---
    ar = report["pern"]["air"]
    fig, ax = plt.subplots(figsize=(9.4, 2.6), dpi=200)
    colors = {"persistence": "#0B6E4F", "climatology": "#B7791F"}
    for h in HORIZONS:
        for c in ("persistence", "climatology"):
            r = accs(ar, h, c)
            tols = [float(k) for k in r]
            acc = [v * 100 for v in r.values()]
            ax.plot(tols, acc, ls="--" if c == "climatology" else "-", color=colors[c],
                    marker="o", ms=3, lw=1.6, label=f"{h}d {c}")
    ax.set_title("Air track — PM2.5 tolerance accuracy (µg/m³; no published AQ yardstick)", fontsize=9, color="#0F2E22")
    ax.set_xlabel("tolerance (µg/m³)", fontsize=8.5)
    ax.set_ylabel("share within ±tol (%)", fontsize=8.5)
    ax.set_ylim(0, 105)
    ax.legend(fontsize=7, frameon=False, loc="lower right")
    _brand(ax)
    fig.tight_layout()
    fig.savefig(out_air, bbox_inches="tight")
    plt.close(fig)


def make_vs_chart(report, out):
    """PERN served engine vs competitor bands: one horizontal axis per horizon."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    comp = report["comparison"]["horizons"]
    order = ["1d", "7d", "30d"]
    titles = {"1d": "24 h", "7d": "7 d", "30d": "30 d"}
    fig, axes = plt.subplots(1, 3, figsize=(10.6, 2.9), dpi=200)
    for ax, hk in zip(axes, order):
        entry = comp[hk]
        rows = entry["competitors"]
        if not rows:
            ax.text(0.5, 0.5, "no published band", ha="center", va="center", fontsize=8,
                    color="#5B6B63", transform=ax.transAxes)
            _brand(ax)
            ax.set_title(f"{titles[hk]} horizon", fontsize=9, color="#0F2E22")
            continue
        labels = [r["label"].split("(")[0].strip() for r in rows]
        y = np.arange(len(rows))
        lo = [r["lo"] for r in rows]
        hi = [r["hi"] for r in rows]
        pern = entry["pern_served_pct"]
        ax.barh(y, np.array(hi) - np.array(lo), left=lo, height=0.55,
                color="#E7D5AE", edgecolor="#B7791F", lw=0.8, label="published band")
        for yi, (l, h) in zip(y, zip(lo, hi)):
            ax.text(l - 1.2, yi, f"{l:.0f}", ha="right", va="center", fontsize=6.5, color="#8A6D1F")
            ax.text(h + 1.2, yi, f"{h:.0f}", ha="left", va="center", fontsize=6.5, color="#8A6D1F")
        ax.axvline(pern, color="#0B6E4F", lw=2.2)
        ax.text(pern + 1.0, len(rows) - 0.45, f"PERN {pern:.0f}%", fontsize=7.5,
                color="#0B6E4F", fontweight="bold")
        ax.set_yticks(y)
        ax.set_yticklabels(labels, fontsize=7)
        ax.set_xlim(0, 105)
        ax.set_xticks(range(0, 101, 20))
        ax.set_title(f"{titles[hk]} horizon — share within ±3 °F (%)", fontsize=9, color="#0F2E22")
        ax.set_xlabel("share within ±3 °F (%)", fontsize=8.5)
        ax.legend(fontsize=6.6, frameon=False, loc="lower right")
        _brand(ax)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)


def make_history_chart(report, out):
    """Cold-start sensitivity: best-center ±3 °F accuracy vs history length W,
    per horizon, with the published competitor bands as horizontal references
    and the full-record best-bare line as the asymptotic target."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    hs = report["history_sensitivity"]
    ag = report["pern"]["agriculture"]
    titles = {"1d": "24 h", "7d": "7 d", "30d": "30 d"}
    order = ["1d", "7d", "30d"]
    h_num = {"1d": 1, "7d": 7, "30d": 30}
    fig, axes = plt.subplots(1, 3, figsize=(11.2, 3.0), dpi=200)
    for ax, hk in zip(axes, order):
        h = h_num[hk]
        wins = []
        accs = []
        for W, row in hs["by_horizon"][hk].items():
            if row["available"]:
                wins.append(int(W))
                accs.append(row["accuracy_within"][TOL3] * 100)
        if wins:
            ax.plot(wins, accs, color="#0B6E4F", lw=2.2, marker="o", ms=4,
                    label="PERN best center (cold start)")
            for x, y in zip(wins, accs):
                ax.annotate(hs["verdicts"][hk][str(x)]["best_center"], (x, y),
                            textcoords="offset points", xytext=(0, 7),
                            fontsize=6, color="#5B6B63", ha="center")
        # full-record best bare center = asymptotic reference
        ref_center = max(("persistence", "climatology"),
                         key=lambda c: ag[hk][c]["accuracy_within"][TOL3])
        ref = ag[hk][ref_center]["accuracy_within"][TOL3] * 100
        ax.axhline(ref, color="#0B6E4F", ls="--", lw=1.2, alpha=0.6)
        ax.text(wins[-1] * 1.05, ref, f"full record ({ref:.0f}%)",
                fontsize=6.5, color="#0B6E4F", va="center")
        # published bands
        for c in PLOT_BANDS[h]:
            ax.axhspan(c["lo"], c["hi"], color="#E7D5AE", alpha=0.45, lw=0)
        labels = [c["label"].split("(")[0].strip() for c in PLOT_BANDS[h]]
        for i, c in enumerate(PLOT_BANDS[h]):
            ax.text(wins[0] - 3, c["hi"] + 1.5, f"{labels[i]} {c['lo']:.0f}-{c['hi']:.0f}%",
                    fontsize=6, color="#8A6D1F")
        ax.set_xscale("log")
        ax.set_xticks(wins)
        ax.set_xticklabels([f"{w}d" for w in wins], fontsize=7)
        ax.set_ylim(0, 105)
        ax.set_title(f"{titles[hk]} horizon — ±3 °F with W days of history", fontsize=9,
                     color="#0F2E22")
        ax.set_xlabel("history available (days, log)", fontsize=8.5)
        ax.set_ylabel("share within ±3 °F (%)", fontsize=8.5)
        ax.legend(fontsize=6.4, frameon=False, loc="lower right")
        _brand(ax)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)


def _brand(ax):
    ax.tick_params(colors="#37474F", labelsize=8)
    ax.set_facecolor("white")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color("#B9C9BF")
    ax.grid(axis="y", color="#EAF4EE", lw=0.8)


if __name__ == "__main__":
    sys.exit(main())
