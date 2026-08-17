import numpy as np
import pandas as pd

from app.ml.backtest import feature_matrix, run_backtest
from app.ml.conformal import cqr_intervals
from app.ml.cv import leave_locations_out_split, temporal_block_split
from app.ml.metrics import interval_coverage, mae, pinball_loss, rmse
from app.ml.models import LightGBMQuantile, PersistenceResidual
from app.ml.synthetic import make_synthetic


def test_metrics_basic():
    y = np.array([1.0, 2.0, 3.0, 4.0])
    pred = np.array([1.2, 1.8, 3.1, 3.9])
    assert rmse(y, pred) > 0
    assert mae(y, pred) < 0.5
    assert interval_coverage(y, np.zeros(4), np.full(4, 10)) == 1.0
    assert pinball_loss(y, pred, 0.5) == 0.5 * mae(y, pred)


def test_feature_matrix_median_uses_only_median_source():
    """Regression: imputation medians must come from training rows, not test."""
    df = pd.DataFrame({"a": [1.0, 2.0, np.nan], "b": [100.0, 200.0, 300.0]})
    X = feature_matrix(df, ["a", "b"], median_source=np.array([0, 1]))
    assert X[2, 0] == 1.5  # median of [1, 2], not [1, 2, 300]


def test_run_backtest_survives_nan_features():
    df = make_synthetic(n_sites=6, days=40, seed=17)
    df["ts"] = pd.to_datetime(df["ts"])
    df.loc[df.index % 7 == 0, "precipitation"] = np.nan
    folds = temporal_block_split(df, n_folds=3)
    model = LightGBMQuantile(n_estimators=40, num_leaves=12)
    result = run_backtest(df, model, "target", folds, alpha=0.1)
    assert 0.0 <= result["metrics"]["coverage"] <= 1.0
    assert result["metrics"]["rmse"] >= 0


def test_temporal_split_is_anticausal():
    df = make_synthetic(days=60, n_sites=3)
    folds = temporal_block_split(df, n_folds=4)
    for train, test in folds:
        train_max = df["ts"].iloc[train].max()
        test_min = df["ts"].iloc[test].min()
        assert train_max <= test_min


def test_leave_locations_out_no_overlap():
    df = make_synthetic(n_sites=8, days=20)
    folds = leave_locations_out_split(df, n_groups=4)
    for train, test in folds:
        train_sites = set(zip(df["latitude"].iloc[train], df["longitude"].iloc[train]))
        test_sites = set(zip(df["latitude"].iloc[test], df["longitude"].iloc[test]))
        assert train_sites.isdisjoint(test_sites)


def test_cqr_coverage_near_target():
    df = make_synthetic(n_sites=10, days=120, seed=3)
    feats = ["temperature", "precipitation", "humidity", "wind_speed", "latitude", "longitude", "day_of_year"]
    X = df[feats].to_numpy()
    y = df["target"].to_numpy()
    order = np.argsort(df["ts"].values)
    X, y = X[order], y[order]
    split = int(len(X) * 0.6)
    cal_size = int(len(X) * 0.2)
    fit, cal, test = X[:split], X[split:split + cal_size], X[split + cal_size:]
    yf, yc, yt = y[:split], y[split:split + cal_size], y[split + cal_size:]

    model = LightGBMQuantile(n_estimators=80, num_leaves=16)
    model.fit(fit, yf)
    center, lower, upper = cqr_intervals(model.predict_interval, cal, yc, test, alpha=0.1)
    cov = interval_coverage(yt, lower, upper)
    assert cov >= 0.7
    assert cov <= 1.0


def test_run_backtest_end_to_end():
    df = make_synthetic(n_sites=8, days=60, seed=11)
    df["ts"] = pd.to_datetime(df["ts"])
    folds = temporal_block_split(df, n_folds=3)
    model = LightGBMQuantile(n_estimators=60, num_leaves=16)
    result = run_backtest(df, model, "target", folds, alpha=0.1)
    assert result["metrics"]["n"] == sum(len(t) for _, t in folds)
    assert result["metrics"]["rmse"] < df["target"].std()
    assert 0.0 <= result["metrics"]["coverage"] <= 1.0


def test_persistence_residual_center_is_temperature():
    df = make_synthetic(n_sites=4, days=30, seed=7)
    df["ts"] = pd.to_datetime(df["ts"])
    model = PersistenceResidual(temp_idx=0)
    model.fit(np.zeros((3, 4)), np.zeros(3))
    center, lower, upper = model.predict_interval(np.array([[5.0, 0, 0, 0]]))
    assert center[0] == 5.0
    assert lower[0] == upper[0] == 5.0


def test_persistence_backtest_matches_persistence_rmse():
    df = make_synthetic(n_sites=4, days=60, seed=13)
    df["ts"] = pd.to_datetime(df["ts"])
    df = df.sort_values(["latitude", "longitude", "ts"])
    df["target"] = df.groupby(["latitude", "longitude"])["temperature"].shift(-1)
    df = df.dropna(subset=["target"]).reset_index(drop=True)
    folds = temporal_block_split(df, n_folds=3)
    model = PersistenceResidual(temp_idx=0)
    result = run_backtest(df, model, "target", folds, alpha=0.1)
    assert result["metrics"]["coverage"] >= 0.7
    assert result["metrics"]["rmse"] < df["target"].std()
