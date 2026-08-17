import numpy as np

from app.ml.conformal import grouped_conformal_intervals
from app.ml.models import ClimateNormals, SeasonalClimatology


def test_grouped_conformal_reaches_nominal_coverage():
    rng = np.random.default_rng(3)
    n_cal, n_test = 400, 200
    group = np.array([1, 2, 3, 4] * 150, dtype=int)[:n_cal + n_test]
    center_cal = rng.normal(0, 1, n_cal)
    y_cal = center_cal + rng.normal(0, 1, n_cal)
    center_test = rng.normal(0, 1, n_test)
    y_test = center_test + rng.normal(0, 1, n_test)
    lo, hi = grouped_conformal_intervals(
        center_cal, y_cal, group[:n_cal], center_test, group[n_cal:], alpha=0.1)
    cov = np.mean((y_test >= lo) & (y_test <= hi))
    assert 0.85 <= cov <= 0.98  # within binomial noise of 90%


def test_grouped_conformal_widens_low_noise_group():
    rng = np.random.default_rng(4)
    n = 300
    group = np.array([1] * 150 + [2] * 150, dtype=int)
    center = rng.normal(0, 1, n)
    # group 1: tight residuals; group 2: wild residuals
    y = center + np.where(group == 1, 0.5, 5.0) * rng.normal(0, 1, n)
    center_test = rng.normal(0, 1, 80)
    lo, hi = grouped_conformal_intervals(center[:n], y[:n], group[:n],
                                         center_test, np.array([1] * 40 + [2] * 40), alpha=0.1)
    w1 = np.mean(hi[:40] - lo[:40])
    w2 = np.mean(hi[40:] - lo[40:])
    assert w2 > 3 * w1


def test_grouped_conformal_fallback_uses_max_qhat():
    rng = np.random.default_rng(5)
    n_cal, n_test = 200, 30
    group_cal = np.array([1] * n_cal, dtype=int)
    center_cal = rng.normal(0, 1, n_cal)
    y_cal = center_cal + 2.0 * rng.normal(0, 1, n_cal)
    center_test = rng.normal(0, 1, n_test)
    # test group never seen in calibration -> fallback to max calibrated qhat
    lo, hi = grouped_conformal_intervals(center_cal, y_cal, group_cal,
                                         center_test, np.array([9] * n_test, dtype=int), alpha=0.1)
    qhat_fallback = np.quantile(np.abs(y_cal - center_cal), np.ceil(201 * 0.9) / 200)
    assert np.allclose(hi - center_test, qhat_fallback, atol=1e-6)


def test_climatology_extrapolates_beyond_calibration_doy():
    rng = np.random.default_rng(6)
    doy = np.arange(100, 173, dtype=float)[:, None]  # spring, no winter data
    obs = 10.0 + 0.2 * (doy[:, 0] - 100) + rng.normal(0, 0.5, len(doy))
    clim = SeasonalClimatology(doy_idx=0, window_days=10).fit(doy, obs)
    # extrapolate to late summer, far outside training doy
    far = np.array([[219.0]])
    pred = float(clim.predict(far)[0])
    assert 0 < pred < 40  # boundary fallback, never the uninitialized 0.0


def test_climatology_handles_circular_doy_edge():
    rng = np.random.default_rng(7)
    doy = np.arange(350, 366, dtype=float)[:, None]
    doy = np.vstack([doy, np.arange(1, 16, dtype=float)[:, None]])
    obs = 22.0 + rng.normal(0, 0.5, len(doy))
    clim = SeasonalClimatology(doy_idx=0, window_days=5).fit(doy, obs)
    preds = clim.predict(np.array([[1.0], [365.0]]))
    assert np.all(np.isfinite(preds))
    assert np.allclose(preds, 22.0, atol=2.0)


def test_climate_normals_recovers_sinusoid_and_extrapolates():
    rng = np.random.default_rng(8)
    doy = np.tile(np.arange(1, 366, dtype=float), 2)  # two full years
    year = np.repeat([1.0, 2.0], 365)
    mean = 20.0 + 6.0 * np.sin(2 * np.pi * (doy - 80) / 365.25)
    obs = mean + rng.normal(0, 1.0, len(doy))
    X = np.column_stack([doy, year])
    cn = ClimateNormals(doy_idx=0, year_idx=1, n_harmonics=3).fit(X, obs)
    for probe in (60.0, 200.0, 350.0, 400.0):  # beyond 366 = next spring
        pred = float(cn.predict([[probe, 2.0]])[0])
        truth = 20.0 + 6.0 * np.sin(2 * np.pi * (probe - 80) / 365.25)
        assert abs(pred - truth) < 0.6
    sd = cn.predict_std(np.array([[200.0, 2.0]]))[0]
    assert 0.7 < sd < 1.6  # seasonal residual std tracks the noise level


def test_climate_normals_periodic_continuity():
    rng = np.random.default_rng(9)
    doy = np.tile(np.arange(1, 366, dtype=float), 3)
    year = np.repeat([1.0, 2.0, 3.0], 365)
    obs = 15.0 + 8.0 * np.cos(2 * np.pi * (doy - 15) / 365.25) + rng.normal(0, 0.8, len(doy))
    cn = ClimateNormals(doy_idx=0, year_idx=1, n_harmonics=3).fit(np.column_stack([doy, year]), obs)
    p_dec, p_jan = cn.predict([[365.0, 3.0]]), cn.predict([[1.0, 3.0]])
    assert abs(float(p_dec[0]) - float(p_jan[0])) < 0.5  # smooth wraparound
    assert cn.predict([[1.0, 3.0]])[0] < 25.0  # January cold, not leaky
