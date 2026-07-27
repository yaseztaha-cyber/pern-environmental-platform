/**
 * Rate Limiter Middleware
 *
 * Sliding-window implementation with per-store configuration.
 * Each call to createRateLimiter() gets its own independent store
 * so that a low limit on one route doesn't consume the budget of another.
 */

const allStores = [];

function createRateLimiter(windowMs = 60000, maxRequests = 30) {
  const store = new Map();
  const meta = { windowMs, maxRequests };
  allStores.push({ store, meta });

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!store.has(ip)) {
      store.set(ip, []);
    }

    const requests = store.get(ip);
    const validRequests = requests.filter(time => now - time < windowMs);

    if (validRequests.length >= maxRequests) {
      store.set(ip, validRequests);
      const retryAfter = Math.ceil((validRequests[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil((validRequests[0] + windowMs) / 1000));
      return res.status(429).json({
        error: 'Too many requests. Please wait before trying again.',
        retryAfter,
      });
    }

    validRequests.push(now);
    store.set(ip, validRequests);

    // Set rate limit headers on successful requests
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - validRequests.length);
    res.setHeader('X-RateLimit-Reset', Math.ceil((validRequests[0] + windowMs) / 1000));

    next();
  };
}

// Cleanup stale entries using each store's own window size
setInterval(() => {
  const now = Date.now();
  for (const { store, meta } of allStores) {
    for (const [ip, requests] of store) {
      const valid = requests.filter(t => now - t < meta.windowMs);
      if (valid.length === 0) {
        store.delete(ip);
      } else {
        store.set(ip, valid);
      }
    }
  }
}, 120000).unref();

module.exports = createRateLimiter;
