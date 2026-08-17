/**
 * Reports Routes — report generation and listing
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const rateLimiter = require('../middleware/rate-limiter');
const { requireRole } = require('../middleware/rbac');
const limiter = rateLimiter(60000, 10);
const { sendError } = require('../middleware/error-handler');

router.get('/available', (req, res) => {
  res.json([
    { id: 'daily', label: 'Daily Summary', desc: 'EHI + Key Metrics' },
    { id: 'water', label: 'Water Quality Report', desc: 'WQI + Virtual Sensors' },
    { id: 'air', label: 'Air Quality Report', desc: 'AQI + Pollutant Analysis' },
    { id: 'risk', label: 'Risk Assessment', desc: 'Environmental Risk Score' },
    { id: 'vulnerable', label: 'Vulnerable Groups', desc: 'Sensitivity Analysis' },
    { id: 'compliance', label: 'Compliance Report', desc: 'WHO / EPA / Egypt' },
  ]);
});

router.post('/generate', limiter, async (req, res) => {
  const { type, device, dateRange } = req.body;
  if (!type) return res.status(400).json({ error: 'Report type required' });

  try {
    const limit = 200;
    const readings = await db.getReadingsByDateRange(
      dateRange?.from, dateRange?.to, device, limit
    );
    const alerts = await db.getAlertHistory({ limit: 100 });

    const report = {
      type,
      generatedAt: new Date().toISOString(),
      device: device || 'all',
      summary: {
        totalReadings: readings.length,
        totalAlerts: alerts.length,
      },
      readings: readings.slice(0, 50),
      alerts: alerts.slice(0, 20),
    };

    res.json(report);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
