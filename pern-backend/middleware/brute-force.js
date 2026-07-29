/**
 * Brute Force Protection Middleware
 * Tracks failed auth attempts per IP with exponential backoff.
 * Clears after a successful auth or timeout.
 */

const logger = require('../utils/logger');

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BASE_BAN_MS = 60000;

const attempts = new Map();

function bruteForceProtection(failCheck) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `brute:${ip}`;
    const now = Date.now();
    const record = attempts.get(key);

    if (record) {
      if (record.count >= MAX_FAILURES) {
        const elapsed = now - record.firstFailure;
        const banDuration = BASE_BAN_MS * Math.pow(2, Math.min(record.count - MAX_FAILURES, 5));
        if (elapsed < banDuration) {
          const retryAfter = Math.ceil((banDuration - elapsed) / 1000);
          logger.warn('[BruteForce] Blocked', { ip, count: record.count, retryAfter });
          return res.status(429).json({
            error: 'Too many failed attempts. Try again later.',
            retryAfter,
          });
        }
        attempts.delete(key);
        return next();
      }

      if (now - record.firstFailure > WINDOW_MS) {
        attempts.delete(key);
      }
    }

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (failCheck && failCheck(req, body)) {
        const rec = attempts.get(key) || { count: 0, firstFailure: now };
        rec.count++;
        if (rec.count === 1) rec.firstFailure = now;
        attempts.set(key, rec);
        logger.warn('[BruteForce] Failed attempt', { ip, count: rec.count });
      } else {
        attempts.delete(key);
      }
      return originalJson(body);
    };
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    const banDuration = BASE_BAN_MS * Math.pow(2, Math.max(record.count - MAX_FAILURES, 0));
    if (now - record.firstFailure > Math.max(WINDOW_MS, banDuration)) {
      attempts.delete(key);
    }
  }
}, 120000).unref();

module.exports = { bruteForceProtection };
