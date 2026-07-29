/** PERN v3 — Global Intelligence Routes */
const express = require('express');
const router = express.Router();
const satelliteEngine = require('../services/satellite-engine');
const globalIngestion = require('../services/global-ingestion');
const trustEngine = require('../services/trust-engine');
const complianceEngine = require('../services/compliance-engine');
const windEngine = require('../services/wind-engine');

// ── Satellite / Virtual Sensors ──
router.post('/virtual-sensors', (req, res) => {
  const { lat, lng, name } = req.body;
  if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'lat and lng required' });
  satelliteEngine.createVirtualSensor(lat, lng, name).then(sensor => res.status(201).json(sensor));
});
router.get('/virtual-sensors', (req, res) => {
  res.json(satelliteEngine.listVirtualSensors(req.query.region, req.query.type));
});
router.get('/virtual-sensors/:id', (req, res) => {
  const s = satelliteEngine.getVirtualSensor(req.params.id);
  s ? res.json(s) : res.status(404).json({ error: 'Not found' });
});
router.delete('/virtual-sensors/:id', (req, res) => {
  res.json({ deleted: true, id: req.params.id });
});
router.post('/virtual-sensors/schedule', (req, res) => {
  satelliteEngine.scheduleRegionalScan(req.body.bounds, req.body.interval).then(r => res.json(r));
});
router.get('/virtual-sensors/coverage', (req, res) => {
  res.json(satelliteEngine.getCoverage());
});

// ── Global Ingestion ──
router.get('/ingestion/sources', (req, res) => {
  res.json(globalIngestion.listSources(req.query.active === 'true'));
});
router.post('/ingestion/scan', (req, res) => {
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'lat and lng required' });
  globalIngestion.runGlobalScan(lat, lng).then(r => res.json(r));
});
router.get('/ingestion/readings', (req, res) => {
  res.json(globalIngestion.getStoredReadings(req.query.source, parseInt(req.query.limit) || 100));
});
router.get('/ingestion/stats', (req, res) => {
  res.json(globalIngestion.getStats());
});

// ── Trust & Calibration ──
router.get('/trust/scores', (req, res) => res.json(trustEngine.getAllScores()));
router.get('/trust/scores/:sourceType', (req, res) => {
  const s = trustEngine.getScore(req.params.sourceType);
  s ? res.json(s) : res.status(404).json({ error: 'No score for source type' });
});
router.get('/trust/anomalies', (req, res) => res.json(trustEngine.getAnomalies(parseInt(req.query.limit) || 50)));
router.post('/trust/recalibrate', (req, res) => res.json(trustEngine.recalibrate(req.body.readings || [])));

// ── Geo-Compliance ──
router.get('/compliance/frameworks', (req, res) => res.json(complianceEngine.listFrameworks()));
router.get('/compliance/frameworks/:country', (req, res) => {
  const fw = complianceEngine.getFramework(req.params.country);
  fw ? res.json(fw) : res.status(404).json({ error: 'Framework not found' });
});
router.post('/compliance/detect', (req, res) => {
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'lat and lng required' });
  const country = complianceEngine.detectCountry(lat, lng);
  res.json({ country_code: country, framework: complianceEngine.getFramework(country) });
});
router.post('/compliance/report', (req, res) => {
  const { orgId, lat, lng, readings } = req.body;
  res.json(complianceEngine.generateReport(orgId || 'default', lat || 30, lng || 31, readings || {}));
});
router.get('/compliance/check/:country', (req, res) => {
  const readings = req.query;
  res.json(complianceEngine.checkCompliance(req.params.country, readings));
});
router.get('/compliance/history', (req, res) => {
  res.json(complianceEngine.getHistory(parseInt(req.query.limit) || 50, req.query.country));
});
router.get('/compliance/trends', (req, res) => {
  res.json(complianceEngine.getTrends(req.query.country, parseInt(req.query.days) || 7));
});
router.get('/compliance/stats', (req, res) => {
  res.json(complianceEngine.getStats());
});

// ── Wind & Plume ──
router.get('/wind/forecast', (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng query params required' });
  windEngine.fetchForecast(parseFloat(lat), parseFloat(lng)).then(d => res.json(d));
});
router.get('/wind/trajectory', (req, res) => {
  const { lat, lng, pollutant, hours } = req.query;
  res.json(windEngine.calculatePlumePath(parseFloat(lat || 30), parseFloat(lng || 31), pollutant, parseInt(hours) || 24));
});
router.get('/wind/upstream', (req, res) => {
  const { lat, lng, radius } = req.query;
  res.json(windEngine.findUpstreamSources(parseFloat(lat || 30), parseFloat(lng || 31), parseFloat(radius) || 50));
});
router.get('/wind/downwind', (req, res) => {
  const { lat, lng, pollutant } = req.query;
  res.json(windEngine.predictDownwindImpact(parseFloat(lat || 30), parseFloat(lng || 31), pollutant));
});
router.get('/wind/plume-events', (req, res) => res.json(windEngine.getPlumeEvents()));

module.exports = router;
