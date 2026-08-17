/**
 * Authentication Middleware
 * Supports local JWT (primary) and Logto OIDC (legacy fallback)
 */

const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'pern-jwt-secret-change-me-in-production';
const isEnforceAuth = () => process.env.ENFORCE_AUTH === 'true';
const ENFORCE_AUTH = isEnforceAuth;

/**
 * Express middleware for verifying JWT tokens.
 * Supports local self-hosted JWT and Logto OIDC tokens.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;

  if (!token) {
    if (isEnforceAuth()) {
      return res.status(401).json({ error: 'Unauthorized: Access token is missing' });
    }
    req.user = { sub: 'dev-user', role: 'admin' };
    const orgId = req.headers['x-organization-id'];
    const userId = req.headers['x-user-id'];
    if (orgId) req.orgId = orgId;
    if (userId) req.userId = userId;
    return next();
  }

  // Try local JWT first
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    const orgId = req.headers['x-organization-id'];
    const userId = req.headers['x-user-id'];
    if (orgId) req.orgId = orgId;
    if (userId) req.userId = userId;
    return next();
  } catch (localErr) {
    // If local JWT fails and Logto is configured, try Logto JWKS
    const logtoEndpoint = process.env.LOGTO_ENDPOINT;
    const logtoAppId = process.env.LOGTO_APP_ID;
    if (logtoEndpoint && logtoAppId && logtoEndpoint !== 'http://localhost:3001') {
      try {
        const { createRemoteJWKSet, jwtVerify } = require('jose');
        const jwks = createRemoteJWKSet(new URL(`${logtoEndpoint}/oidc/jwks`));
        const { payload } = await jwtVerify(token, jwks, {
          issuer: `${logtoEndpoint}/oidc`,
          audience: logtoAppId,
        });
        req.user = payload;
        const orgId = req.headers['x-organization-id'];
        const userId = req.headers['x-user-id'];
        if (orgId) req.orgId = orgId;
        if (userId) req.userId = userId;
        return next();
      } catch (logtoErr) {
        logger.warn('[Auth] Logto token verification failed', { error: logtoErr.message });
      }
    }

    if (isEnforceAuth()) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    req.user = { sub: 'dev-user', role: 'admin' };
    const orgId = req.headers['x-organization-id'];
    const userId = req.headers['x-user-id'];
    if (orgId) req.orgId = orgId;
    if (userId) req.userId = userId;
    next();
  }
}

module.exports = {
  authenticateToken,
  ENFORCE_AUTH,
};
