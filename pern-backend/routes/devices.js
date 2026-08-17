/**
 * Devices Routes — device CRUD and metadata
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const rateLimiter = require('../middleware/rate-limiter');
const { generateApiKey, sha256 } = require('../middleware/device-auth');
const { normalizeDeviceConfig, DEFAULT_CONFIG } = require('../services/device-config');
const { buildOtaMessages, publishOta } = require('../services/mqtt-ota');
const { sendError } = require('../middleware/error-handler');
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
  } catch (err) { sendError(res, err); }
});

router.put('/:id', limiter, async (req, res) => {
  try {
    const { id: _id, ...body } = req.body;
    await db.upsertDevice({ id: req.params.id, ...body, lastSeen: Date.now() });
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.deleteDevice(req.params.id);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
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
  } catch (err) { sendError(res, err); }
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
  } catch (err) { sendError(res, err); }
});

// Device API key — issue a key (returned exactly once, stored hashed)
router.post('/:id/api-key', limiter, async (req, res) => {
  try {
    const key = generateApiKey();
    await db.storeDeviceApiKey(req.params.id, sha256(key));
    res.json({ success: true, deviceId: req.params.id, apiKey: key, note: 'Store this key securely — it is shown only once.' });
  } catch (err) { sendError(res, err); }
});

// Device API key — revoke
router.post('/:id/api-key/revoke', limiter, async (req, res) => {
  try {
    await db.revokeDeviceApiKey(req.params.id);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// Device API key — status (whether a key is configured, never the key itself)
router.get('/:id/api-key-status', async (req, res) => {
  try {
    const hasKey = await db.deviceHasApiKey(req.params.id);
    res.json({ deviceId: req.params.id, hasKey, enforcementEnabled: process.env.ENFORCE_DEVICE_AUTH === 'true' });
  } catch { res.json({ deviceId: req.params.id, hasKey: false, enforcementEnabled: process.env.ENFORCE_DEVICE_AUTH === 'true' }); }
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
// Canonical topic: pern/devices/{deviceId}/actuators/{actuator}/command
// Payload: { device, actuator, command: 'on'|'off'|'set', params, source, timestamp }
router.post('/:id/actuator', limiter, async (req, res) => {
  const { actuator, action, command, params } = req.body;
  const cmd = action || command;
  if (!actuator || !cmd) {
    return res.status(400).json({ error: 'actuator and action/command required' });
  }
  if (cmd === 'set' && (params == null || params.value == null)) {
    return res.status(400).json({ error: 'params.value required for set command' });
  }
  try {
    const mqttClient = req.app.get('mqttClient');
    if (!mqttClient) {
      return res.status(503).json({ error: 'MQTT not available' });
    }
    const topic = `pern/devices/${req.params.id}/actuators/${actuator}/command`;
    const payload = {
      device: req.params.id,
      actuator,
      command: cmd,
      params: params || {},
      source: 'api',
      timestamp: Date.now(),
    };
    mqttClient.publish(topic, JSON.stringify(payload));
    res.json({ success: true, topic, payload });
  } catch (err) { sendError(res, err); }
});

// Desired runtime config for a device (stored in device_metadata.config)
router.get('/:id/config', async (req, res) => {
  try {
    const meta = await db.getDeviceMetadata(req.params.id);
    const stored = meta?.config || {};
    const config = {
      ...DEFAULT_CONFIG,
      ...stored,
      sensors: { ...DEFAULT_CONFIG.sensors, ...(stored.sensors || {}) },
    };
    res.json({
      deviceId: req.params.id,
      config,
      lastConfigPush: meta?.last_config_push || null,
    });
  } catch {
    res.json({ deviceId: req.params.id, config: DEFAULT_CONFIG, lastConfigPush: null });
  }
});

// Push a new runtime config to the device via MQTT (pern/devices/{id}/config)
router.post('/:id/config', limiter, async (req, res) => {
  const { config, error } = normalizeDeviceConfig(req.body);
  if (error) return res.status(400).json({ error });
  const mqttClient = req.app.get('mqttClient');
  if (!mqttClient) return res.status(503).json({ error: 'MQTT not available' });
  const topic = `pern/devices/${req.params.id}/config`;
  const payload = { ...config, source: 'api', timestamp: Date.now() };
  const ok = mqttClient.publish(topic, JSON.stringify(payload));
  if (!ok) return res.status(503).json({ error: 'MQTT publish failed' });

  const existing = await db.getDeviceMetadata(req.params.id).catch(() => null);
  await db.upsertDeviceMetadata({
    device_id: req.params.id,
    firmware_version: existing?.firmware_version || '',
    location_lat: existing?.location_lat || null,
    location_lng: existing?.location_lng || null,
    description: existing?.description || '',
    tags: existing?.tags || [],
    config: { ...(existing?.config || {}), ...config, lastUpdatedAt: Date.now() },
  });
  await db.updateDeviceConfigPush(req.params.id);

  res.json({ success: true, topic, payload, delivered: true });
});

// OTA push — chunks base64 firmware over MQTT (pern/devices/{id}/ota)
router.post('/:id/ota', limiter, async (req, res) => {
  const { firmware, version } = req.body || {};
  const built = buildOtaMessages(firmware, { version });
  if (built.error) return res.status(400).json({ error: built.error });
  const mqttClient = req.app.get('mqttClient');
  const result = await publishOta(mqttClient, req.params.id, built.messages);
  if (!result.success) {
    return res.status(503).json({ error: result.error, sentIndex: result.sentIndex });
  }
  res.json({
    success: true,
    deviceId: req.params.id,
    totalChunks: result.totalChunks,
    decodedBytes: built.decodedBytes,
    version: version || null,
    topic: `pern/devices/${req.params.id}/ota`,
  });
});

module.exports = router;
