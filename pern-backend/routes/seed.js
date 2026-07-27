/**
 * Seed Routes — populate demo data for testing
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../middleware/rbac');

router.post('/demo', requireRole('admin', 'manager'), async (req, res) => {
  try {
    // Seed demo devices
    await db.upsertDevice({ id: 'ESP32-Cairo-001', name: 'ESP32 Cairo Lab', type: 'ESP32', status: 'online', lastSeen: Date.now() });
    await db.upsertDevice({ id: 'NodeMCU-Delta-02', name: 'NodeMCU Delta Station', type: 'NodeMCU', status: 'online', lastSeen: Date.now() });

    // Seed demo organization
    await db.upsertOrganization({ id: 'demo-org', name: 'STEM Gharbiya', description: 'Demo organization', ownerId: 'demo-user' });

    // Seed demo user
    await db.upsertUser({ id: 'demo-user', email: 'demo@pern.dev', name: 'Demo User', role: 'supervisor', organization_id: 'demo-org' });

    // Seed demo automation rules
    const rules = [
      { id: 'rule-pm25-high', name: 'High PM2.5 → Fan On', sensor: 'pm25', operator: '>', threshold: 35, action: { device: 'ESP32-Cairo-001', actuator: 'fan', command: 'on' }, enabled: true },
      { id: 'rule-co2-critical', name: 'CO2 Critical → Ventilation', sensor: 'co2', operator: '>', threshold: 1000, action: { device: 'ESP32-Cairo-001', actuator: 'fan', command: 'on' }, enabled: true },
      { id: 'rule-ph-drift', name: 'pH Drift → Pump On', sensor: 'ph', operator: '<', threshold: 6.5, action: { device: 'ESP32-Cairo-001', actuator: 'pump', command: 'on' }, enabled: true },
      { id: 'rule-temp-high', name: 'Heat Warning → Fan On', sensor: 'tmp', operator: '>', threshold: 38, action: { device: 'ESP32-Cairo-001', actuator: 'fan', command: 'on' }, enabled: true },
    ];
    for (const r of rules) {
      await db.saveAutomationRule(r);
    }

    // Seed some sensor readings
    const devices = ['ESP32-Cairo-001', 'NodeMCU-Delta-02'];
    for (let i = 0; i < 20; i++) {
      const dev = devices[i % 2];
      const reading = {
        device: dev,
        timestamp: Date.now() - (20 - i) * 5000,
        sensors: {
          pm25: Math.round(15 + Math.random() * 25),
          ph: Math.round((6.8 + Math.random() * 1.2) * 100) / 100,
          tds: Math.round(150 + Math.random() * 150),
          tmp: Math.round((24 + Math.random() * 8) * 10) / 10,
          hum: Math.round(45 + Math.random() * 25),
          co2: Math.round(400 + Math.random() * 300),
        },
      };
      await db.saveSensorReading(reading);
    }

    res.json({ success: true, message: 'Demo data seeded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
