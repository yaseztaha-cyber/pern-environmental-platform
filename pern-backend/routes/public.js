/**
 * PERN v3 — Public API Routes
 * /public/v1/* — rate-limited, API-key-gated, with provenance metadata.
 */
const express = require('express');
const router = express.Router();
const publicApi = require('../services/public-api');
const globalIngestion = require('../services/global-ingestion');
const complianceEngine = require('../services/compliance-engine');
const windEngine = require('../services/wind-engine');
const satelliteEngine = require('../services/satellite-engine');
const createRateLimiter = require('../middleware/rate-limiter');

const publicLimiter = createRateLimiter(60000, 60);

async function requireApiKey(req, res, next) {
  const rawKey = req.headers['x-api-key'] || req.query.api_key;
  const auth = await publicApi.authenticate(rawKey);
  if (!auth) return res.status(401).json({ error: 'Invalid or missing API key', hint: 'Register at POST /public/v1/register' });
  if (auth.error === 'quota_exceeded') return res.status(429).json({ error: 'Daily quota exceeded for this API key' });
  req.apiKeyTier = auth.tier;
  req.apiKeyName = auth.name;
  next();
}

router.get('/health', publicLimiter, (req, res) => {
  res.json({ status: 'ok', service: 'pern-public-api', version: 'v1', time: new Date().toISOString() });
});

router.post('/register', publicLimiter, async (req, res) => {
  const { name, email, tier } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = await publicApi.register({ name, email, tier });
  res.status(201).json(result);
});

router.get('/air-quality', publicLimiter, requireApiKey, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return res.status(400).json({ error: 'lat and lng query params required' });
  const result = await globalIngestion.runGlobalScan(lat, lng);
  const reading = result.readings?.[0] || null;
  const sources = (result.readings || []).map(r => r.source_type);
  res.json(publicApi.withProvenance({
    coordinates: { latitude: lat, longitude: lng },
    reading,
    generated_at: new Date().toISOString(),
  }, sources, 0.87));
});

router.get('/air-quality/history', publicLimiter, requireApiKey, (req, res) => {
  const source = req.query.source;
  const readings = globalIngestion.getStoredReadings(source, parseInt(req.query.limit) || 50);
  res.json(publicApi.withProvenance({ readings, count: readings.length }, [source || 'waqi', 'openaq'], 0.8));
});

router.get('/sensors', publicLimiter, requireApiKey, (req, res) => {
  const sensors = satelliteEngine.listVirtualSensors(req.query.region, req.query.type);
  res.json(publicApi.withProvenance({ sensors, count: sensors.length }, ['sentinel_5p'], 0.9));
});

router.get('/satellite', publicLimiter, requireApiKey, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return res.status(400).json({ error: 'lat and lng query params required' });
  const data = await satelliteEngine.fetchSentinelData(lat, lng);
  res.json(publicApi.withProvenance({ coordinates: { lat, lng }, data }, ['sentinel_5p'], 0.9));
});

router.get('/regions/:country/standards', publicLimiter, requireApiKey, (req, res) => {
  const framework = complianceEngine.getFramework(req.params.country);
  if (!framework) return res.status(404).json({ error: 'No framework for country' });
  res.json(publicApi.withProvenance({ country_code: req.params.country.toUpperCase(), ...framework }, ['waqi', 'openaq'], 0.85));
});

router.get('/fires/active', publicLimiter, requireApiKey, (req, res) => {
  const events = globalIngestion.getStoredReadings('nasa_firms', parseInt(req.query.limit) || 20);
  res.json(publicApi.withProvenance({ fires: events, count: events.length }, ['nasa_firms'], 0.8));
});

router.get('/plume-events', publicLimiter, requireApiKey, (req, res) => {
  res.json(publicApi.withProvenance({ events: windEngine.getPlumeEvents() }, ['sentinel_5p', 'nasa_firms'], 0.82));
});

module.exports = router;
