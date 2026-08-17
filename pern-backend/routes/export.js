/**
 * Export Routes — CSV and PDF data export endpoints
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendError } = require('../middleware/error-handler');

router.get('/readings/csv', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 500, 5000);
    const device = req.query.device || null;
    const from = req.query.from || null;
    const to = req.query.to || null;

    const rows = await db.getReadingsByDateRange(from, to, device, limit);

    if (rows.length === 0) {
      return res.status(200).send('timestamp,device,ph,pm25,tmp,hum,co2,voc,tds,sm,mq,wT,dO\n');
    }

    const headers = ['timestamp', 'device', 'ph', 'pm25', 'tmp', 'hum', 'co2', 'voc', 'tds', 'sm', 'mq', 'wT', 'dO'];
    const csvLines = [headers.join(',')];

    for (const row of rows) {
      const ts = row.created_at || new Date(row.timestamp).toISOString();
      const dev = row.device_id || row.device || '';
      const s = row.sensors || {};
      csvLines.push([
        ts, dev,
        s.ph ?? '', s.pm25 ?? '', s.tmp ?? '', s.hum ?? '', s.co2 ?? '',
        s.voc ?? '', s.tds ?? '', s.sm ?? '', s.mq ?? '', s.wT ?? '', s.dO ?? '',
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sensor-readings-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/alerts/csv', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 2000);
    const rows = await db.getAlertHistory({ limit });

    const headers = ['id', 'triggered_at', 'device_id', 'sensor', 'value', 'severity', 'message', 'acknowledged'];
    const csvLines = [headers.join(',')];

    for (const row of rows) {
      csvLines.push([
        row.id,
        row.triggered_at,
        row.device_id || '',
        row.sensor || '',
        row.value ?? '',
        row.severity || '',
        `"${(row.message || '').replace(/"/g, '""')}"`,
        row.acknowledged,
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="alert-history-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
