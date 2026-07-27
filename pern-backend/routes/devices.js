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
      if (meta && meta.location_lat && meta.location_lng) {
        locations.push({ id: d.id, name: d.name, lat: meta.location_lat, lng: meta.location_lng, status: d.status });
      }
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
    await db.upsertDevice({ id: req.params.id, ...req.body, lastSeen: Date.now() });
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
    await db.upsertDeviceMetadata({ device_id: req.params.id, ...req.body });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
