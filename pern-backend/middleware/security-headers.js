/**
 * Enhanced Security Headers Middleware
 * Adds security headers beyond Helmet defaults.
 */

const CACHE_MAX_AGE = 31536000;

const CDN_HOSTS = [
  'https://unpkg.com',
];

function enhancedSecurityHeaders(req, res, next) {
  const csp = res.getHeaders()['content-security-policy'] || '';

  if (!res.headersSent) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-DNS-Prefetch-Control', 'off');

    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    res.setHeader('Permissions-Policy',
      'camera=(), microphone=(), geolocation=(self), display-capture=(), ' +
      'fullscreen=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), ' +
      'accelerometer=(), ambient-light-sensor=()'
    );

    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security',
        `max-age=${63072000}; includeSubDomains; preload`
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
  }

  if (req.path.startsWith('/api/export/') || req.path.startsWith('/api/reports/')) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
  }

  if (req.path.startsWith('/api/') && !req.path.includes('/health')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  next();
}

module.exports = { enhancedSecurityHeaders };
