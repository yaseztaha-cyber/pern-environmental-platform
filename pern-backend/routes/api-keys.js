/**
 * PERN v3 — API Key Management Routes (internal)
 * Register, list, and revoke public API keys via the authenticated console.
 */
const express = require('express');
const router = express.Router();
const publicApi = require('../services/public-api');

router.get('/', async (req, res) => {
  const keys = await publicApi.listKeys();
  res.json({ keys });
});

router.post('/', async (req, res) => {
  const { name, email, tier } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = await publicApi.register({ name, email, tier });
  res.status(201).json(result);
});

router.post('/revoke', async (req, res) => {
  const { api_key } = req.body || {};
  if (!api_key) return res.status(400).json({ error: 'api_key is required' });
  const ok = await publicApi.revoke(api_key);
  res.json({ revoked: ok });
});

module.exports = router;
