/**
 * Logto OIDC Authentication Helpers
 * Uses jose for JWT verification
 */

const { createRemoteJWKSet, jwtVerify } = require('jose');
const logger = require('./utils/logger');

const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT || 'http://localhost:3001';
const LOGTO_APP_ID = process.env.LOGTO_APP_ID || 'your-app-id';
const ENFORCE_AUTH = process.env.ENFORCE_AUTH === 'true';

let jwks = null;

function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${LOGTO_ENDPOINT}/oidc/jwks`));
  }
  return jwks;
}

async function verifyLogtoToken(token) {
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: `${LOGTO_ENDPOINT}/oidc`,
      audience: LOGTO_APP_ID,
    });
    return { valid: true, payload };
  } catch (error) {
    logger.warn('[Logto] Token verification failed', { error: error.message });
    return { valid: false, error: error.message };
  }
}

/**
 * Express middleware for verifying Logto JWT tokens.
 * Enforces authentication when ENFORCE_AUTH=true.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;
  const enforceAuth = process.env.ENFORCE_AUTH === 'true';

  if (!token) {
    if (enforceAuth) {
      return res.status(401).json({ error: 'Unauthorized: Access token is missing' });
    }
    // Graceful fallback for local development when auth is not enforced
    req.user = { sub: 'dev-user', role: 'admin' };
  } else {
    const result = await verifyLogtoToken(token);
    if (!result.valid) {
      if (enforceAuth) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token', details: result.error });
      }
      req.user = { sub: 'dev-user', role: 'admin' };
    } else {
      req.user = result.payload;
    }
  }

  // Multi-tenancy: attach organization / user context from headers
  const orgId = req.headers['x-organization-id'];
  const userId = req.headers['x-user-id'];
  if (orgId) req.orgId = orgId;
  if (userId) req.userId = userId;

  next();
}

module.exports = {
  verifyLogtoToken,
  authenticateToken,
  LOGTO_ENDPOINT,
  LOGTO_APP_ID,
  ENFORCE_AUTH,
};