/**
 * PERN v4.0 — Feature Vector ETL
 * Builds aligned (location × time) feature vectors for the AI engine from
 * trusted external adapters and persists them to the feature_vectors table.
 * Target labels (ground truth) are attached later by label-extraction.
 */
const logger = require('../utils/logger');
const db = require('../db');
const power = require('./sources/power-source');
const openaq = require('./sources/openaq-source');
const cams = require('./sources/cams-source');
const openMeteo = require('./sources/open-meteo-source');

const NILE_DELTA_BBOX = { minLat: 29.5, maxLat: 31.8, minLng: 29.7, maxLng: 32.5 };
const DEFAULT_STEP = 0.5;

const SOURCE_TRUST = { power: 0.90, openaq: 0.80, 'open-meteo': 0.80, cams: 0.85 };

function gridPoints(bbox = NILE_DELTA_BBOX, step = DEFAULT_STEP) {
  const points = [];
  for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += step) {
    for (let lng = bbox.minLng; lng <= bbox.maxLng; lng += step) {
      points.push([Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000]);
    }
  }
  return points;
}

function buildFeatureVector({ sample, featureGroup, sourceId, snapshot }) {
  const ts = sample.timestamp ? new Date(sample.timestamp) : new Date();
  const features = {};
  for (const [key, value] of Object.entries(sample || {})) {
    if (['latitude', 'longitude', 'timestamp'].includes(key)) continue;
    const n = parseFloat(value);
    if (Number.isFinite(n)) features[key] = Math.round(n * 100) / 100;
  }
  const month = ts.getUTCMonth() + 1;
  const dayOfYear = Math.floor(
    (ts.getTime() - Date.UTC(ts.getUTCFullYear(), 0, 0)) / 86400000
  );
  features.month = month;
  features.day_of_year = dayOfYear;
  features.day_of_week = ts.getUTCDay();

  return {
    feature_group: featureGroup,
    latitude: sample.latitude,
    longitude: sample.longitude,
    ts: ts.toISOString(),
    source_id: sourceId,
    snapshot: snapshot || 'local',
    features,
    target: null,
    quality: SOURCE_TRUST[sourceId] ?? 0.5,
    provenance: [sourceId],
  };
}

async function runFeatureEtl(options = {}) {
  const bbox = options.bbox || NILE_DELTA_BBOX;
  const step = options.step || DEFAULT_STEP;
  const snapshot = options.snapshot || `etl-${new Date().toISOString().slice(0, 10)}`;
  const points = options.points || gridPoints(bbox, step);
  let written = 0;
  const failures = [];

  for (const [lat, lng] of points) {
    try {
      const ag = await power.fetchByGeo(lat, lng);
      const agRow = buildFeatureVector({ sample: { ...ag, latitude: lat, longitude: lng }, featureGroup: 'agriculture', sourceId: 'power', snapshot });
      await db.saveFeatureVector(agRow);
      written++;

      const air = await openaq.fetchByLocation(lat, lng, 50);
      const airRow = buildFeatureVector({ sample: { ...air, latitude: lat, longitude: lng }, featureGroup: 'air', sourceId: 'openaq', snapshot });
      await db.saveFeatureVector(airRow);
      written++;

      const camsAir = await cams.fetchByLocation(lat, lng);
      const camsRow = buildFeatureVector({ sample: { ...camsAir, latitude: lat, longitude: lng }, featureGroup: 'air', sourceId: 'cams', snapshot });
      await db.saveFeatureVector(camsRow);
      written++;

      const nwp = await openMeteo.fetchByGeo(lat, lng);
      const nwpRow = buildFeatureVector({ sample: { ...nwp, latitude: lat, longitude: lng }, featureGroup: 'nwp', sourceId: 'open-meteo', snapshot });
      await db.saveFeatureVector(nwpRow);
      written++;
    } catch (err) {
      failures.push({ lat, lng, error: err.message });
    }
  }

  logger.info('[FeatureETL] run complete', { points: points.length, written, failures: failures.length });
  return {
    timestamp: new Date().toISOString(),
    points: points.length,
    written,
    failures,
    snapshot,
  };
}

module.exports = {
  NILE_DELTA_BBOX,
  gridPoints,
  buildFeatureVector,
  runFeatureEtl,
};
