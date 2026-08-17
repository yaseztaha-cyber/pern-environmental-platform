"""Tests for the cold-start / short-history sensitivity benchmark.

`benchmark_competitors.evaluate_history_window` scores what PERN can do when a
site has only W days of observations ("the user just entered 7 days / 2 weeks /
a month") — centers fit on the W days before a FIXED 30-day eval window, the
same eval days scored at every window so only the history length varies, best
center by RMSE reported and compared to the published bands.
"""
import numpy as np
import pandas as pd

from benchmark_competitors import (
    HISTORY_EVAL_DAYS,
    TOL3,
    evaluate_history_window,
    history_sensitivity,
    history_verdicts,
)


def _sites(rng, n_sites=3, days=800, sigma=1.2, seasonal_amp=8.0, rho=0.85):
    sites = []
    t = pd.date_range("2023-05-30", periods=days, freq="D")
    doy = np.array([d.dayofyear for d in t])
    seasonal = 20.0 + seasonal_amp * np.sin(2 * np.pi * (doy - 80) / 365.25)
    for s in range(n_sites):
        ar = np.zeros(days)
        for i in range(1, days):
            ar[i] = rho * ar[i - 1] + sigma * rng.normal()
        sites.append((t.to_numpy(), seasonal + ar))
    return sites


def test_history_window_24h_accuracy_flat_across_windows():
    """At 24h the forecast needs today's observation, not years of history — so
    accuracy with 7 days of history equals accuracy with a year. This is exactly
    the fact the 24h-fix plan relies on (persistence never degrades on cold
    start). The best center is persistence or anomaly (season-dependent)."""
    rng = np.random.default_rng(0)
    sites = _sites(rng)
    accs = {}
    for W in (7, 14, 30, 365):
        row = evaluate_history_window(sites, 1, W, [1.667])
        assert row["available"]
        assert row["best_center"] in ("persistence", "anomaly")
        assert 0.0 < row["accuracy_within"][TOL3] <= 1.0
        accs[W] = row["accuracy_within"][TOL3]
        assert row["n_eval_pairs"] >= HISTORY_EVAL_DAYS * len(sites) - 2
    assert abs(accs[7] - accs[365]) <= 0.05  # identical eval days, history-independent


def test_history_window_7_days_history_only_persistence_at_longer_leads():
    """7 days of history cannot fit a 7d/30d climatology or anomaly (no cal
    pairs), so those horizons fall back to persistence — the honest cold-start
    answer for a brand-new site."""
    rng = np.random.default_rng(1)
    sites = _sites(rng, days=200)
    for h in (7, 30):
        row = evaluate_history_window(sites, h, 7, [1.667])
        assert row["available"]
        assert set(row["centers"]) == {"persistence"}
        assert row["best_center"] == "persistence"


def test_longer_history_not_worse_at_7d():
    """More history fits a better climatology/anomaly normal, and the eval days
    are identical, so 7d accuracy with a year of history is never worse than
    with two weeks."""
    rng = np.random.default_rng(2)
    sites = _sites(rng)
    r14 = evaluate_history_window(sites, 7, 14, [1.667])
    r365 = evaluate_history_window(sites, 7, 365, [1.667])
    assert r14["available"] and r365["available"]
    assert r365["accuracy_within"][TOL3] >= r14["accuracy_within"][TOL3] - 0.05


def test_history_sensitivity_structure_and_verdicts():
    rng = np.random.default_rng(3)
    sites = _sites(rng)
    hs = history_sensitivity(sites, [1.667], windows=(7, 30, 365))
    assert set(hs) == {"1d", "7d", "30d"}
    assert set(hs["1d"]) == {"7", "30", "365"}
    v = history_verdicts(hs)
    assert v["1d"]["7"]["pern_pct"] is not None
    assert v["1d"]["7"]["competitors"]
    for c in v["1d"]["7"]["competitors"]:
        assert c["verdict"] in ("above band", "within band") or c["verdict"].startswith("below band")
