/**
 * Security Middleware Tests
 * Covers the security layer wired into server.js: enhanced headers, query
 * validation, audit logging, brute-force protection, CSRF, and JWT auth.
 */

// ---- Enhanced Security Headers ----
describe('Enhanced Security Headers', () => {
  const { enhancedSecurityHeaders } = require('../middleware/security-headers');

  function makeRes() {
    const headers = {};
    return {
      headersSent: false,
      setHeader: (k, v) => { headers[k] = v; },
      getHeaders: () => headers,
      get: () => null,
    };
  }

  it('sets core hardening headers', () => {
    const res = makeRes();
    enhancedSecurityHeaders({ method: 'GET', path: '/api/health' }, res, () => {});
    expect(res.getHeaders()['X-Content-Type-Options']).toBe('nosniff');
    expect(res.getHeaders()['X-Frame-Options']).toBe('DENY');
    expect(res.getHeaders()['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(res.getHeaders()['Permissions-Policy']).toContain('camera=()');
    expect(res.getHeaders()['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(res.getHeaders()['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });

  it('forces attachment download on export/report paths', () => {
    const res = makeRes();
    enhancedSecurityHeaders({ method: 'GET', path: '/api/export/readings/csv' }, res, () => {});
    expect(res.getHeaders()['Content-Disposition']).toBe('attachment');
  });

  it('applies no-store cache control to /api responses', () => {
    const res = makeRes();
    enhancedSecurityHeaders({ method: 'GET', path: '/api/sensors' }, res, () => {});
    expect(res.getHeaders()['Cache-Control']).toContain('no-store');
  });
});

// ---- Query Parameter Validation ----
describe('Query Parameter Validation', () => {
  const { validateQueryParams } = require('../middleware/query-validator');

  function makeRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
  }

  it('passes valid query params through', () => {
    const req = { query: { limit: '10', device: 'sensor-1' } };
    let nextCalled = false;
    validateQueryParams(req, makeRes(), () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('rejects query values starting with $ (operator injection)', () => {
    const req = { query: { filter: '$where' } };
    const res = makeRes();
    validateQueryParams(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects prototype-pollution keys', () => {
    const req = { query: JSON.parse('{"__proto__":"x"}') };
    const res = makeRes();
    validateQueryParams(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects too many query params', () => {
    const query = {};
    for (let i = 0; i < 31; i++) query[`p${i}`] = '1';
    const res = makeRes();
    validateQueryParams({ query }, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects control characters and oversized values', () => {
    const res1 = makeRes();
    validateQueryParams({ query: { q: 'a\nb' } }, res1, () => {});
    expect(res1.status).toHaveBeenCalledWith(400);

    const res2 = makeRes();
    validateQueryParams({ query: { q: 'x'.repeat(300) } }, res2, () => {});
    expect(res2.status).toHaveBeenCalledWith(400);
  });
});

// ---- Audit Logger ----
describe('Audit Logger', () => {
  const { auditLogger, withAuditLabel, generateRequestId } = require('../middleware/audit-logger');
  const db = require('../db');

  function makeReq(overrides = {}) {
    return {
      method: 'POST',
      path: '/api/sensors',
      ip: '203.0.113.5',
      params: {},
      body: {},
      headers: {},
      get: () => 'test-agent',
      ...overrides,
    };
  }

  it('stamps an X-Request-Id and exposes it on the request', () => {
    const req = makeReq();
    const res = { setHeader: vi.fn(), statusCode: 200, json: vi.fn() };
    auditLogger(req, res, () => {});
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.stringMatching(/^req_/));
    expect(req.requestId).toMatch(/^req_/);
  });

  it('generates unique request ids', () => {
    expect(generateRequestId()).not.toBe(generateRequestId());
  });

  it('persists an audit row for a successful write using the label override', () => {
    const spy = vi.spyOn(db, 'logAuditEvent').mockResolvedValue(true);
    try {
      const req = makeReq();
      const res = { setHeader: vi.fn(), statusCode: 200, json: vi.fn() };
      withAuditLabel('sensors.ingest', 'sensor_reading')(req, res, () => {});
      auditLogger(req, res, () => {});
      res.json({ success: true });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        action: 'sensors.ingest',
        resource_type: 'sensor_reading',
        user_id: 'anonymous',
        ip_address: '203.0.113.5',
      }));
    } finally {
      spy.mockRestore();
    }
  });

  it('skips persistence for non-state-changing methods', () => {
    const spy = vi.spyOn(db, 'logAuditEvent').mockResolvedValue(true);
    try {
      const req = makeReq({ method: 'GET' });
      const res = { setHeader: vi.fn(), statusCode: 200, json: vi.fn() };
      auditLogger(req, res, () => {});
      res.json({ ok: true });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

// ---- Brute Force Protection ----
describe('Brute Force Protection', () => {
  const { bruteForceProtection } = require('../middleware/brute-force');

  function makeRes() {
    return {
      statusCode: 200,
      setHeader: vi.fn(),
      status(c) { this.statusCode = c; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  it('bans an IP after the failure threshold with a retry window', () => {
    const mw = bruteForceProtection((req, body) => Boolean(body && body.error));
    const ip = '10.99.0.1';
    let nextCount = 0;

    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      mw({ ip, headers: {} }, res, () => { nextCount++; });
      res.json({ error: 'invalid key' });
    }
    expect(nextCount).toBe(5);

    const res6 = makeRes();
    let next6 = 0;
    mw({ ip, headers: {} }, res6, () => { next6++; });
    expect(res6.statusCode).toBe(429);
    expect(res6.body.retryAfter).toBeGreaterThan(0);
    expect(next6).toBe(0);
  });

  it('clears the record after a successful response', () => {
    const mw = bruteForceProtection((req, body) => Boolean(body && body.error));
    const ip = '10.99.0.2';

    const res1 = makeRes();
    mw({ ip, headers: {} }, res1, () => {});
    res1.json({ success: true });

    const res = makeRes();
    let nextCalled = false;
    mw({ ip, headers: {} }, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});

// ---- CSRF Protection ----
describe('CSRF Protection', () => {
  const { csrfProtection, csrfTokenEndpoint } = require('../middleware/csrf');

  afterEach(() => {
    delete process.env.ENFORCE_CSRF;
  });

  it('issues a signed cookie + token pair from the token endpoint', () => {
    let cookieValue = null;
    const res = {
      cookie: (k, v) => { cookieValue = v; },
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    csrfTokenEndpoint({ method: 'GET' }, res);
    const token = res.json.mock.calls[0][0].token;
    expect(token).toMatch(/^[^.]+\.[^.]+$/);
    expect(cookieValue).toBe(token);
  });

  it('accepts a matching double-submit token when enforced', () => {
    process.env.ENFORCE_CSRF = 'true';
    let cookieValue = null;
    const res0 = { cookie: (k, v) => { cookieValue = v; }, json: vi.fn(), status: vi.fn().mockReturnThis() };
    csrfTokenEndpoint({ method: 'GET' }, res0);
    const token = res0.json.mock.calls[0][0].token;

    const req = { method: 'POST', cookies: { pern_csrf: token }, headers: { 'x-csrf-token': token }, ip: '1.1.1.1' };
    let nextCalled = false;
    csrfProtection(req, { status: vi.fn().mockReturnThis(), json: vi.fn() }, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('rejects a mismatched token with 403 when enforced', () => {
    process.env.ENFORCE_CSRF = 'true';
    const req = {
      method: 'POST',
      cookies: { pern_csrf: 'real.token' },
      headers: { 'x-csrf-token': 'forged.token' },
      ip: '1.1.1.1',
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    csrfProtection(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('passes through when CSRF is not enforced', () => {
    const req = { method: 'POST', cookies: {}, headers: {} };
    let nextCalled = false;
    csrfProtection(req, { status: vi.fn().mockReturnThis(), json: vi.fn() }, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

// ---- JWT Auth Middleware ----
describe('authenticateToken', () => {
  afterEach(() => {
    delete process.env.ENFORCE_AUTH;
  });

  it('rejects missing token when auth is enforced', async () => {
    process.env.ENFORCE_AUTH = 'true';
    const { authenticateToken } = require('../auth');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    let nextCalled = false;
    await authenticateToken({ headers: {} }, res, () => { nextCalled = true; });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(nextCalled).toBe(false);
  });

  it('attaches dev-user and org/user context when not enforced', async () => {
    process.env.ENFORCE_AUTH = 'false';
    const { authenticateToken } = require('../auth');
    const req = { headers: { 'x-organization-id': 'org-1', 'x-user-id': 'user-1' } };
    let nextCalled = false;
    await authenticateToken(req, {}, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.user).toEqual(expect.objectContaining({ sub: 'dev-user', role: 'admin' }));
    expect(req.orgId).toBe('org-1');
    expect(req.userId).toBe('user-1');
  });
});
