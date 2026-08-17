"""Tests for conditional (per-bin) split conformal intervals."""
import numpy as np

from app.ml.conformal import conditional_conformal_intervals
from eval_horizons import _inflation_factor


def _mk(seed=0, n_cal=2400):
    rng = np.random.default_rng(seed)
    n_test = 400
    bin_cal = [f"m1|v{0 if i % 2 == 0 else 1}|a0" for i in range(n_cal)]
    bin_test = [f"m1|v{0 if i % 2 == 0 else 1}|a0" for i in range(n_test)]
    sig = np.array([0.5 if "v0" in b else 2.0 for b in bin_cal])
    y_cal = rng.normal(0.0, sig)
    sig_t = np.array([0.5 if "v0" in b else 2.0 for b in bin_test])
    y_test = rng.normal(0.0, sig_t)
    center_cal = np.zeros(n_cal)
    center_test = np.zeros(n_test)
    return center_cal, y_cal, bin_cal, center_test, y_test, bin_test


def test_conditional_coverage_in_band_for_each_vol_bin():
    center_cal, y_cal, bin_cal, center_test, y_test, bin_test = _mk()
    lo, hi, _ = conditional_conformal_intervals(
        center_cal, y_cal, bin_cal, center_test, bin_test,
        alpha=0.1, min_bin=20, fallback_key=lambda b: b.split("|")[0])
    for v in ("v0", "v1"):
        mask = np.array([v in b for b in bin_test])
        cov = float(np.mean((y_test[mask] >= lo[mask]) & (y_test[mask] <= hi[mask])))
        assert 0.85 <= cov <= 0.95, f"{v} coverage {cov:.3f}"


def test_high_vol_bin_widths_wider_than_low_vol():
    center_cal, y_cal, bin_cal, center_test, y_test, bin_test = _mk()
    lo, hi, _ = conditional_conformal_intervals(
        center_cal, y_cal, bin_cal, center_test, bin_test, alpha=0.1, min_bin=20)
    w = hi - lo
    w_hi = np.mean(w[[("v1" in b) for b in bin_test]])
    w_lo = np.mean(w[[("v0" in b) for b in bin_test]])
    assert w_hi > 1.5 * w_lo


def test_unseen_bin_uses_month_fallback():
    center_cal, y_cal, bin_cal, center_test, _, bin_test = _mk()
    # all cal bins are v0; test bins are v1 (never seen)
    bin_cal_v0 = [b.replace("v1", "v0") for b in bin_cal]
    bin_test_v1 = [b.replace("v0", "v1") for b in bin_test]
    lo, hi, meta = conditional_conformal_intervals(
        center_cal, y_cal, bin_cal_v0, center_test, bin_test_v1,
        alpha=0.1, min_bin=20, fallback_key=lambda b: b.split("|")[0])
    w = hi - lo
    # unseen v1 rows fall back to the month-max of v0 bins -> wide, not zero
    assert np.all(w > 0.0)
    assert meta["fallback"]["m1"] > 0.0


def test_bins_below_min_merge_to_fallback():
    center_cal = np.zeros(40)
    y_cal = np.arange(40, dtype=float)
    bin_cal = [f"m1|v{0 if i < 5 else 1}|a0" for i in range(40)]  # v0 only 5 rows
    center_test = np.zeros(4)
    bin_test = ["m1|v0|a0"] * 4
    lo, hi, meta = conditional_conformal_intervals(
        center_cal, y_cal, bin_cal, center_test, bin_test,
        alpha=0.1, min_bin=20, fallback_key=lambda b: b.split("|")[0])
    assert "m1|v0|a0" not in meta["qhats"]  # too few rows -> not a bin
    assert (hi - lo > 0).all()  # served by the month fallback


def test_inflation_factor_returns_one_when_already_covered():
    rng = np.random.default_rng(1)
    y = rng.normal(0.0, 1.0, 2000)
    center = np.zeros(2000)
    assert _inflation_factor(center, y, center - 3.0, center + 3.0, target=0.93) == 1.0


def test_inflation_factor_raises_coverage_to_target():
    rng = np.random.default_rng(2)
    y = rng.normal(0.0, 1.0, 2000)
    center = np.zeros(2000)
    s = _inflation_factor(center, y, center - 0.8, center + 0.8, target=0.93)
    cov = float(np.mean((y >= -0.8 * s) & (y <= 0.8 * s)))
    assert s > 1.0
    assert 0.925 <= cov <= 0.94
