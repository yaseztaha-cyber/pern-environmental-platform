const errorHandler = require('../middleware/error-handler');
const notFoundHandler = require('../middleware/not-found');

describe('Error Handler', () => {
  function makeRes() {
    const json = vi.fn().mockReturnThis();
    return { status: vi.fn().mockReturnValue({ json }), json, statusCode: 0 };
  }

  const makeReq = (path = '/api/test') => ({ path, method: 'GET' });

  it('returns 500 with a generic message in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = makeRes();
      errorHandler(new Error('boom'), makeReq(), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(500);
      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.error).toBe('Internal Server Error');
      expect(body.path).toBe('/api/test');
      expect(body.stack).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('exposes the error message outside production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res = makeRes();
      errorHandler(new Error('column missing'), makeReq(), res, vi.fn());
      const body = res.json.mock.calls[0][0];
      expect(body.error).toBe('column missing');
      expect(body.stack).toContain('Error: column missing');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('respects err.statusCode', () => {
    const res = makeRes();
    const err = new Error('Rate limited');
    err.statusCode = 429;
    errorHandler(err, makeReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('maps malformed JSON bodies to 400', () => {
    const res = makeRes();
    const err = new SyntaxError('Unexpected token');
    err.type = 'entity.parse.failed';
    errorHandler(err, makeReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('Malformed request body');
  });
});

describe('Not Found Handler', () => {
  it('returns a uniform 404 JSON response', () => {
    const json = vi.fn().mockReturnThis();
    const res = { status: vi.fn().mockReturnValue({ json }), json };
    const req = { method: 'POST', path: '/api/does-not-exist' };

    notFoundHandler(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error).toContain('Route not found');
    expect(body.error).toContain('POST /api/does-not-exist');
    expect(body.path).toBe('/api/does-not-exist');
  });
});
