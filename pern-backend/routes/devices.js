/**
 * Devices Routes — device CRUD and metadata
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const rateLimiter = require('../middleware/rate-limiter');
const limiter = rateLimiter(60000, 60);

// Static routes MUST come before /:id to avoid shadowing
router.get('/locations/all', async (req, res) => {
  try {
    const devices = await db.getDevices();
    const locations = [];
    for (const d of devices) {
      const meta = await db.getDeviceMetadata(d.id);
      let lat = meta?.location_lat || null;
      let lng = meta?.location_lng || null;

      // If no explicit coordinates, try to get latest sensor reading for context
      let latestReading = null;
      try {
        const readings = await db.getDeviceReadings(d.id, 1);
        if (readings.length > 0) latestReading = readings[0];
      } catch { /* skip */ }

      // Still include devices without coordinates — frontend can show them in list
      locations.push({
        id: d.id,
        name: d.name || d.id,
        type: d.type || 'unknown',
        status: d.status || 'unknown',
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null,
        description: meta?.description || '',
        firmware: meta?.firmware_version || '',
        tags: meta?.tags || [],
        hasCoordinates: lat != null && lng != null,
        latestReading: latestReading?.sensors || null,
      });
    }
    res.json(locations);
  } catch { res.json([]); }
});

router.get('/', async (req, res) => {
  try {
    const devices = await db.getDevices();
    res.json(devices);
  } catch { res.json([]); }
});

router.get('/:id', async (req, res) => {
  try {
    const device = await db.getDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    const meta = await db.getDeviceMetadata(req.params.id);
    res.json({ ...device, metadata: meta });
  } catch { res.status(404).json({ error: 'Device not found' }); }
});

router.post('/', limiter, async (req, res) => {
  const { id, name, type, region, status } = req.body;
  if (!id) return res.status(400).json({ error: 'Device ID required' });
  try {
    await db.upsertDevice({ id, name: name || id, type: type || 'Generic', status: status || 'online', lastSeen: Date.now() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', limiter, async (req, res) => {
  try {
    const { id: _id, ...body } = req.body;
    await db.upsertDevice({ id: req.params.id, ...body, lastSeen: Date.now() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.deleteDevice(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/readings', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const readings = await db.getDeviceReadings(req.params.id, limit);
    res.json(readings);
  } catch { res.json([]); }
});

router.get('/:id/metadata', async (req, res) => {
  try {
    const meta = await db.getDeviceMetadata(req.params.id);
    res.json(meta || {});
  } catch { res.json({}); }
});

router.post('/:id/metadata', limiter, async (req, res) => {
  try {
    const { device_id: _did, ...metaBody } = req.body;
    await db.upsertDeviceMetadata({ device_id: req.params.id, ...metaBody });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Set device location (lat/lng)
router.put('/:id/location', limiter, async (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'lat and lng required' });
  }
  try {
    const existing = await db.getDeviceMetadata(req.params.id);
    await db.upsertDeviceMetadata({
      device_id: req.params.id,
      firmware_version: existing?.firmware_version || '',
      location_lat: Number(lat),
      location_lng: Number(lng),
      description: existing?.description || '',
      tags: existing?.tags || [],
      config: existing?.config || {},
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Device health
router.get('/:id/health', async (req, res) => {
  try {
    const health = await db.getLatestDeviceHealth(req.params.id);
    res.json(health || {});
  } catch { res.json({}); }
});

router.get('/:id/health/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const history = await db.getDeviceHealthHistory(req.params.id, limit);
    res.json(history);
  } catch { res.json([]); }
});

// Actuator command (publishes via MQTT if available)
router.post('/:id/actuator', limiter, async (req, res) => {
  const { actuator, action } = req.body;
  if (!actuator || !action) {
    return res.status(400).json({ error: 'actuator and action required' });
  }
  try {
    const mqttClient = req.app.get('mqttClient');
    if (mqttClient) {
      const topic = `pern/actuators/${req.params.id}/command`;
      const payload = JSON.stringify({ actuator, action, source: 'api', timestamp: Date.now() });
      mqttClient.publish(topic, payload);
      res.json({ success: true, topic, payload: JSON.parse(payload) });
    } else {
      res.status(503).json({ error: 'MQTT not available' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
