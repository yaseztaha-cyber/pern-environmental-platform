"""Tests for the Phase-4 served-engine competitor benchmark row.

`benchmark_competitors.evaluate_served_row` scores the actual shipped
ForecastEngine (not bare centers) out-of-sample on the 60/40 protocol, and
`build_comparison` turns its +/-3 degF accuracy into one-to-one verdicts vs
each published competitor band.
"""
import numpy as np
import pandas as pd

from app.ml.forecast import ForecastEngine
from benchmark_competitors import TOL3, build_comparison, evaluate_served_row

N_HARMONICS = 3


def _tiny_artifact(n_sites=2, mean=20.0, rho=0.5):
    coef = [mean, 0.0] + [0.0] * (2 * N_HARMONICS)
    normals = {str(i): {"coef": coef, "std": [2.0], "n_harmonics": N_HARMONICS}
               for i in range(n_sites)}
    horizons = {}
    for h in ("1", "7", "30"):
        horizons[h] = {
            "rho": rho,
            "anomaly_window": 1,
            "normals": normals,
            "alpha_tuned": 0.10,
            "inflation": 1.0,
            "holdout_coverage": 0.90,
            "n_bins": 1,
            "min_bin": 1,
            "vol_edges": [0.0],
            "anom_edges": {"0": [0.0]},
            "qhats": {},
            "month_fallback": {},
            "global_fallback": 2.0,
            "target_std": 3.0,
            "mos": None,
        }
    return {"version": 1,
            "sites": [{"latitude": 30.0 + i, "longitude": 31.0} for i in range(n_sites)],
            "horizons": horizons}


def _sites(rng, n_sites=2, days=300, sigma=1.0):
    sites = []
    for s in range(n_sites):
        doy = np.arange(days) % 365.25
        seasonal = 20.0 + 6.0 * np.sin(2 * np.pi * (doy - 80) / 365.25)
        ar = np.zeros(days)
        for i in range(1, days):
            ar[i] = 0.85 * ar[i - 1] + sigma * rng.normal()
        t = pd.date_range("2024-01-01", periods=days, freq="D")
        sites.append((t.to_numpy(), seasonal + ar))
    return sites


def _geo(sites):
    return [(30.0 + i, 31.0) for i in range(len(sites))]


def _nwp_map(sites, geo):
    return {(i, pd.Timestamp(d).normalize()): 21.0
            for i in range(len(sites)) for d in sites[i][0]}


def test_evaluate_served_row_1d_is_anomaly_without_mos():
    rng = np.random.default_rng(0)
    sites = _sites(rng)
    engine = ForecastEngine(_tiny_artifact())
    row = evaluate_served_row(sites, _geo(sites), _nwp_map(sites, _geo(sites)),
                              engine, 1, [1.667], [1.667])
    assert row["method_share"].get("anomaly", 0.0) == 1.0
    assert row["n_eval_pairs"] > 100
    assert 0.0 < row["rmse"] < 10.0
    assert 0.0 < row["coverage"] <= 1.0
    assert row["interval_width"] > 0.0
    assert 1.667 in [float(k) for k in row["accuracy_within"]]
    assert set(row["strata"]) == {"months", "sites"}
    assert row["strata"]["months"] and row["strata"]["sites"]


def test_evaluate_served_row_7d_falls_back_to_anomaly_without_mos():
    rng = np.random.default_rng(1)
    sites = _sites(rng)
    engine = ForecastEngine(_tiny_artifact())
    row = evaluate_served_row(sites, _geo(sites), _nwp_map(sites, _geo(sites)),
                              engine, 7, [1.667], [1.667])
    assert row["method_share"].get("anomaly", 0.0) == 1.0
    assert row["interval_width"] == 4.0  # 2 * global_fallback * inflation


def test_served_no_nwp_7d_is_anomaly_and_24h_equals_served():
    """no_nwp=True must not touch 24h (anomaly center needs no NWP) and must
    push 7d onto the anomaly fallback — the honest pre-live-NWP rows."""
    rng = np.random.default_rng(2)
    sites = _sites(rng)
    engine = ForecastEngine(_tiny_artifact())
    geo, nwp = _geo(sites), _nwp_map(sites, _geo(sites))

    s24 = evaluate_served_row(sites, geo, nwp, engine, 1, [1.667], [1.667])
    n24 = evaluate_served_row(sites, geo, nwp, engine, 1, [1.667], [1.667], no_nwp=True)
    assert s24["accuracy_within"] == n24["accuracy_within"]
    assert s24["rmse"] == n24["rmse"]

    n7 = evaluate_served_row(sites, geo, nwp, engine, 7, [1.667], [1.667], no_nwp=True)
    assert n7["method_share"].get("anomaly", 0.0) == 1.0
    assert "nwp_mos" not in n7["method_share"]


def test_evaluate_served_row_7d_uses_ensemble_when_present():
    """A 7d artifact that ships the P2 ensemble must serve it when NWP is on."""
    from app.ml.quantile_ensemble import QuantileEnsemble  # noqa: PLC0415

    rng = np.random.default_rng(5)
    n = 200
    X = rng.normal(size=(n, 6))
    y = 20.0 + 0.3 * X[:, 0] + 0.5 * X[:, 2] + 0.5 * X[:, 3] + rng.normal(scale=0.8, size=n)
    art = _tiny_artifact()
    art["horizons"]["7"]["ensemble"] = QuantileEnsemble(horizon=7).fit(X, y)

    sites = _sites(rng)
    engine = ForecastEngine(art)
    row = evaluate_served_row(sites, _geo(sites), _nwp_map(sites, _geo(sites)),
                              engine, 7, [1.667], [1.667])
    assert row["method_share"].get("ensemble", 0.0) == 1.0
    assert 0.0 < row["rmse"] < 10.0
    assert 0.0 < row["coverage"] <= 1.0
    assert row["interval_width"] > 0.0


def test_build_comparison_verdicts():
    def served(acc):
        return {"rmse": 1.0, "mae": 0.7, "coverage": 0.9, "interval_width": 4.0,
                "confidence": 80.0, "n_eval_pairs": 100,
                "accuracy_within": {"1": 0.9, TOL3: acc, "2": 0.99, "3": 1.0},
                "strata": {"months": {}, "sites": {}}}

    ag = {f"{h}d": {"served": served(acc)} for h, acc in ((1, 0.96), (7, 0.80), (30, 0.50))}
    report = {"pern": {"agriculture": ag}}
    comp = build_comparison(report)["horizons"]
    by_label = {c["label"]: c["verdict"] for c in comp["1d"]["competitors"]}
    assert by_label["NWS / ForecastWatch industry"] == "above band"   # 96 >= 95
    assert by_label["OpenWeather"] == "above band"                    # 96 >= 89
    assert by_label["Weatherbit"] == "above band"                     # 96 >= 91
    assert by_label["Ambee"] == "within band"                         # 96 in [90, 100]
    v7 = {c["label"]: c["verdict"] for c in comp["7d"]["competitors"]}
    assert v7["NWS / ForecastWatch industry"] == "above band"    # 80 >= 80
    assert v7["OpenWeather"] == "below band by 2.0 pts"          # 80 < 82
    assert v7["Weatherbit"] == "below band by 4.0 pts"           # 80 < 84
    v30 = {c["horizon"]: c["verdict"] for c in comp["30d"]["competitors"]}
    assert v30["10 d"] == "within band"          # 50 in [30, 60]
    assert comp["1d"]["pern_served_pct"] == 96.0
    assert comp["30d"]["n_eval_pairs"] == 100
