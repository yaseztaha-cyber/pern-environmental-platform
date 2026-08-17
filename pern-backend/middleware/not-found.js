/**
 * 404 Not Found Middleware
 * Uniform JSON response for any route that no handler matched.
 */

function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    path: req.path,
    timestamp: new Date().toISOString(),
  });
}

module.exports = notFoundHandler;
