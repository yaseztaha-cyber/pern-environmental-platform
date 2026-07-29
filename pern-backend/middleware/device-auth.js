/**
 * Device Authentication Middleware
 * Validates API keys for device/sensor ingestion endpoints.
 * Supports multiple API keys configured via env var.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const API_KEYS = (process.env.DEVICE_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

const ENFORCE_DEVICE_AUTH = process.env.ENFORCE_DEVICE_AUTH === 'true';

function authenticateDevice(req, res, next) {
  if (!ENFORCE_DEVICE_AUTH) return next();

  if (API_KEYS.length === 0) {
    logger.warn('[DeviceAuth] No API keys configured but ENFORCE_DEVICE_AUTH=true');
    return res.status(500).json({ error: 'Device auth not configured' });
  }

  const apiKey = req.headers['x-api-key'] || '';
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-Api-Key header' });
  }

  const valid = API_KEYS.some(key => {
    if (key.length !== apiKey.length) return false;
    return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(apiKey));
  });

  if (!valid) {
    logger.warn('[DeviceAuth] Invalid API key', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.deviceAuthenticated = true;
  next();
}

/**
 * Generates a secure API key for device authentication.
 */
function generateApiKey() {
  return `pern_${crypto.randomBytes(24).toString('base64url')}`;
}

module.exports = { authenticateDevice, generateApiKey };
