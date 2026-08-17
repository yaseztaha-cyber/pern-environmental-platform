import joblib
import numpy as np
import pytest

from app.ml.conformal import cqr_quantile
from app.ml.cv import calibration_split
from app.ml.models import LightGBMQuantile
from app.ml.synthetic import make_synthetic
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("model")
    path = str(tmp / "artifact.joblib")

    df = make_synthetic(n_sites=6, days=40, seed=5)
    fit_idx, calib_idx = calibration_split(np.arange(len(df)), df, frac=0.3)
    feats = list(df.drop(columns=["target", "ts"]).select_dtypes(include=[np.number]).columns)
    X = df[feats].to_numpy()
    y = df["target"].to_numpy(dtype=float)
    model = LightGBMQuantile(n_estimators=60, num_leaves=16)
    model.fit(X[fit_idx], y[fit_idx])
    qhat = cqr_quantile(model.predict_interval, X[calib_idx], y[calib_idx], alpha=0.1)
    joblib.dump(
        {
            "features": feats,
            "model": model,
            "model_type": "lightgbm",
            "alpha": 0.1,
            "qhat": qhat,
            "target_std": float(y.std()),
            "reference_stats": {
                c: {"mean": float(np.nanmean(X[:, i])), "std": float(np.nanstd(X[:, i]))}
                for i, c in enumerate(feats)
            },
            "training_sites": [[30.0, 31.0], [30.5, 31.5], [31.0, 30.0]],
            "trained_ts": "2026-08-11T00:00:00+00:00",
        },
        path,
    )

    import app.main as main

    main.MODEL_PATH = path
    main._artifact = None
    main._artifact_loaded = False
    return TestClient(main.app)


def test_confidence_endpoint(client):
    r = client.post(
        "/v1/confidence",
        json={
            "latitude": 30.0,
            "longitude": 31.0,
            "feature_group": "agriculture",
            "features": {
                "temperature": 13.0,
                "humidity": 55.0,
                "wind_speed": 3.5,
                "precipitation": 5.0,
                "month": 1,
                "day_of_year": 20,
                "day_of_week": 3,
            },
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert 0.0 <= body["score"] <= 100.0
    assert body["lower"] < body["center"] < body["upper"]
    assert body["coverage"] == 0.9
    assert body["method"] == "lightgbm-quantile+cqr"
    assert body["model_version"] == "2026-08-11T00:00:00+00:00"


def test_confidence_endpoint_delta_transform(tmp_path):
    """A delta-transform artifact anchors predictions to the observed temperature."""
    import app.main as main

    df = make_synthetic(n_sites=4, days=30, seed=9)
    rng = np.random.default_rng(3)
    df["delta"] = 0.5 * np.sin(df["day_of_year"]) + rng.normal(0, 0.4, len(df))
    df["target"] = df["temperature"] + df["delta"]
    fit_idx, calib_idx = calibration_split(np.arange(len(df)), df, frac=0.3)
    feats = list(df.drop(columns=["target", "delta", "ts"]).select_dtypes(include=[np.number]).columns)
    X = df[feats].to_numpy()
    y = df["delta"].to_numpy(dtype=float)
    model = LightGBMQuantile(n_estimators=40, num_leaves=16)
    model.fit(X[fit_idx], y[fit_idx])
    qhat = cqr_quantile(model.predict_interval, X[calib_idx], y[calib_idx], alpha=0.1)
    path = str(tmp_path / "delta.joblib")
    joblib.dump(
        {
            "features": feats,
            "model": model,
            "model_type": "lightgbm",
            "alpha": 0.1,
            "qhat": qhat,
            "target_std": float(y.std()),
            "target_transform": "delta",
            "trained_ts": "2026-08-11T00:00:00+00:00",
        },
        path,
    )

    main.MODEL_PATH = path
    main._artifact = None
    main._artifact_loaded = False
    client = TestClient(main.app)
    r = client.post(
        "/v1/confidence",
        json={"latitude": 30.0, "longitude": 31.0, "features": {"temperature": 25.0, "day_of_year": 60}},
    )
    body = r.json()
    assert r.status_code == 200
    assert body["method"] == "lightgbm-quantile+cqr+delta"
    # Anchored: center = 25 + delta_center, so it must sit near the 25 level.
    assert 23.0 < body["center"] < 27.0
    assert body["lower"] < body["center"] < body["upper"]


def test_confidence_endpoint_unavailable(monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, "MODEL_PATH", "does/not/exist.joblib")
    monkeypatch.setattr(main, "_artifact", None)
    monkeypatch.setattr(main, "_artifact_loaded", False)
    client = TestClient(main.app)
    r = client.post(
        "/v1/confidence",
        json={"latitude": 30.0, "longitude": 31.0, "features": {"temperature": 22.0}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["score"] == 0.0
    assert body["method"] == "unavailable"


def test_adaptive_width_varies_with_site_and_features(tmp_path):
    """The confidence score must change with input conditions, not be constant."""
    import app.main as main

    df = make_synthetic(n_sites=6, days=40, seed=5)
    fit_idx, calib_idx = calibration_split(np.arange(len(df)), df, frac=0.3)
    feats = list(df.drop(columns=["target", "ts"]).select_dtypes(include=[np.number]).columns)
    X = df[feats].to_numpy()
    y = df["target"].to_numpy(dtype=float)
    model = LightGBMQuantile(n_estimators=60, num_leaves=16)
    model.fit(X[fit_idx], y[fit_idx])
    qhat = cqr_quantile(model.predict_interval, X[calib_idx], y[calib_idx], alpha=0.1)
    path = str(tmp_path / "adaptive.joblib")
    joblib.dump(
        {
            "features": feats,
            "model": model,
            "model_type": "lightgbm",
            "alpha": 0.1,
            "qhat": qhat,
            "target_std": float(y.std()),
            "reference_stats": {
                c: {"mean": float(np.nanmean(X[:, i])), "std": float(np.nanstd(X[:, i]))}
                for i, c in enumerate(feats)
            },
            "training_sites": [[30.0, 31.0], [30.5, 31.5], [31.0, 30.0]],
            "trained_ts": "2026-08-11T00:00:00+00:00",
        },
        path,
    )
    main.MODEL_PATH = path
    main._artifact = None
    main._artifact_loaded = False
    client = TestClient(main.app)

    feats_base = {"temperature": 13.0, "humidity": 55.0, "wind_speed": 3.5,
                  "precipitation": 5.0, "month": 1, "day_of_year": 20, "day_of_week": 3}

    base = client.post("/v1/confidence", json={"latitude": 30.0, "longitude": 31.0,
                                               "features": feats_base}).json()
    far = client.post("/v1/confidence", json={"latitude": 33.0, "longitude": 34.0,
                                              "features": feats_base}).json()
    hot = client.post("/v1/confidence", json={"latitude": 30.0, "longitude": 31.0,
                                              "features": {**feats_base, "temperature": 50.0}}).json()
    assert base["uncertainty"]["loc_factor"] <= 1.01
    assert base["uncertainty"]["feat_factor"] <= 1.01
    assert far["uncertainty"]["loc_factor"] > 1.01
    assert far["interval_width"] > base["interval_width"]
    assert far["score"] < base["score"]
    assert hot["uncertainty"]["feat_factor"] > 1.01
    assert hot["score"] < base["score"]
    assert hot["method"].endswith("+adaptive")
