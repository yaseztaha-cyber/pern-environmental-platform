/**
 * HTTP Request Logging Middleware
 * Logs method, URL, status code, and response time for every request.
 */

const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();

  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP request', {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    });

    originalEnd.apply(this, args);
  };

  next();
}

module.exports = requestLogger;
