# PERN v4.0 — AI Trust & Prediction Engine

## Architecture & Implementation Plan

---

### Executive Summary

PERN v4.0 adds a **learned intelligence layer** on top of the v3.0 data fabric. It replaces the current heuristic confidence scoring in `trust-engine.js` (fixed weights, hardcoded `historicalAccuracy = 0.85`) with a **calibrated, continuously-trained model suite** that:

1. Produces **statistically calibrated confidence scores** for every reading — physical, virtual (satellite-derived), and external.
2. Builds **precise virtual sensors** at arbitrary GPS coordinates by learning spatiotemporal structure from thousands of trusted open-source datasets.
3. Generates **probabilistic forecasts** (1–7 day horizons) with prediction intervals, not point estimates.

Two domain tracks run **in parallel** on one shared pipeline:

| Track | Variables | Sources | Product value |
|---|---|---|---|
| **Agriculture** | soil moisture, evapotranspiration (ET), crop-climate stress, irrigation demand | ERA5, GPM/IMERG, SMAP, MODIS, ECOSTRESS, SoilGrids, FAO-56, NASA POWER, CHIRPS | Core PERN mission — Nile Delta (Tanta, Cairo, Alexandria, Delta Rural) |
| **Air quality** | PM2.5/PM10, NO2, O3, SO2, CO | Sentinel-5P, OpenAQ, WAQI, Sensor.Community, NASA FIRMS | Existing v3.0 ingestion stack, fastest to a trainable dataset |

---

## Strategic Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PERN v4.0 AI Trust & Prediction Engine             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────── DATA LAYER (shared) ──────────────────────┐  │
│  │  Source Catalog + License Registry (per-source metadata)      │  │
│  │  Adapters: CDS/STAC/REST → global-ingestion.js + sources/*    │  │
│  │  Normalization (data-normalizer.js) → unified schema          │  │
│  │  Feature Store: TimescaleDB, common grid (1 km / 1 h)         │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
│                                 ▼                                    │
│  ┌──────────────────── MODEL LAYER (pern-ai, Python) ───────────┐  │
│  │                                                              │  │
│  │  Shared:  conformal calibration  •  ensemble disagreement    │  │
│  │          drift monitors  •  CRPS/coverage evaluation         │  │
│  │                                                              │  │
│  │  Agriculture track           Air quality track               │  │
│  │  ├ soil moisture            ├ AQ concentration               │  │
│  │  ├ ET / water demand        ├ plume / transport (wind-engine)│  │
│  │  └ crop-climate stress      └ openaq cross-validation        │  │
│  │                                                              │  │
│  │  Spatial: GNN / Neural-Process (virtual sensors anywhere)    │  │
│  │  Forecast: N-HiTS / PatchTST (1–7 day probabilistic)         │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
│                                 ▼                                    │
│  ┌──────────────────── INTEGRATION LAYER ───────────────────────┐  │
│  │  trust-engine.js → /v1/confidence                            │  │
│  │  satellite-engine.js → /v1/interpolate (virtual sensors)     │  │
│  │  prediction/analysis engine → /v1/forecast                   │  │
│  │  Fallback: AI down → current heuristic path (never blocked)  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  MLOps: DVC data versioning • MLflow registry • weekly retrain      │
│         PSI drift alerts • per-source freshness checks              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase A: Data Layer (shared)

### A.1 Source catalog

A new `global_data_sources` registry (already planned in v3.0) extended with **model columns**: `license`, `grid_resolution`, `update_cadence`, `spatial_extent`, `citation`, `feature_group` (agriculture/air/shared).

### A.2 Priority adapters (add to `pern-backend/services/sources/`)

| # | Source | Type | License | Track |
|---|---|---|---|---|
| 1 | NASA POWER | Meteorology REST | Public domain | Both |
| 2 | OpenAQ | Air quality REST | CC-BY-4.0 | Air |
| 3 | Sensor.Community | Citizen station stream | ODbL | Air |
| 4 | Sentinel-5P (CDS) | Satellite NO2/O3/SO2 | ODbL | Air |
| 5 | ERA5 / ERA5-Land (CDS) | Reanalysis meteorology | ODbL (CDS) | Agriculture |
| 6 | GPM/IMERG | Rainfall | Public domain | Agriculture |
| 7 | SMAP (NASA) | Soil moisture | Public domain | Agriculture |
| 8 | MODIS NDVI (STAC) | Vegetation index | Public domain | Agriculture |
| 9 | ECOSTRESS | Evapotranspiration | Public domain | Agriculture |
| 10 | SoilGrids (ISRIC) | Soil properties | ODbL | Agriculture |
| 11 | WAQI | Air quality aggregator | Varies | Air |
| 12 | NOAA NCEI / USCRN | Weather stations | Public domain | Both |

Scaling note: catalog entries expand into thousands of *datasets* (Sensor.Community alone = 10k+ station streams; ERA5 = multi-decade hourly global fields). Use **subsetting** (CDS API, STAC bbox/date, GEE) so we never download raw petabytes locally.

### A.3 Feature store schema

Extend v3.0 tables:

```sql
CREATE TABLE feature_vectors (
  id BIGSERIAL PRIMARY KEY,
  feature_group TEXT NOT NULL,            -- 'agriculture' | 'air'
  latitude  DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  ts        TIMESTAMPTZ NOT NULL,
  source_id TEXT NOT NULL,
  snapshot  TEXT NOT NULL,                -- data version hash
  features  JSONB NOT NULL,               -- aligned, unit-normalized
  target    JSONB,                        -- ground-truth label if collocated
  quality   NUMERIC(5,4) NOT NULL,
  provenance TEXT[] NOT NULL
);
CREATE INDEX idx_feature_vectors_gt ON feature_vectors (feature_group, ts);
CREATE INDEX idx_feature_vectors_xy ON feature_vectors (latitude, longitude);
```

- **Labels:** collocated physical sensor readings + authoritative ground stations (OpenAQ, NCEI, FLUXNET, AERONET) are the regression targets. Sensor.Community is treated as a *noisy prior* (low initial weight) and corrected by cross-validation, never trusted alone.
- **Versioning:** DVC tracks dataset snapshots; every `feature_vectors` row records `snapshot` for reproducibility.

---

## Phase B: Confidence Model (shared, first measurable win)

### B.1 Current gap

`trust-engine.js` is deterministic: `baseTrust*0.3 + freshness*0.2 + spatial*0.25 + historical*0.15 + calibration*0.1` with `historicalAccuracy` **hardcoded to 0.85** and static `baseTrust` per source type. It cannot express that accuracy varies by region, season, or site.

### B.2 Approach

1. **Quantile regression** (LightGBM/CatBoost) predicts value and the 10th/50th/90th percentiles from the feature vector.
2. **Conformal prediction** (split / jackknife+) calibrates the intervals on a held-out set so coverage is *guaranteed* (e.g. "true value is inside 90% of the time").
3. **Confidence score =** map of `{interval width, station density, freshness, cross-source agreement, historical CRPS}` → 0–100, written into the existing `sensor_confidence_scores` table so the API contract is unchanged.

### B.3 Success gate

Offline backtest (temporal-block CV) must show **strictly better CRPS and calibrated coverage** than the current heuristic on the same historical window before any code path switches to the AI.

---

## Phase C: Virtual Sensor & Forecast Models

### C.1 Spatial model (virtual sensors at unobserved points)

- **Graph model:** nodes = stations/sensors, edges = geospatial distance + measurement correlation. GNN (e.g. GraphSAGE) or a **Neural-Process** / learned Kriging estimator.
- This is the model that answers: *"What is the soil moisture at a farm plot with no sensor?"* → value + calibrated interval.
- Feeds `satellite-engine.js` virtual-sensor creation and `interpolatePixel`.

### C.2 Forecast model

- N-HiTS / PatchTST (or LightGBM recursive baseline first) for 1–7 day horizons on ET, soil moisture, irrigation demand, PM2.5.
- Outputs quantiles → prediction intervals → existing alert thresholds consume the upper/lower bands (e.g. "90% chance irrigation needed by Wednesday").

### C.3 Physics-informed prior

FAO-56 crop coefficients and soil water balance act as **teacher signals** for agriculture (especially with sparse ground truth), reducing the data-hunger of pure ML and keeping predictions physically plausible.

---

## Evaluation & Validation (the "trusted" contract)

- **No leakage:** temporal-block CV — never random splits.
- **Leave-locations-out:** hold out entire stations/sites → directly measures performance at *unobserved* sites (the virtual-sensor use case).
- **Metrics:** RMSE/MAE/MAPE (point), CRPS and interval coverage (probabilistic), reliability diagrams (calibration), PSI (drift).
- **Gates per phase:** a model only ships if it beats the current heuristic on every metric, evaluated on the evaluation harness, not a notebook.

---

## Deployment & Integration

- New **`pern-ai`** Python (FastAPI) service, one container in `docker-compose.yml`, trained offline (CPU-suitable for LightGBM phase).
- Endpoints:
  - `POST /v1/confidence` → `{ score, factors, interval, coverage }` (consumed by `trust-engine.js`)
  - `POST /v1/interpolate` → virtual sensor value + interval (`satellite-engine.js`)
  - `POST /v1/forecast` → quantiles + horizon (`analysis-engine.js`, alert-engine)
- **Graceful degradation:** all callers keep the heuristic fallback; AI failure never blocks the platform.
- **MLOps:** MLflow registry, weekly retrain job (node-cron + scheduled container), PSI drift monitors, freshness per source, alert when a source stops updating or license changes.
- ONNX export is a later optimization if Node-native inference is wanted; not required for v4.0.

---

## Roadmap

| Phase | Duration | Deliverables |
|---|---|---|
| **A — Data** | Wk 1–2 | Catalog + 10–12 adapters (Table above), feature store schema, ETL, license registry, backtest harness |
| **B — Confidence** | Wk 3–5 | LightGBM quantile + conformal calibration for both tracks; beats heuristic on backtest; API-compatible `confidence` endpoint |
| **C — Virtual + Forecast** | Wk 6–8 | Spatial GNN/Neural-Process interpolation; N-HiTS/PatchTST forecasts; FAO-56 physics priors; scale to hundreds–thousands of datasets |
| **D — Integration** | Wk 9–12 | Wire into trust/satellite/analysis engines, drift monitoring, Egypt grid deployment, evaluation report + docs |

Both tracks ship together; agriculture and air quality share the pipeline, MLOps, conformal calibration, and evaluation harness.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Licensing/citation misuse | License registry; only permissive OSS (CC-BY, ODbL, public domain); citation strings stored per source |
| Noisy ground truth (Sensor.Community) | Prior-weighted, cross-validated against authoritative stations |
| Concept drift (seasonality, sensor moves) | Weekly retrain + PSI alerts + freshness checks |
| Download/compute cost at scale | CDS/STAC/GEE subsetting; never full historical bulk locally |
| New Python footprint | Single container, CPU-friendly first, ONNX later |
| AI regression vs heuristic | Every ship must beat heuristic on evaluation harness; fallback always present |

---

## Open Decisions

1. Data volume budget for Phase A (subset to Nile Delta bbox + 3–5 years first, expand after).
2. GPU availability (not needed until GNN/N-HiTS scale-up in Phase C).
3. Whether the `pern-ai` repo lives in this monorepo (`pern-ai/`) or separate.
4. Target confidence surface: 0–100 score (current UI) vs. exposing interval bands to farmers first.
