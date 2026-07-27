/**
 * Notifications Routes — notification preferences and sending
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const dispatcher = require('../services/notification-dispatcher');
const { requireRole, requireOwnership } = require('../middleware/rbac');
const rateLimiter = require('../middleware/rate-limiter');
const limiter = rateLimiter(60000, 30);

router.get('/preferences/:userId', async (req, res) => {
  try {
    const prefs = await db.getNotificationPreferences(req.params.userId);
    res.json(prefs);
  } catch { res.json([]); }
});

router.post('/preferences', limiter, async (req, res) => {
  try {
    await db.saveNotificationPreference(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/preferences/:userId/:channel', limiter, requireRole('admin', 'manager'), requireOwnership(req => req.params.userId), async (req, res) => {
  try {
    await db.deleteNotificationPreference(req.params.userId, req.params.channel);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send', limiter, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const results = await dispatcher.dispatch(req.body);
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
