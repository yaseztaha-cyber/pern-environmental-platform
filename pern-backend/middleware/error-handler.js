/**
 * Global Error Handler Middleware
 * Produces a uniform { success, error, path, timestamp } response for every
 * failed request, maps body-parser/HTTP errors to sensible status codes, and
 * never leaks stack traces or internal messages in production.
 */

const logger = require('../utils/logger');

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function buildErrorMessage(err, statusCode = 500) {
  if (!err) return 'Internal Server Error';
  const hideMessage = statusCode >= 500 && (isProduction() || err.expose === false);
  return hideMessage ? 'Internal Server Error' : (err.message || 'Internal Server Error');
}

/**
 * sendError — sanitized error response for routes that catch their own errors.
 * Logs the full error server-side but only ever exposes a generic message for
 * 5xx responses in production. Keeps the legacy { error } shape.
 */
function sendError(res, err, statusCode = 500) {
  if (statusCode >= 500) {
    logger.error('[Error Handler]', { error: err && err.message, stack: err && err.stack });
  } else {
    logger.warn('[Error Handler]', { error: err && err.message, status: statusCode });
  }
  res.status(statusCode).json({ error: buildErrorMessage(err, statusCode) });
}

function errorHandler(err, req, res, _next) {
  // Body parser / malformed JSON → 400
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Malformed request body (invalid JSON)',
      path: req.path,
      timestamp: new Date().toISOString(),
    });
  }

  // HTTPError-style errors carrying their own status
  const statusCode = err.statusCode || err.status || 500;

  if (statusCode >= 500) {
    logger.error('[Error Handler]', { error: err.message, stack: err.stack, path: req.path });
  } else {
    logger.warn('[Error Handler]', { error: err.message, path: req.path, status: statusCode });
  }

  res.status(statusCode).json({
    success: false,
    error: buildErrorMessage(err, statusCode),
    path: req.path,
    timestamp: new Date().toISOString(),
    ...(isProduction() ? {} : { stack: err.stack }),
  });
}

module.exports = errorHandler;
module.exports.sendError = sendError;
module.exports.errorHandler = errorHandler;
