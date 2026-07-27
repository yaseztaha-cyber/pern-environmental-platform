/**
 * Firmware Routes — firmware version management
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const versions = await db.getFirmwareVersions(req.query.deviceType);
    res.json(versions);
  } catch { res.json([]); }
});

router.get('/latest/:deviceType', async (req, res) => {
  try {
    const fw = await db.getLatestFirmware(req.params.deviceType);
    res.json(fw || null);
  } catch { res.json(null); }
});

router.post('/', async (req, res) => {
  try {
    await db.saveFirmwareVersion(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.deleteFirmwareVersion(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:deviceId/update', async (req, res) => {
  try {
    const fw = await db.getLatestFirmware(req.body.deviceType || 'ESP32');
    if (!fw) return res.status(404).json({ error: 'No firmware available' });
    await db.upsertDeviceMetadata({ device_id: req.params.deviceId, firmware_version: fw.version });
    await db.updateDeviceConfigPush(req.params.deviceId);
    res.json({ success: true, version: fw.version });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
