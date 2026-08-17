"""PERN AI Trust & Prediction Engine (v4.0).

Exposes the trained conformalized-quantile model as a confidence scoring API:
    POST /v1/confidence { latitude, longitude, feature_group, features, ts? }
        -> { score, center, lower, upper, coverage, method, model_version }
    POST /v1/forecast { latitude, longitude, horizon, target_date,
                        obs_temperature?, nwp_temperature? }
        -> { center, lower, upper, coverage, confidence, method, ... }
The forecast endpoint serves the Phase-4 ForecastEngine (accuracy plan §4):
lead-based center hierarchy + conditional-conformal intervals from
`models/forecast_artifact.joblib`.
"""
import os
from datetime import datetime, timezone

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.ml.backtest import confidence_score
from app.ml.models import LightGBMQuantile, SklearnQuantile

MODEL_PATH = os.environ.get("PERN_AI_MODEL", "models/artifact.joblib")
FORECAST_ARTIFACT_PATH = os.environ.get("PERN_AI_FORECAST_ARTIFACT",
                                        "models/forecast_artifact.joblib")
BENCHMARK_PATH = os.environ.get("PERN_AI_BENCHMARK", "models/benchmark.json")
VERSION = "0.4.0"

app = FastAPI(
    title="PERN AI Trust & Prediction Engine",
    version=VERSION,
)

_artifact = None
_artifact_loaded = False
_MISSING = 0.0

_forecast_engine = None
_forecast_engine_loaded = False

_benchmark = None
_benchmark_loaded = False


class ConfidenceRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    feature_group: str = "agriculture"
    features: dict[str, float] = Field(default_factory=dict)
    ts: str | None = None


class ForecastRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    horizon: int = Field(..., ge=1, le=30)
    target_date: str
    obs_temperature: float | None = None
    nwp_temperature: float | None = None


def _load_artifact():
    global _artifact, _artifact_loaded
    if not _artifact_loaded:
        import joblib

        if os.path.exists(MODEL_PATH):
            _artifact = joblib.load(MODEL_PATH)
        _artifact_loaded = True
    return _artifact


def _feature_row(req: ConfidenceRequest) -> np.ndarray:
    feat = dict(req.features)
    if "latitude" not in feat:
        feat["latitude"] = req.latitude
    if "longitude" not in feat:
        feat["longitude"] = req.longitude
    if "month" not in feat and req.ts:
        ts = datetime.fromisoformat(req.ts)
        feat["month"] = ts.month
        feat["day_of_year"] = ts.timetuple().tm_yday
        feat["day_of_week"] = ts.weekday()
    cols = _artifact["features"]
    return np.array([[float(feat.get(c, _MISSING)) for c in cols]], dtype=float)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "pern-ai", "version": VERSION}


@app.post("/v1/confidence")
def confidence(req: ConfidenceRequest) -> dict:
    artifact = _load_artifact()
    if artifact is None:
        return {
            "score": 0.0,
            "center": None,
            "lower": None,
            "upper": None,
            "coverage": None,
            "method": "unavailable",
            "model_version": None,
            "detail": f"no model artifact at {MODEL_PATH}",
        }

    X = _feature_row(req)
    model = artifact["model"]
    alpha = artifact["alpha"]
    qhat = artifact["qhat"]
    target_std = artifact["target_std"]

    center, lower, upper = model.predict_interval(X, alpha=alpha)
    center = float(center[0])
    lower, upper = float(lower[0]) - qhat, float(upper[0]) + qhat

    transform = artifact.get("target_transform", "level")
    anchored = False
    if transform == "delta":
        feat = dict(req.features)
        if "temperature" in feat and np.isfinite(feat["temperature"]):
            center += feat["temperature"]
            lower += feat["temperature"]
            upper += feat["temperature"]
            anchored = True

    drift = _drift_check(X[0], artifact)
    lower, upper, factors = _adapt_interval(center, lower, upper, req, artifact, drift)

    coverage = 1.0 - alpha
    score = confidence_score(upper - lower, target_std, coverage, alpha=alpha)

    method = f"{artifact.get('model_type', 'quantile')}-quantile+cqr"
    if factors["loc_factor"] > 1.01 or factors["feat_factor"] > 1.01:
        method += "+adaptive"
    if transform == "delta":
        method += "+delta"
        if not anchored:
            method += "(unscaled)"

    return {
        "score": score,
        "center": round(center, 4),
        "lower": round(lower, 4),
        "upper": round(upper, 4),
        "coverage": coverage,
        "interval_width": round(upper - lower, 4),
        "method": method,
        "model_version": artifact.get("trained_ts"),
        "feature_group": req.feature_group,
        "served_ts": datetime.now(timezone.utc).isoformat(),
        "drift": drift,
        "uncertainty": factors,
    }


def _load_forecast_engine():
    global _forecast_engine, _forecast_engine_loaded
    if not _forecast_engine_loaded:
        if os.path.exists(FORECAST_ARTIFACT_PATH):
            from app.ml.forecast import ForecastEngine
            _forecast_engine = ForecastEngine.load(FORECAST_ARTIFACT_PATH)
        _forecast_engine_loaded = True
    return _forecast_engine


def _load_benchmark():
    """Published tolerance-accuracy tables (benchmark_competitors.py output)."""
    global _benchmark, _benchmark_loaded
    if not _benchmark_loaded:
        import json
        if os.path.exists(BENCHMARK_PATH):
            try:
                with open(BENCHMARK_PATH, encoding="utf-8") as fh:
                    _benchmark = json.load(fh)
            except (OSError, ValueError):
                _benchmark = None
        _benchmark_loaded = True
    return _benchmark


@app.post("/v1/forecast")
def forecast(req: ForecastRequest) -> dict:
    """Multi-horizon forecast with conditional-conformal intervals (§4).

    `horizon` must be a served lead (1 | 7 | 30).  `target_date` is the
    forecast day (YYYY-MM-DD); `obs_temperature` is today's observation
    (required for the 24h anomaly rung, used for the anomaly input
    otherwise); `nwp_temperature` is the NWP forecast for `target_date`
    (required for the 24h/7d NWP+MOS rung).
    """
    engine = _load_forecast_engine()
    if engine is None:
        return {
            "horizon_days": req.horizon,
            "center": None, "lower": None, "upper": None,
            "coverage": None, "confidence": None, "method": "unavailable",
            "detail": f"no forecast artifact at {FORECAST_ARTIFACT_PATH}",
        }
    try:
        out = engine.interval(
            req.horizon, req.latitude, req.longitude, req.target_date,
            obs_temperature=req.obs_temperature,
            nwp_temperature=req.nwp_temperature)
    except ValueError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    out["model_version"] = engine.version
    out["served_ts"] = datetime.now(timezone.utc).isoformat()
    out["latitude"] = req.latitude
    out["longitude"] = req.longitude
    out["target_date"] = req.target_date
    return out


@app.get("/v1/benchmark")
def benchmark() -> dict:
    """Published tolerance-accuracy tables (§4): PERN within-tolerance shares
    and the provider yardstick numbers they are measured against.  Sourced from
    models/benchmark.json (written by benchmark_competitors.py)."""
    data = _load_benchmark()
    if data is None:
        return {
            "available": False,
            "detail": f"no benchmark tables at {BENCHMARK_PATH}",
        }
    return {
        "available": True,
        "generated_utc": data.get("generated_utc"),
        "yardstick": data.get("yardstick"),
        "protocol": data.get("protocol"),
        "anomaly_normal": data.get("anomaly_normal"),
        "anomaly_per_site": data.get("anomaly_per_site"),
        "anomaly_harmonics": data.get("anomaly_harmonics"),
        "anomaly_window": data.get("anomaly_window"),
        "pern": data.get("pern"),
        "competitors": data.get("competitors"),
        "comparison": data.get("comparison"),
        "comparison_no_nwp": data.get("comparison_no_nwp"),
        "history_sensitivity": data.get("history_sensitivity"),
        "caveats": data.get("caveats"),
    }


def _nearest_training_site_deg(req: ConfidenceRequest, artifact: dict) -> float:
    """Distance (degrees) from the request site to the nearest training site."""
    sites = artifact.get("training_sites") or []
    if not sites:
        return 0.0
    best = float("inf")
    for la, lo in sites:
        d = (req.latitude - la) ** 2 + (req.longitude - lo) ** 2
        if d < best:
            best = d
    return float(best ** 0.5)


def _adapt_interval(center, lower, upper, req, artifact, drift):
    """Widen the calibrated interval for uncertain inputs.

    - loc_factor: new/sparse sites (far from the training grid) get wider
      intervals — spatial leave-locations-out coverage (77%) shows unseen
      sites swing more than the calibration assumes.
    - feat_factor: off-distribution feature values (large |z| vs the training
      reference) get wider intervals.

    Factors are 1.0 in the nominal case so in-grid, in-distribution requests
    are unchanged; the reported coverage stays the calibrated 1 - alpha.
    """
    qhat = artifact.get("qhat", 0.0)

    d_deg = _nearest_training_site_deg(req, artifact)
    penalty = max(0.0, min(1.0, (d_deg - 0.25) / 1.5))
    loc_factor = 1.0 + 0.6 * penalty

    z_max = drift.get("max_abs_z", 0.0)
    feat_factor = 1.0 + max(0.0, min(3.0, z_max - 1.0)) * 0.35

    width = (upper - lower) * loc_factor * feat_factor
    half = width / 2.0
    return (
        center - half,
        center + half,
        {
            "loc_factor": round(loc_factor, 3),
            "feat_factor": round(feat_factor, 3),
            "nearest_training_site_deg": round(d_deg, 3),
            "max_abs_z": z_max,
        },
    )


def _drift_check(row: np.ndarray, artifact: dict) -> dict:
    """Per-request drift hint: z-score of each feature vs the training reference."""
    stats = artifact.get("reference_stats") or {}
    features = artifact.get("features") or []
    flagged = []
    max_abs_z = 0.0
    for i, col in enumerate(features):
        s = stats.get(col)
        if not s or not np.isfinite(s["std"]) or s["std"] <= 0 or i >= len(row):
            continue
        z = abs(float(row[i]) - s["mean"]) / s["std"]
        max_abs_z = max(max_abs_z, z)
        if z > 4.0:
            flagged.append({"feature": col, "z": round(z, 2)})
    return {
        "max_abs_z": round(max_abs_z, 3),
        "flagged": flagged,
        "hint": "off-distribution" if flagged else "in-distribution",
    }
