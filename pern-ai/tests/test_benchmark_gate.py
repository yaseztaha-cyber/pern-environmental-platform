import numpy as np
import pandas as pd

from app.ml.metrics import skill_score
from benchmark_competitors import YARDSTICK_C, tolerance_by_strata
from check_benchmark import check, flatten


def _sites(rng, n_sites=4, days=80, sigma=2.0):
    sites = []
    for s in range(n_sites):
        t = pd.date_range("2026-04-01", periods=days, freq="D")
        vals = 25 + 0.05 * np.arange(days) + sigma * rng.normal(0, 1, days)
        sites.append((t.to_numpy(), vals))
    return sites


def test_skill_score_vs_baseline():
    rng = np.random.default_rng(0)
    y = rng.normal(0, 1, 500)
    good = y + 0.2 * rng.normal(0, 1, 500)
    bad = y + 3.0 * rng.normal(0, 1, 500)
    baseline = y + 1.0 * rng.normal(0, 1, 500)  # noisy reference, mse > 0
    assert skill_score(y, good, baseline) > 0.5
    assert skill_score(y, bad, baseline) < 0
    assert skill_score(y, y, y) == 0.0  # mse_base == 0 guard


def test_skill_score_positive_when_better():
    rng = np.random.default_rng(1)
    y = rng.normal(0, 1, 300)
    good = y + 0.5 * rng.normal(0, 1, 300)
    baseline = rng.normal(0, 2, 300)
    assert skill_score(y, good, baseline) > 0.5


def test_tolerance_by_strata_consistent_with_pooled():
    rng = np.random.default_rng(2)
    sites = _sites(rng)
    tol = 2.0
    months, site_tab = tolerance_by_strata(sites, 1, "persistence", [tol])
    # pooled accuracy must equal the tolerance_curves number from evaluate_horizon;
    # the unweighted mean of month means differs from the row-weighted pooled value,
    # so bound the difference loosely.
    from eval_horizons import evaluate_horizon
    pooled = evaluate_horizon(sites, 1, "persistence", tolerances=[tol])
    vals = [v for t in months.values() for v in t.values()]
    assert abs(np.mean(vals) - pooled["accuracy_within"]["2"]) < 0.02
    # every site has a row and the stratum keys are ints as strings
    assert len(site_tab) == len(sites)
    assert set(months) and all(int(m) in range(1, 13) for m in months)


def test_check_benchmark_passes_identical():
    base = flatten(_fake_bench())
    assert check(base, flatten(_fake_bench()), _cfg()) == []


def test_check_benchmark_detects_regression():
    b = _fake_bench()
    l = _fake_bench()
    l["pern"]["agriculture"]["7d"]["persistence"]["accuracy_within"][str(YARDSTICK_C)] = 0.4
    l["pern"]["agriculture"]["7d"]["persistence"]["rmse"] = 5.0
    failures = check(flatten(b), flatten(l), _cfg())
    metrics = {f[1] for f in failures}
    assert "rmse-up" in metrics and "tol3-accuracy-down" in metrics
    assert failures[0][0] == ("agriculture", 7, "persistence")


def test_check_benchmark_allows_small_noise():
    b = _fake_bench()
    l = _fake_bench()
    l["pern"]["agriculture"]["1d"]["persistence"]["rmse"] *= 1.001
    l["pern"]["agriculture"]["1d"]["persistence"]["coverage"] -= 0.005
    assert check(flatten(b), flatten(l), _cfg()) == []


def _seasonal_sites(rng, n_sites=4, days=730, sigma=1.0):
    """Two full years of a sinusoid + AR(1) anomaly — anomaly must win at h=1."""
    sites = []
    for s in range(n_sites):
        doy = np.arange(days) % 365.25
        seasonal = 20.0 + 6.0 * np.sin(2 * np.pi * (doy - 80) / 365.25)
        ar = np.zeros(days)
        for i in range(1, days):
            ar[i] = 0.9 * ar[i - 1] + sigma * rng.normal()
        t = pd.date_range("2024-01-01", periods=days, freq="D")
        sites.append((t.to_numpy(), seasonal + ar))
    return sites


def test_anomaly_center_beats_persistence_and_climatology_at_1d():
    rng = np.random.default_rng(10)
    sites = _seasonal_sites(rng)
    from eval_horizons import evaluate_horizon
    pers = evaluate_horizon(sites, 1, "persistence", tolerances=[1.667])
    clim = evaluate_horizon(sites, 1, "climatology", tolerances=[1.667])
    ano = evaluate_horizon(sites, 1, "anomaly", tolerances=[1.667])
    assert ano["rmse"] < pers["rmse"]
    assert ano["rmse"] < clim["rmse"]
    assert 0.4 < ano["anomaly_rho"] < 1.0  # strong persistence of the departure


def test_anomaly_center_damps_to_climatology_at_long_horizon():
    rng = np.random.default_rng(11)
    sites = _seasonal_sites(rng)
    from eval_horizons import evaluate_horizon
    ano = evaluate_horizon(sites, 30, "anomaly", tolerances=[1.667])
    clim = evaluate_horizon(sites, 30, "climatology", tolerances=[1.667])
    assert ano["anomaly_rho"] < 0.3
    assert ano["rmse"] <= clim["rmse"] * 1.1  # never worse than pure climatology


def test_monthly_rho_option_fits_per_calendar_month():
    """anomaly_rho_monthly returns a per-target-month persistence table."""
    rng = np.random.default_rng(12)
    sites = _seasonal_sites(rng)
    from eval_horizons import evaluate_horizon
    ano = evaluate_horizon(sites, 30, "anomaly", tolerances=[1.667],
                           anomaly_rho_monthly=True)
    rho_m = ano["anomaly_rho_by_month"]
    assert set(rho_m) == {str(m) for m in range(1, 13)}
    assert all(0.0 <= v <= 1.05 for v in rho_m.values())
    # monthly persistence is a refinement of the pooled rho, not a replacement
    assert abs(float(ano["anomaly_rho"]) - 0.0) < 1.05


def _cfg():
    from check_benchmark import DEFAULTS
    return dict(DEFAULTS)


def _fake_bench():
    def row(rmse, cov, width, conf, tol3, ss):
        return {
            "rmse": rmse, "mae": rmse * 0.7, "coverage": cov,
            "interval_width": width, "confidence": conf, "n_eval_pairs": 100,
            "accuracy_within": {"1": 0.8, str(YARDSTICK_C): tol3, "2": 0.95, "3": 0.99},
            "skill_vs_climatology": ss,
            "strata": {"months": {}, "sites": {}},
        }

    pern = {}
    for name in ("agriculture", "air"):
        pern[name] = {f"{h}d": {
            "persistence": row(1.0, 0.90, 6.0, 70.0, 0.90, 0.5),
            "climatology": row(2.0, 0.90, 7.0, 65.0, 0.60, 0.0),
        } for h in (1, 7, 30)}
    return {"pern": pern}
