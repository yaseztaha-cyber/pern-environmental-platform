# Changelog

All notable changes to the PERN (Pollution & Environmental Risk Navigator) project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-08-03

### Added — Reliability & Global Data

#### Phase 1 — Reliability Hardening
- Rewrote the notification dispatcher with channel health tracking, delivery guarantees, and in-memory dispatch logging.
- Removed the legacy mock device-health endpoint in favor of real per-channel telemetry.
- Added HTTP adapter command push (config + OTA) for non-MQTT transports.
- Reworked the AI analysis pipeline with a hardened `llm-client` (timeouts, JSON-mode recovery, cache).
- Introduced a uniform error handler and global 404 handler.
- Added auth/session UX: single-flight token refresh in `api-client.ts`, `pern-auth-expired` CustomEvent, and an `auth-context` listener that redirects on session expiry.
- Reduced oxlint warnings from 88 to 0.

#### Phase 2 — Global Data Fabric
- Added 7 global data-fabric tables plus `global_api_keys` and indexes/unique constraints in `db.js`.
- Added real HTTP source adapters (with simulated fallbacks when API keys are absent):
  - WAQI (`services/sources/waqi-source.js`)
  - OpenAQ (`services/sources/openaq-source.js`)
  - Sensor.Community (`services/sources/sensor-community-source.js`)
  - NASA FIRMS (`services/sources/nasa-firms-source.js`)
- Added the data normalizer (`services/data-normalizer.js`) with a standard schema and DB-row mapping.
- Rewrote `services/global-ingestion.js`: source adapters, DB persistence, MQTT publishing (`pern/global/{type}/data`), and cron scheduling.
- Added the trust engine (`services/trust-engine.js`) that computes and persists `sensor_confidence_scores`.
- Added the wind engine (`services/wind-engine.js`) using the real Open-Meteo forecast API; persists `wind_trajectories` and saves `plume_events`.
- Added the public API gateway (`services/public-api.js`, SHA-256 keys, quota tiers, provenance) with `routes/public.js` (`/public/v1`) and `routes/api-keys.js` (`/api/keys`).
- Server boot now starts ingestion and compliance-framework seeding unless `ENABLE_INGESTION === 'false'`.

#### Phase 3 — Reliability & Global Data Extensions
- **3a Notification Center UI**: three-tab page (channels / preferences / history) with channel status cards, a test-send composer, preference toggles, and a dispatch-log table. Backend gains `GET /api/notifications/status`, `GET /api/notifications/log`, and preference CRUD.
- **3b Real Sentinel-5P**: `services/satellite-engine.js` and `services/sources/sentinel5p-source.js` now fetch real CAMS reanalysis data from the Open-Meteo Air Quality API (keyless, hourly `no2`, `o3`, `so2`, `co`, `ch4`, `pm2_5`), with simulated fallback when offline. Coverage metadata now reports CAMS resolution (`0.25 deg x 0.25 deg`).
- **3c Data Retention**: added `db.runRetention()` (whitelisted tables, safe DELETE window) and extended `services/data-retention.js` to run the v3.1 global retention policy hourly: raw external readings 90 days, confidence scores 30 days, wind trajectories 7 days, plume events 90 days. Compliance PDFs are retained indefinitely.
- **3d PWA**: offline-ready service worker (`public/sw.js`) with precache + runtime cache, install/activate lifecycle, manifest, theme color, and iOS web-app meta tags.
- **3e i18n EN/AR**: full English and Arabic dictionaries (302 keys each, parity enforced), RTL/LTR document direction sync, browser-locale detection, and persistent locale selection.
- **3f Research export**: CSV export endpoints (`/api/export/readings/csv`, `/api/export/alerts/csv`) plus client-side CSV and jsPDF report export in the Reports page.

### Changed
- `node-cron@^3.0.3` added to the backend for ingestion scheduling.
- Sentinel-5P simulation units now `ug/m3` (previously `ppb`); `fetched_at`/`model` recorded from source metadata.

### Fixed
- Open-Meteo hourly timestamps are naive `YYYY-MM-DDTHH:MM`; all parsing now appends `:00Z` to avoid invalid timestamps.
- Timing-sensitive ban test in `security-middleware.test.js` stabilized.

### Test Coverage
- Backend: 10 test files / 222 tests green (up from 153 → 172 → 207 → 219 → 222).
- Frontend: typecheck clean, oxlint 0 warnings/errors, 4 test files / 38 tests passing, production build succeeds.

## [3.0.0] - 2026-07
- Baseline PERN v3.0 release: IoT ingestion, device management, AI engine, automation, alerts, compliance, virtual sensors, global data fabric foundations.

## [2.x] - 2026
- Legacy PERN v2 releases (monitoring, analytics, device lifecycle, protocols).

---

PERN — Pollution & Environmental Risk Navigator. Authored by **Yassen Taha Hussainy Elnasher**. All rights reserved (`UNLICENSED`).
