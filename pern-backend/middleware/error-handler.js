/**
 * Global Error Handler Middleware
 */

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error('[Error Handler]', { error: err.message, stack: err.stack, path: req.path });

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}

module.exports = errorHandler;