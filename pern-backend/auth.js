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
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    if (ENFORCE_AUTH) {
      return res.status(401).json({ error: 'Unauthorized: Access token is missing' });
    }
    // Graceful fallback for local development when auth is not enforced
    req.user = { sub: 'dev-user', role: 'admin' };
    return next();
  }

  const result = await verifyLogtoToken(token);
  if (!result.valid) {
    if (ENFORCE_AUTH) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token', details: result.error });
    }
    req.user = { sub: 'dev-user', role: 'admin' };
    return next();
  }

  req.user = result.payload;
  next();
}

module.exports = {
  verifyLogtoToken,
  authenticateToken,
  LOGTO_ENDPOINT,
  LOGTO_APP_ID,
  ENFORCE_AUTH,
};