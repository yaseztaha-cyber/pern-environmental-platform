"""Tests for the Phase-4 served forecast engine + /v1/forecast endpoint."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pandas as pd  # noqa: E402

from app.ml.forecast import ForecastEngine  # noqa: E402

ARTIFACT = Path(__file__).resolve().parent / "models" / "forecast_artifact.joblib"


@pytest.fixture(scope="module")
def engine():
    if not ARTIFACT.exists():
        pytest.skip("forecast_artifact.joblib not built")
    return ForecastEngine.load(ARTIFACT)


def test_artifact_gate_numbers_persisted(engine):
    """The artifact must carry the Phase-3 gate coverage/width/alpha per lead."""
    exp = {
        "1": (0.91, 4.5, 0.05),
        "7": (0.93, 8.0, 0.04),
        "30": (0.88, None, 0.04),
    }
    for h, (min_cov, max_w, alpha) in exp.items():
        rec = engine.artifact["horizons"][h]
        assert rec["coverage"] >= min_cov, f"h={h} coverage {rec['coverage']}"
        assert rec["alpha_tuned"] == alpha
        if max_w is not None:
            assert rec["interval_width"] <= max_w, f"h={h} width {rec['interval_width']}"


def test_lead_center_hierarchy(engine):
    """h==1 anomaly / NWP+MOS, h==7 P2 ensemble (NWP), h==30 anomaly (plan §4)."""
    c1, m1, _ = engine.center(1, 30.0, 30.5, "2026-08-07", obs_temperature=29.5)
    assert m1 == "anomaly"
    assert c1 != pytest.approx(0.0)
    c1m, m1m, _ = engine.center(1, 30.0, 30.5, "2026-08-07",
                                 obs_temperature=29.5, nwp_temperature=29.0)
    assert m1m == "nwp_mos"
    c7, m7, ctx = engine.center(7, 30.0, 30.5, "2026-08-07",
                                obs_temperature=29.5, nwp_temperature=29.0)
    assert m7 == "ensemble"
    assert "lo" in ctx and "hi" in ctx
    c30, m30, _ = engine.center(30, 30.0, 30.5, "2026-08-07", obs_temperature=29.5)
    assert m30 == "anomaly"
    assert c30 != pytest.approx(0.0)


def test_ensemble_method_when_nwp_present(engine):
    """h=7 with NWP serves the parsimony-gated ensemble + its CQR interval."""
    fc = engine.interval(7, 30.0, 30.5, "2026-08-07",
                         obs_temperature=29.5, nwp_temperature=29.0)
    assert fc["method"] == "ensemble"
    assert fc["bin_key"] == "ensemble"
    assert fc["lower"] < fc["center"] < fc["upper"]
    assert 0.85 <= fc["coverage"] <= 1.0
    assert fc["alpha"] == pytest.approx(0.10)


def test_fallback_without_inputs(engine):
    """Missing observation/NWP falls back to the calibrated anomaly center."""
    c, m, _ = engine.center(1, 30.0, 30.5, "2026-08-07", obs_temperature=None)
    assert m == "anomaly"
    c7, m7, _ = engine.center(7, 30.0, 30.5, "2026-08-07",
                              obs_temperature=29.5, nwp_temperature=None)
    assert m7 == "anomaly"
    assert np.isfinite(c) and np.isfinite(c7)


def test_intervals_contain_anomaly_center_at_1d(engine):
    """24h interval must serve the calibrated anomaly center (normal + rho*anom)."""
    obs = 30.0
    fc = engine.interval(1, 30.0, 30.5, "2026-08-07", obs_temperature=obs)
    assert fc["method"] == "anomaly"
    assert fc["lower"] < fc["center"] < fc["upper"]
    assert 0 < fc["width"] < 10.0
    assert 0.85 <= fc["coverage"] <= 1.0


def test_intervals_well_calibrated_on_eval_rows(engine):
    """In-sample coverage over the last eval day of each site stays in band."""
    df = pd.read_csv(Path(__file__).resolve().parent / "data" / "real_history_3y.csv")
    df["ts"] = pd.to_datetime(df["ts"])
    covered = {h: 0 for h in (1, 7, 30)}
    total = {h: 0 for h in (1, 7, 30)}
    for _, g in df.sort_values("ts").groupby(["latitude", "longitude"], sort=False):
        lat, lng = float(g.latitude.iloc[0]), float(g.longitude.iloc[0])
        vals = g["temperature"].to_numpy(float)
        dates = g["ts"].to_numpy()
        for h in (1, 7, 30):
            j = len(vals) - 1 - h  # last 'today' before the final day
            target = dates[j + h]
            obs = float(vals[j])
            fc = engine.interval(h, lat, lng, target, obs_temperature=obs)
            actual = float(vals[j + h])
            total[h] += 1
            covered[h] += int(fc["lower"] <= actual <= fc["upper"])
    for h in (1, 7, 30):
        cov = covered[h] / total[h]
        assert cov >= 0.85, f"h={h} eval-day coverage {cov:.3f}"


def test_endpoint_via_testclient():
    from fastapi.testclient import TestClient  # noqa: PLC0415
    from app.main import app  # noqa: PLC0415

    client = TestClient(app)
    r = client.post("/v1/forecast", json={
        "latitude": 30.0, "longitude": 30.5, "horizon": 7,
        "target_date": "2026-08-07", "obs_temperature": 29.5,
        "nwp_temperature": 29.0,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["horizon_days"] == 7
    assert body["method"] == "ensemble"
    assert body["lower"] < body["center"] < body["upper"]
    assert 0.0 < body["confidence"] <= 100.0
    assert body["coverage"] == pytest.approx(0.90)
    r_bad = client.post("/v1/forecast", json={
        "latitude": 30.0, "longitude": 30.5, "horizon": 45,
        "target_date": "2026-08-07",
    })
    assert r_bad.status_code == 422


def test_benchmark_endpoint_via_testclient():
    """GET /v1/benchmark exposes the published tolerance tables (§4)."""
    from fastapi.testclient import TestClient  # noqa: PLC0415
    from app.main import app  # noqa: PLC0415

    client = TestClient(app)
    r = client.get("/v1/benchmark")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["yardstick"]["deg_c"] == pytest.approx(1.667)
    assert "competitors" in body and len(body["competitors"]) > 0
    ag = body["pern"]["agriculture"]
    assert "1d" in ag and "anomaly" in ag["1d"]
    row = ag["1d"]["anomaly"]
    assert "rmse" in row and "accuracy_within" in row
    assert "1.667" in row["accuracy_within"]
    assert "months" in row["strata"] and "sites" in row["strata"]
    assert "served" in ag["1d"]
    assert "served_no_nwp" in ag["1d"]
    assert "comparison" in body and "7d" in body["comparison"]["horizons"]
    served = body["comparison"]["horizons"]["7d"]["competitors"][0]
    assert "pern_pct" in served and "verdict" in served
    assert "comparison_no_nwp" in body and "7d" in body["comparison_no_nwp"]["horizons"]
    assert body["anomaly_window"] == 1 and body["anomaly_normal"] == "harmonic"
    hs = body.get("history_sensitivity") or {}
    assert "by_horizon" in hs and "7" in hs.get("by_horizon", {}).get("1d", {})
