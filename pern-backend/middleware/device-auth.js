/**
 * Device Authentication Middleware
 * Validates API keys for device/sensor ingestion endpoints.
 *
 * Two key sources, both checked when ENFORCE_DEVICE_AUTH=true:
 *   1. Per-device keys issued via `POST /api/devices/:id/api-key`
 *      (stored hashed in the DB, verified via SHA-256 + timingSafeEqual).
 *   2. Legacy env-var keys (DEVICE_API_KEYS, comma-separated).
 *
 * When ENFORCE_DEVICE_AUTH is not set, ingestion stays open (dev default).
 */

const crypto = require('crypto');
const db = require('../db');
const logger = require('../utils/logger');

const API_KEYS = (process.env.DEVICE_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function resolveDeviceId(req) {
  return (
    req.params?.deviceId ||
    req.params?.id ||
    req.headers['x-device-id'] ||
    req.body?.deviceId ||
    req.body?.device ||
    null
  );
}

async function authenticateDevice(req, res, next) {
  const enforce = process.env.ENFORCE_DEVICE_AUTH === 'true';
  if (!enforce) return next();

  const apiKey = req.headers['x-api-key'] || '';
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-Api-Key header' });
  }

  try {
    const deviceId = resolveDeviceId(req);

    // 1) Per-device key (DB-stored hash)
    if (deviceId) {
      const storedHash = await db.getDeviceApiKeyHash(deviceId);
      if (storedHash && safeEqual(sha256(apiKey), storedHash)) {
        req.deviceAuthenticated = true;
        req.deviceId = deviceId;
        return next();
      }
    }

    // 2) Legacy env-var keys
    if (API_KEYS.length > 0) {
      const matchesEnv = API_KEYS.some(key => safeEqual(key, apiKey));
      if (matchesEnv) {
        req.deviceAuthenticated = true;
        req.deviceId = deviceId || 'env-device';
        return next();
      }
    }

    logger.warn('[DeviceAuth] Invalid API key', { ip: req.ip, path: req.path, deviceId });
    return res.status(401).json({ error: 'Invalid API key' });
  } catch (err) {
    logger.error('[DeviceAuth] Verification error', { error: err.message });
    return res.status(500).json({ error: 'Device auth check failed' });
  }
}

/**
 * Generates a secure API key for device authentication.
 */
function generateApiKey() {
  return `pern_${crypto.randomBytes(24).toString('base64url')}`;
}

/**
 * Verifies a presented API key for a device. Used for non-HTTP transports
 * (MQTT message-level auth) where there is no request object to run through
 * authenticateDevice(). Returns true only when a matching key is found.
 */
async function verifyDeviceApiKey(deviceId, apiKey) {
  if (!deviceId || !apiKey) return false;
  try {
    const storedHash = await db.getDeviceApiKeyHash(deviceId);
    if (storedHash && safeEqual(sha256(apiKey), storedHash)) return true;
    if (API_KEYS.length > 0 && API_KEYS.some(key => safeEqual(key, apiKey))) return true;
  } catch (err) {
    logger.error('[DeviceAuth] verifyDeviceApiKey error', { error: err.message });
  }
  return false;
}

module.exports = { authenticateDevice, generateApiKey, sha256, verifyDeviceApiKey };
