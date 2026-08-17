import numpy as np
import pandas as pd

from app.ml.drift import (
    feature_psi,
    population_stability_index,
    residual_cusum,
)
from app.ml.synthetic import make_synthetic


def test_psi_zero_for_identical():
    rng = np.random.default_rng(0)
    a = rng.normal(0, 1, 5000)
    assert population_stability_index(a, a) < 0.02


def test_psi_large_for_shifted():
    rng = np.random.default_rng(1)
    a = rng.normal(0, 1, 5000)
    b = rng.normal(3, 1, 5000)
    assert population_stability_index(a, b) > 0.25


def test_cusum_alerts_on_drift():
    rng = np.random.default_rng(2)
    resid = np.concatenate([rng.normal(0, 1, 200), rng.normal(2, 1, 200)])
    _, _, alerts = residual_cusum(resid, ref_std=1.0)
    assert alerts["high"] >= 1


def test_feature_psi_flags_shifted_column():
    df = make_synthetic(n_sites=4, days=30, seed=5)
    ref = df.copy()
    recent = df.copy()
    recent["temperature"] = recent["temperature"] + 8.0
    psi = feature_psi(ref, recent, ["temperature", "humidity"])
    assert psi["temperature"] > 0.25
    assert psi["humidity"] < 0.25
