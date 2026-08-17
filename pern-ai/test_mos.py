"""Tests for app/ml/mos.py — MOS bias correction + ensemble blend weights."""
import numpy as np

from app.ml.mos import MOSModel, blend_weights, rolling_skill


def _make_mos_data(n=300, a=2.0, b=1.1, c=0.35, seed=0):
    rng = np.random.default_rng(seed)
    nwp = rng.normal(25.0, 4.0, n)
    anomaly = rng.normal(0.0, 1.5, n)
    obs = a + b * nwp + c * anomaly + rng.normal(0.0, 0.4, n)
    return nwp, anomaly, obs


def test_mos_recovers_biased_forecast_bias():
    nwp, anomaly, obs = _make_mos_data(c=0.0, seed=1)
    model = MOSModel(horizon=7).fit(0, nwp, anomaly, obs)
    p = model.params(0)
    assert p is not None and p["n"] >= 5
    # b ~ 1.1, c ~ 0 (c is a noise regressor here; SE ~ 0.09 on the rolling fit)
    assert abs(p["b"] - 1.1) < 0.05
    assert abs(p["c"]) < 0.1
    # MOS residuals should shrink to the observation noise floor (~0.4)
    X = np.column_stack([np.ones(len(obs)), nwp, anomaly])
    coef = np.array([p["a"], p["b"], p["c"]])
    resid = np.std(obs - X @ coef)
    assert resid < 0.5
    # MOS center should be much closer to obs than the raw NWP
    center = model.center(0, nwp[-1], anomaly[-1])
    raw = nwp[-1]
    assert abs(center - obs[-1]) < abs(raw - obs[-1])


def test_mos_fits_anomaly_term():
    nwp, anomaly, obs = _make_mos_data(c=0.5, seed=2)
    model = MOSModel(horizon=1).fit(0, nwp, anomaly, obs)
    p = model.params(0)
    assert abs(p["c"] - 0.5) < 0.05


def test_mos_rolling_window_adapts_to_regime_change():
    rng = np.random.default_rng(3)
    nwp = rng.normal(25.0, 4.0, 200)
    anomaly = np.zeros(200)
    obs = np.concatenate([2.0 + 1.0 * nwp[:100], 5.0 + 1.0 * nwp[100:]])
    model = MOSModel(horizon=1, window=30).fit(0, nwp, anomaly, obs)
    p = model.params(0)
    # Recent regime: a ~ 5
    assert abs(p["a"] - 5.0) < 0.3


def test_mos_interval_covers_nominal():
    rng = np.random.default_rng(4)
    nwp = rng.normal(25.0, 4.0, 300)
    anomaly = rng.normal(0.0, 1.0, 300)
    obs = 2.0 + 1.1 * nwp + 0.2 * anomaly + rng.normal(0.0, 0.5, 300)
    model = MOSModel(horizon=7).fit(0, nwp, anomaly, obs)
    covered = 0
    for i in range(240, 300):
        lo, hi = model.interval(0, nwp[i], anomaly[i], alpha=0.10)
        if lo <= obs[i] <= hi:
            covered += 1
    assert covered >= 52  # ~60 samples @ 90% nominal


def test_blend_weights_rank_and_nan():
    w = blend_weights({"mos": -0.5, "anomaly": -2.0, "normal": float("nan")})
    assert set(w) == {"mos", "anomaly"}
    assert w["mos"] > w["anomaly"]
    assert abs(sum(w.values()) - 1.0) < 1e-9


def test_rolling_skill_uses_tail():
    errs = {"a": np.full(100, 2.0), "b": np.linspace(5.0, 1.0, 100)}
    sk = rolling_skill(errs, window=20)
    # b improved recently → its trailing skill beats a's constant mediocre skill
    assert sk["b"] > sk["a"]
    # ...but the full-window (unscaled) skill of a would be better
    assert sk["a"] > -4.1
