# PERN v3.0 — Global Trusted Environmental Intelligence Platform

## Architecture & Implementation Plan

---

### Executive Summary

PERN v3.0 transforms from a local IoT monitoring dashboard into a **global environmental data fabric** — ingesting, verifying, standardizing, and redistributing environmental data from every major free and authoritative source. The system becomes the **trusted intermediary** between raw global data and actionable intelligence.

---

## Strategic Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PERN Global Data Fabric                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │  Satellite    │    │  Government  │    │  Citizen Science      │  │
│  │  (Sentinel)   │    │  (WAQI/OAQ)  │    │  (Sensor.Community)   │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬────────────┘  │
│         │                   │                        │               │
│         └───────────────────┼────────────────────────┘               │
│                             ▼                                       │
│              ┌─────────────────────────────┐                        │
│              │     Global Ingestion Bus    │                        │
│              │  (background workers,queue) │                        │
│              └─────────────┬───────────────┘                        │
│                            ▼                                        │
│              ┌─────────────────────────────┐                        │
│              │  Normalization & Validation  │                        │
│              │  Layer (unified schema)      │                        │
│              └─────────────┬───────────────┘                        │
│                            ▼                                        │
│              ┌─────────────────────────────┐                        │
│              │   Trust & Calibration Core  │                        │
│              │   (spatial cross-validation, │                        │
│              │    confidence scoring)       │                        │
│              └─────────────┬───────────────┘                        │
│                            ▼                                        │
│              ┌─────────────────────────────┐                        │
│              │    Unified Data Lake        │                        │
│              │  (PostgreSQL + timescale)   │                        │
│              └─────────────┬───────────────┘                        │
│                            ▼                                        │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │  Global   │ │   Geo-   │ │  Wind &  │ │  Public API &       │ │
│  │  Dashboard│ │ Compliance│ │Plume AI  │ │  Data Marketplace   │ │
│  └───────────┘ └──────────┘ └──────────┘ └──────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation & Data Infrastructure

### 1.1 Database Schema Extension

**New tables needed:**

| Table | Purpose | Key Columns |
|---|---|---|
| `global_data_sources` | Registry of all data sources (satellite, govt, citizen) | id, name, type, api_endpoint, country, active, last_fetch, confidence_weight, priority |
| `virtual_sensors` | Satellite-derived virtual sensors at GPS coordinates | id, source_type, latitude, longitude, grid_cell, parameters TEXT[], source_id, last_reading_at |
| `external_readings` | Normalized readings from all external APIs | id, source_type, source_id, virtual_sensor_id, timestamp, parameters JSONB, raw_response JSONB, data_quality NUMERIC |
| `sensor_confidence_scores` | Per-sensor trust scores | sensor_id, source_type, overall_score NUMERIC, freshness_score, spatial_consistency, calibration_status, last_evaluated_at |
| `compliance_frameworks` | Regional regulatory standards | id, country, region, authority, framework_name, pollutant, standard_value, averaging_period, effective_date |
| `wind_trajectories` | Forecast wind data at GPS points | id, latitude, longitude, altitude, wind_speed, wind_direction, forecast_horizon, forecasted_at |
| `plume_events` | Detected pollution transport events | id, source_lat, source_lon, pollutant, concentration, trajectory_path JSONB, affected_regions TEXT[], detected_at |

**Modified tables:**

| Table | New Columns |
|---|---|
| `sensor_readings` | Add `source_type` (physical/virtual/satellite/external), `data_quality_score` NUMERIC, `calibrated` BOOLEAN |
| `devices` | Add `source_type` (physical/virtual/satellite), `confidence_score` NUMERIC, `latitude`, `longitude`, `altitude`, `calibration_status` |
| `zones` | Add `country`, `compliance_framework` |
| `alerts` | Add `source_trace` TEXT[] (chain of provenance) |

### 1.2 New Dependencies

```json
{
  "node-fetch": "^3.3.2",     // (already installed)
  "node-cron": "^3.0.3",      // Scheduled background workers
  "redis": "^4.6.13",         // Caching layer for API responses
  "pg-copy-streams": "^6.2.1",// Bulk insert for high-volume data
  "geolib": "^3.3.4",         // GPS distance, bounding box calculations
  "compromise": "^14.10.0"    // NLP for region/location parsing
}
```

---

## Phase 2: Virtual Global Sensor System (Satellite IoT)

### 2.1 Sentinel-5P Integration Service

**File:** `pern-backend/services/satellite-engine.js`

**Architecture:**

```
┌──────────────────────────────────────────────┐
│              satellite-engine.js              │
├──────────────────────────────────────────────┤
│  - fetchSentinelData(lat, lng, date)          │
│  - createVirtualSensorFromPin(lat, lng)       │
│  - getVirtualSensor(sensorId)                 │
│  - listVirtualSensors(region?, type?)         │
│  - scheduleRegionalScan(bounds, interval)     │
│  - interpolatePixel(gridCell, parameters)     │
│  - transformToReading(virtualSensor, data)    │
└──────────────────────────────────────────────┘
```

**Data Flow:**
1. User drops a pin on the map → `POST /api/virtual-sensors` with lat/lng
2. Backend queries Sentinel-5P API (via `python-sentinel-5p` or direct `https://dataspace.copernicus.eu/api`)
3. Finds the nearest grid cell (0.01° × 0.01° resolution)
4. Extracts available parameters: NO₂, O₃, SO₂, CO, CH₄, HCHO, Aerosol Index
5. Stores as `virtual_sensor` record with GPS coordinates
6. Creates a `virtual_sensors` entry that streams data into the **same pipeline** as physical MQTT devices
7. Scheduled daily re-fetch for active virtual sensors

**API Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/virtual-sensors` | Create virtual sensor at GPS pin |
| GET | `/api/virtual-sensors` | List all virtual sensors (with filters) |
| GET | `/api/virtual-sensors/:id` | Get sensor metadata + latest reading |
| GET | `/api/virtual-sensors/:id/history` | Time-series satellite data |
| DELETE | `/api/virtual-sensors/:id` | Remove virtual sensor |
| POST | `/api/virtual-sensors/schedule` | Batch schedule regional scan |
| GET | `/api/virtual-sensors/coverage` | Show satellite coverage map |

### 2.2 Sentinel API Implementation Notes

- **API:** Copernicus Data Space Ecosystem (`https://dataspace.copernicus.eu`)
- **Product:** `L2__NO2___`, `L2__O3____`, `L2__SO2___`, `L2__CO____`, `L2__CH4___`
- **Resolution:** 3.5 × 7 km (NO₂), 7 × 7 km (others)
- **Auth:** OAuth2 client credentials (free registration)
- **Rate limits:** 10 requests/second (generous for single-instance)
- **Data format:** NetCDF/WRF (would need lightweight parser or use WMS/WCS endpoints)

**Simplified approach:** Use the **Harmonized API** or **WCS (Web Coverage Service)** endpoint for JSON responses instead of raw NetCDF files. Alternatively, use the **ESA Sentinel Hub** or **Microsoft Planetary Computer** as a caching layer.

### 2.3 Frontend — Virtual Global Sensor Mode

**New page:** `pern-frontend/src/pages/GlobalSensorMap.tsx`

- Map with OpenStreetMap tiles + satellite overlay option
- "Drop Pin" mode: user clicks anywhere on the map
- Shows available satellite parameters at that location
- Lists all active virtual sensors as markers
- Each marker shows: latest values, data freshness, source (Sentinel-5P)
- Sensor detail modal: time-series chart, raw API response, download option

**Integration points:**
- Add `/global-sensors` route in App.tsx with "Global" nav section
- Wire up to backend `GET /api/virtual-sensors/*`

---

## Phase 3: Global Data Lake Aggregator Engine

### 3.1 Background Worker Architecture

**File:** `pern-backend/services/global-ingestion.js`

**Architecture:**

```
┌──────────────────────────────────────────────┐
│              global-ingestion.js              │
├──────────────────────────────────────────────┤
│  Singleton background worker that:           │
│  - Maintains schedule registry (every N min) │
│  - Fetches from each source in parallel      │
│  - Normalizes to unified format              │
│  - Applies trust scoring (Phase 4)           │
│  - Stores in external_readings table         │
│  - Triggers alerts if values exceed WHO      │
│  - Publishes to MQTT bus for live dashboards │
└──────────────────────┬───────────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    ▼                  ▼                  ▼
WAQI API          Sentinel-5P        NASA FIRMS
(government       (satellite)        (fire data)
stations)
```

**Source Registry (in `global_data_sources` table):**

| Source | Type | Endpoint | Frequency | Priority |
|---|---|---|---|---|
| WAQI | govt | `https://api.waqi.info/feed/geo:{lat};{lng}/` | 15 min | 1 |
| OpenAQ | govt | `https://api.openaq.org/v2/latest` | 30 min | 1 |
| Sensor.Community | citizen | `https://api.sensor.community/v1/data` | 30 min | 3 |
| NASA FIRMS | satellite | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/` | 3 hours | 2 |
| Sentinel-5P | satellite | `https://dataspace.copernicus.eu/api` | 6 hours | 1 |

### 3.2 WAQI Integration

**File:** `pern-backend/services/sources/waqi-source.js`

- API key from WAQI (free tier: ~1000 requests/day)
- `fetchByGeo(lat, lng)` — nearest station to coordinates
- `fetchByCity(city)` — city-level AQI data
- `fetchByStation(stationId)` — specific station details
- Returns normalized: `{ pm25, pm10, o3, no2, so2, co, aqi, temperature, humidity, wind, pressure }`

**Rate limiting:** 1 request/second, queue-based with exponential backoff

### 3.3 OpenAQ Integration

**Rebuild** the existing frontend-only `openaq-service.ts` as a **backend service**:

- **File:** `pern-backend/services/sources/openaq-source.js`
- `fetchLatest(parameters, country)` — latest measurements
- `fetchByLocation(lat, lng, radius)` — nearest stations
- `fetchHistory(locationId, parameter, from, to)` — historical data
- Already well-documented in existing frontend code

### 3.4 Sensor.Community Integration

**Rebuild** the existing frontend-only `sensor-community-service.ts` as a **backend service**:

- **File:** `pern-backend/services/sources/sensor-community-source.js`
- Public API, no auth needed
- `fetchByBox(north, south, east, west)` — all sensors in bounding box
- `fetchBySensorType(type)` — filter by PM2.5/PM10/temp/humidity
- Data quality: citizen science → lower default trust score

### 3.5 NASA FIRMS / MODIS Integration

**File:** `pern-backend/services/sources/nasa-firms-source.js`

- **API:** `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{coords}/{days}`
- Sources: VIIRS S-NPP, VIIRS NOAA-20, MODIS Aqua/Terra
- Returns: latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite, confidence, version, bright_t31, frp, daynight
- **Storage:** `external_readings` with `source_type = 'nasa_firms'`, parameters include `{ frp, brightness, confidence }`
- **Use case:** Detect wildfire / biomass burning events for plume tracking (Phase 6)

### 3.6 Unified Normalization Layer

**File:** `pern-backend/services/data-normalizer.js`

Every external source is normalized into this standard schema:

```javascript
{
  source_type: 'waqi' | 'openaq' | 'sensor_community' | 'nasa_firms' | 'sentinel_5p',
  source_id: 'unique identifier from source',
  latitude: 30.0444,
  longitude: 31.2357,
  timestamp: 2026-07-28T12:00:00Z,
  parameters: {
    pm25: { value: 45.2, unit: 'µg/m³' },
    pm10: { value: 78.1, unit: 'µg/m³' },
    no2: { value: 32.5, unit: 'ppb' },
    // ... each parameter has value + unit + optional quality flag
  },
  raw_response: { /* original API response for audit trail */ },
  source_quality: 0.85,  // Source-level quality score (0-1)
}
```

---

## Phase 4: Trust & Calibration Algorithm

### 4.1 Spatial Cross-Validation Engine

**File:** `pern-backend/services/trust-engine.js`

**Algorithm:**

```javascript
// For each incoming reading from a low-trust source:
// 1. Find all nearby trusted sources within radius R (1km for city, 50km for satellite)
// 2. For each parameter P:
//    a. Get readings from all nearby trusted sources within time window T (1 hour)
//    b. Compute weighted average of trusted values (weighted by trust score of each source)
//    c. Compare incoming reading to trusted average
//    d. If deviation > threshold (configurable per parameter): flag as anomalous
// 3. Compute overall confidence score:
//    score = f(source_weight, freshness, spatial_density, historical_accuracy, deviation)
// 4. Update sensor_confidence_scores table
// 5. Exclude readings below confidence threshold from global analytics
```

**Trust source hierarchy (by source_type):**

| Source Type | Base Trust | Decay Rate | Cross-Validate Against |
|---|---|---|---|
| `physical` (PERN-owned) | 0.95 | slow | Satellite, nearby govt |
| `sentinel_5p` (satellite) | 0.90 | medium | Ground stations (WAQI/OAQ) |
| `waqi` (government) | 0.85 | slow | Satellite, other govt |
| `openaq` (government aggregated) | 0.80 | slow | WAQI, satellite |
| `nasa_firms` (satellite) | 0.80 | medium | Ground PM sensors |
| `sensor_community` (citizen) | 0.50 | fast | Govt, satellite |
| `virtual` (PERN sim) | 0.60 | N/A | N/A (labelled as simulated) |

### 4.2 Confidence Score Formula

```
score = (base_trust × 0.3) + 
        (freshness_factor × 0.2) +
        (spatial_consistency × 0.25) + 
        (historical_accuracy × 0.15) +
        (calibration_status × 0.1)
```

- **freshness_factor** = exp(-hours_since_last_reading / 24)
- **spatial_consistency** = 1 - normalized_deviation_from_trusted_neighbors
- **historical_accuracy** = rolling 7-day accuracy vs. nearest trusted source
- **calibration_status** = 1.0 if verified recently, 0.5 if unverified, 0.0 if known faulty

### 4.3 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/trust/scores` | List all sensor confidence scores |
| GET | `/api/trust/scores/:sensorId` | Specific sensor score breakdown |
| POST | `/api/trust/recalibrate` | Trigger manual recalibration run |
| GET | `/api/trust/anomalies` | List flagged anomalous readings |
| POST | `/api/trust/override/:sensorId` | Admin override of trust score |

---

## Phase 5: Geo-Aware Compliance Engine

### 5.1 Compliance Framework Database

**File:** `pern-backend/services/compliance-engine.js`

**Data structure** (seeded in `compliance_frameworks` table):

```javascript
{
  country: 'EG',        // ISO 3166-1 alpha-2
  region: null,         // null = national
  authority: 'EEAA',    // Egyptian Environmental Affairs Agency
  framework: 'Law 4/1994',
  parameters: {
    pm25: { threshold: 70, unit: 'µg/m³', averaging: '24h', legal_limit: true },
    pm10: { threshold: 150, unit: 'µg/m³', averaging: '24h', legal_limit: true },
    no2: { threshold: 80, unit: 'ppb', averaging: '1h', legal_limit: true },
    // ...
  },
  ehi_calculator: 'WHO_WEIGHTED', // Which EHI formula to use
}
```

**Pre-seeded frameworks (minimum 20 countries):**
- **Egypt** — EEAA Law 4/1994 (already partially in docs)
- **USA** — EPA NAAQS
- **EU/EEA** — EU Ambient Air Quality Directives (2008/50/EC)
- **UK** — Environment Act 2021
- **India** — CPCB NAAQS
- **China** — China NAAQS (GB 3095-2012)
- **Australia** — NEPM AAQ
- **Japan** — MOE standards
- **Canada** — CCME AAQS / AQHI
- **Brazil** — CONAMA Resolution 491/2018
- **South Africa** — NEM:AQA
- **Mexico** — NOM-025-SSA1-2021
- **Russia** — GN 2.1.6.3492-17
- **Saudi Arabia** — PME standards
- **UAE** — UAE Cabinet Resolution
- **Singapore** — NEA targets
- **South Korea** — MOE standards
- **Nigeria** — NESREA regulations
- **Argentina** — Law 20284
- **Indonesia** — PP 41/1999 + ISPU

### 5.2 Reverse Geo-Coding

**Approach:** Use a **local geocoding database** (free, no external API calls):
- `node-maxmind` or a bundled GeoLite2 City database for IP → country
- For GPS coordinates: use a lightweight bounding-box lookup against country polygons
- Fallback: free Nominatim API (limited to 1 req/sec)

**Flow:**
1. User creates organization or registers device with GPS coordinates
2. `compliance-engine.js` reverse-geocodes to determine country
3. Loads the appropriate `compliance_framework` for that country
4. Dashboard thresholds auto-switch to match local regulatory limits
5. PDF compliance reports use local framework language/references
6. EHI calculation weights adjust per regional formula

### 5.3 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/compliance/frameworks` | List all supported frameworks |
| GET | `/api/compliance/frameworks/:country` | Get framework by country code |
| POST | `/api/compliance/detect` | Suggest framework for GPS coordinates |
| GET | `/api/compliance/report/:deviceId` | Generate regulatory compliance report PDF |
| GET | `/api/compliance/status/:orgId` | Org-wide compliance status dashboard |

### 5.4 Frontend — Compliance Report Generator

- New page: `ComplianceReports.tsx` or extend existing `Compliance.tsx`
- Select organization → auto-detect country/region
- Shows applicable legal limits vs. actual readings
- Generate downloadable PDF compliance report
- Color-coded: green (compliant) / amber (approaching limit) / red (exceeded)

---

## Phase 6: Global Wind & Pollution Trajectory AI

### 6.1 Wind Data Integration

**File:** `pern-backend/services/wind-engine.js`

**Source:** Open-Meteo Weather API (free, no API key, 10,000 requests/day)
- `https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y&hourly=windspeed_10m,winddirection_10m,temperature_2m`

**Architecture:**

```
┌──────────────────────────────────────────────┐
│                 wind-engine.js                │
├──────────────────────────────────────────────┤
│  - fetchForecast(lat, lng)                    │
│  - getStoredTrajectories(region, hours)       │
│  - calculatePlumePath(origin, pollutant, dir) │
│  - findUpstreamSensors(lat, lng, radius, dir) │
│  - predictDownwindImpact(source, forecast)    │
│  - detectPlumeEvents()                        │
└──────────────────────────────────────────────┘
```

### 6.2 Plume Trajectory Algorithm

```javascript
function calculatePlumePath(originLat, originLng, windSpeed, windDirection, hours) {
  // Use simple forward trajectory model:
  // For each hour into the future:
  //   - Update position based on wind vector
  //   - Apply Gaussian dispersion (concentration spreads)
  //   - Check which regions/cities fall within plume
  //   - Return as GeoJSON LineString with concentration polygons
}
```

### 6.3 Integration with AI Engine

**Extend** the existing `AI Service` (OpenRouter/LLaMA) with:

1. **New tool:** `get_wind_trajectory(lat, lng)` — returns wind forecast + plume path
2. **New tool:** `get_upstream_sources(lat, lng)` — identifies pollution origin
3. **New tool:** `get_downwind_impact(sourceLat, sourceLng, pollutant)` — predicts affected areas

**AI Prompt context injection:**

```
When user asks about air quality in a location:
1. Fetch wind trajectory data for that location
2. Check upstream sensors for pollution sources
3. Cross-reference with NASA FIRMS for active fires
4. Return: "The PM2.5 in New York (AQI 156) is primarily caused by wildfires in Quebec, 
   Canada. Northwest wind at 25 km/h is carrying smoke directly into the region. 
   Conditions expected to improve in 48 hours when wind shifts eastward."
```

### 6.4 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/wind/forecast` | Wind forecast at coordinates |
| GET | `/api/wind/trajectory` | Plume trajectory calculation |
| GET | `/api/wind/upstream` | Find upstream pollution sources |
| GET | `/api/wind/downwind` | Predict downwind affected areas |
| GET | `/api/wind/plume-events` | Active detected plume events |

---

## Phase 7: Global Public API & Data Marketplace

### 7.1 Public API Gateway

**File:** `pern-backend/services/public-api.js`

**Architecture:**

- Rate-limited public endpoints (separate from internal /api)
- API key registration system (`global_api_keys` table)
- Tiered access:
  - **Free (researchers):** 1,000 req/day, 24h delayed data
  - **Starter:** 10,000 req/day, 1h delayed, single region
  - **Enterprise:** Unlimited, real-time, global, SLA

### 7.2 API Endpoints (Public)

| Method | Path | Purpose |
|---|---|---|
| GET | `/public/v1/health` | API status |
| GET | `/public/v1/air-quality` | Nearest AQI to coordinates |
| GET | `/public/v1/air-quality/history` | Historical AQI time-series |
| GET | `/public/v1/sensors` | Discover sensors in region |
| GET | `/public/v1/sensors/:id` | Specific sensor data |
| GET | `/public/v1/satellite` | Satellite-derived data at coordinates |
| GET | `/public/v1/regions/:country/standards` | Compliance framework |
| GET | `/public/v1/fires/active` | Active fire detections |
| GET | `/public/v1/plume-events` | Active pollution transport events |
| POST | `/public/v1/register` | Register for API key |

### 7.3 Data Provenance & Attribution

Every public API response includes a `provenance` field:

```json
{
  "provenance": {
    "sources": ["sentinel_5p", "waqi", "sensor_community"],
    "confidence_score": 0.87,
    "last_calibrated": "2026-07-27T18:00:00Z",
    "method": "spatial_cross_validation_v1",
    "attribution": "Contains modified Copernicus Sentinel data 2026"
  }
}
```

### 7.4 Frontend — API Console / Documentation

- New page: `ApiConsole.tsx` at `/api-console`
- Interactive API explorer (like Swagger UI but custom)
- API key management (generate, revoke, usage stats)
- Live code examples (curl, Python, JavaScript, R)
- Data attribution generator

---

## Implementation Phasing & Effort Estimate

### Phase A — Core Infrastructure (Week 1-2)
| Feature | Files | Effort |
|---|---|---|
| DB schema extension | `db.js` | 4h |
| Global ingestion framework + scheduler | `global-ingestion.js` | 8h |
| WAQI integration | `sources/waqi-source.js` | 4h |
| OpenAQ backend integration | `sources/openaq-source.js` | 3h |
| NASA FIRMS integration | `sources/nasa-firms-source.js` | 3h |
| Data normalizer | `data-normalizer.js` | 3h |
| Data source registry management | Route + service | 3h |

### Phase B — Trust & Calibration (Week 2-3)
| Feature | Files | Effort |
|---|---|---|
| Trust engine (spatial cross-validation) | `trust-engine.js` | 8h |
| Confidence score algorithm | (in trust-engine.js) | 4h |
| Anomaly detection + flagging | (in trust-engine.js) | 4h |
| Trust score API routes | `routes/trust.js` | 3h |
| Frontend trust dashboard | `TrustDashboard.tsx` | 6h |

### Phase C — Satellite & Global Sensors (Week 3-4)
| Feature | Files | Effort |
|---|---|---|
| Sentinel-5P integration | `satellite-engine.js` | 12h |
| Virtual sensor CRUD | `routes/virtual-sensors.js` | 4h |
| Frontend global sensor map | `GlobalSensorMap.tsx` | 10h |
| Satellite data MQTT bridge | (in satellite-engine.js) | 3h |

### Phase D — Geo-Compliance (Week 4-5)
| Feature | Files | Effort |
|---|---|---|
| Compliance frameworks DB seeding | `data/compliance-frameworks.json` | 6h |
| Compliance engine | `compliance-engine.js` | 6h |
| Reverse geocoding | (in compliance-engine.js) | 4h |
| Compliance API routes | `routes/compliance.js` | 3h |
| Frontend compliance dashboard | `ComplianceReports.tsx` | 8h |

### Phase E — Wind & Plume AI (Week 5-6)
| Feature | Files | Effort |
|---|---|---|
| Open-Meteo wind integration | `wind-engine.js` | 4h |
| Plume trajectory algorithm | (in wind-engine.js) | 8h |
| AI tool integration (upstream/downwind) | Extend `ai-service.js` | 4h |
| Wind/plume API routes | `routes/wind.js` | 3h |
| Frontend plume visualization | `PlumeMap.tsx` | 8h |

### Phase F — Public API (Week 6-7)
| Feature | Files | Effort |
|---|---|---|
| Public API gateway + rate limiting | `public-api.js` + middleware | 6h |
| API key management system | `routes/api-keys.js` + tables | 4h |
| All public endpoints | `routes/public/*.js` | 8h |
| Frontend API console | `ApiConsole.tsx` | 8h |

---

## Total Estimated Effort: ~170 hours (4-5 weeks full-time)

---

## Key Design Decisions

### 1. Queue-Based Ingestion
Instead of blocking on API calls, use an **in-memory job queue** (or Redis-backed for persistence). Each source type has its own worker with configurable concurrency:
- WAQI: 1 req/sec
- OpenAQ: 2 req/sec
- NASA FIRMS: 1 req/10sec
- Sentinel-5P: 1 req/2sec

### 2. MQTT Bridge for External Data
Normalized external readings get **published to MQTT** under a reserved topic prefix:
`pern/external/{source_type}/{sensor_id}/data`

This means the existing dashboard, automation engine, and alert system process external data **identically** to physical sensor data.

### 3. Caching Strategy
- **External API responses:** Redis TTL = source refresh interval
- **Wind trajectories:** Redis TTL = 1 hour (forecast updates hourly)
- **Compliance frameworks:** In-memory cache, invalidated on DB update
- **Trust scores:** Computed every 15 min, cached in Redis + DB

### 4. Data Retention
- Raw external readings: 90 days
- Aggregated (hourly/daily/weekly): 2 years
- Confidence scores: 30 days (recomputed, not stored permanently)
- Compliance reports: stored as generated PDFs indefinitely
- Wind trajectories: 7 days (forecast data becomes obsolete)

### 5. Attribution & Licensing
All aggregated data must preserve source attribution:
- **Copernicus Sentinel data:** "Contains modified Copernicus Sentinel data [year]"
- **WAQI:** "Powered by WAQI — worldaqi.org"
- **NASA FIRMS:** "NASA FIRMS — firms.modaps.eosdis.nasa.gov"
- **OpenAQ:** "Data from OpenAQ — openaq.org"
- **Sensor.Community:** "Data from sensor.community"

---

## Existing Code That Can Be Repurposed

| Existing Code | Reuse For |
|---|---|
| `pern-frontend/src/lib/openaq-service.ts` | Backend OpenAQ source (port logic) |
| `pern-frontend/src/lib/sensor-community-service.ts` | Backend Sensor.Community source (port logic) |
| `pern-frontend/src/lib/confidence-scoring.ts` | Backend trust engine algorithm reference |
| `pern-frontend/src/lib/validation-service.ts` | Cross-validation logic reference |
| `pern-backend/services/automation-engine.js` | Pattern for background worker architecture |
| `pern-backend/services/data-aggregator.js` | Pattern for scheduled processing |
| `pern-backend/db.js` | DB access pattern (extend, not replace) |
| `pern-frontend/src/lib/data-provider.tsx` | Extend to include external data streams |
| `pern-frontend/src/lib/api-client.ts` | No change needed (works with any REST API) |

---

## Frontend Navigation Changes (App.tsx)

```
Global (new section)
  ├── Global Sensor Map    → /global-sensors
  ├── Data Sources         → /data-sources
  └── Public API Console   → /api-console

Analysis (extend existing section)
  ├── Compliance           → /compliance (enhanced)
  ├── Vulnerable Groups    → /vulnerable
  ├── Zones                → /zones
  ├── Trust & Calibration  → /trust-dashboard
  └── Plume Tracker        → /plume-map

Tools (extend existing section)
  ├── Reports              → /reports
  ├── Weather              → /weather
  ├── AI Assistant         → /chatbot
  └── Global Data Explorer → /global-data (new)
```

---

This plan is designed to be implemented incrementally — each phase delivers standalone value. Phase A (Data Lake) alone would already make PERN a powerful environmental data hub. Subsequent phases add competitive moats: trust, global coverage, regulatory intelligence, AI-driven insights, and a monetizable public API.
