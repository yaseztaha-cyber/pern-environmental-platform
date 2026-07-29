/**
 * CSRF Protection Middleware
 * Uses double-submit cookie pattern with a signed token.
 * For SPA frontends, also accepts X-CSRF-Token header.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const CSRF_COOKIE = 'pern_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generateToken(secret) {
  const random = crypto.randomBytes(24).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(random).digest('base64url');
  return `${random}.${hmac}`;
}

function validateToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [random, hmac] = parts;
  const expected = crypto.createHmac('sha256', secret).update(random).digest('base64url');
  if (hmac.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    const existing = req.cookies?.[CSRF_COOKIE];
    if (!existing && process.env.ENFORCE_CSRF === 'true') {
      const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET || 'dev-csrf-secret';
      const token = generateToken(secret);
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 86400000,
        path: '/',
      });
    }
    return next();
  }

  if (process.env.ENFORCE_CSRF !== 'true') return next();

  const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET || 'dev-csrf-secret';
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    logger.warn('[CSRF] Missing token', { method: req.method, path: req.path, ip: req.ip });
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  if (!validateToken(headerToken, secret) || !validateToken(cookieToken, secret)) {
    logger.warn('[CSRF] Token mismatch', { method: req.method, path: req.path, ip: req.ip });
    return res.status(403).json({ error: 'CSRF token invalid' });
  }

  if (!crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))) {
    logger.warn('[CSRF] Token values differ', { method: req.method, path: req.path, ip: req.ip });
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  next();
}

function csrfTokenEndpoint(req, res) {
  if (SAFE_METHODS.has(req.method)) {
    const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET || 'dev-csrf-secret';
    const token = generateToken(secret);
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400000,
      path: '/',
    });
    return res.json({ token });
  }
  res.status(405).json({ error: 'Method not allowed' });
}

module.exports = { csrfProtection, csrfTokenEndpoint };
