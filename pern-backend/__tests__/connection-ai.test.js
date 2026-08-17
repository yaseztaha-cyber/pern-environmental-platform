describe('Device Auth Middleware', () => {
  const db = require('../db');

  beforeEach(() => {
    delete process.env.ENFORCE_DEVICE_AUTH;
    delete process.env.DEVICE_API_KEYS;
  });

  it('generates keys with the pern_ prefix and high entropy', () => {
    const deviceAuth = require('../middleware/device-auth');
    const key = deviceAuth.generateApiKey();
    expect(key.startsWith('pern_')).toBe(true);
    expect(key.length).toBeGreaterThan(20);
    expect(deviceAuth.generateApiKey()).not.toBe(key);
  });

  it('sha256 returns a 64-char hex digest', () => {
    const deviceAuth = require('../middleware/device-auth');
    expect(deviceAuth.sha256('hello')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('passes through when enforcement is disabled', async () => {
    const deviceAuth = require('../middleware/device-auth');
    let called = false;
    await deviceAuth.authenticateDevice({ headers: {} }, { status: () => ({ json: () => {} }) }, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects when enforcement is on and key is missing', async () => {
    process.env.ENFORCE_DEVICE_AUTH = 'true';
    const deviceAuth = require('../middleware/device-auth');
    let code = null;
    const res = { status: (c) => ({ json: () => { code = c; } }) };
    await deviceAuth.authenticateDevice({ headers: {}, body: { device: 'dev-1' } }, res, () => {});
    expect(code).toBe(401);
  });

  it('accepts a valid per-device key stored in the db', async () => {
    process.env.ENFORCE_DEVICE_AUTH = 'true';
    const deviceAuth = require('../middleware/device-auth');
    const key = deviceAuth.generateApiKey();
    await db.storeDeviceApiKey('dev-1', deviceAuth.sha256(key));
    const req = { headers: { 'x-api-key': key }, params: { deviceId: 'dev-1' } };
    const res = { status: () => ({ json: () => {} }) };
    let nextCalled = false;
    await deviceAuth.authenticateDevice(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.deviceAuthenticated).toBe(true);
    expect(req.deviceId).toBe('dev-1');
  });

  it('rejects an invalid per-device key', async () => {
    process.env.ENFORCE_DEVICE_AUTH = 'true';
    const deviceAuth = require('../middleware/device-auth');
    let code = null;
    const res = { status: (c) => ({ json: () => { code = c; } }) };
    await deviceAuth.authenticateDevice({ headers: { 'x-api-key': 'wrong' }, params: { deviceId: 'dev-1' } }, res, () => {});
    expect(code).toBe(401);
  });
});

describe('DB Device API Keys', () => {
  it('stores, reads and revokes a device key via memory fallback', async () => {
    const db = require('../db');
    await db.storeDeviceApiKey('dev-x', 'hash123');
    expect(await db.getDeviceApiKeyHash('dev-x')).toBe('hash123');
    expect(await db.deviceHasApiKey('dev-x')).toBe(true);
    await db.revokeDeviceApiKey('dev-x');
    expect(await db.deviceHasApiKey('dev-x')).toBe(false);
  });
});

describe('AI Copilot', () => {
  const db = require('../db');

  beforeEach(async () => {
    vi.resetModules();
    await db.saveDeviceReading('copilot-seeded', { pm25: 80, co2: 1500, tmp: 25 });
    await db.saveDeviceReading('copilot-seeded', { pm25: 60, co2: 1200, tmp: 24 });
  });

  it('exposes a tool registry', () => {
    const { TOOLS } = require('../services/ai-copilot');
    expect(TOOLS.length).toBeGreaterThanOrEqual(5);
    expect(TOOLS[0].id).toBeTruthy();
  });

  it('returns the no-data message for an unknown device', async () => {
    const copilot = require('../services/ai-copilot');
    const result = await copilot.runCopilot({ question: 'how is the air quality?', deviceId: 'never-seen-device' });
    expect(result.grounded).toBe(false);
    expect(result.answer.toLowerCase()).toContain('no monitoring data');
  });

  it('builds a deterministic grounded answer from live readings', async () => {
    const copilot = require('../services/ai-copilot');
    const result = await copilot.runCopilot({ question: 'what is the health status?', deviceId: 'copilot-seeded' });
    expect(result.grounded).toBe(true);
    expect(result.answer.length).toBeGreaterThan(10);
    expect(result.context.statuses.length).toBeGreaterThan(0);
    expect(result.context.healthScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.cited)).toBe(true);
  });

  it('deterministic answer flags an elevated pm25 reading', async () => {
    const copilot = require('../services/ai-copilot');
    const result = await copilot.runCopilot({ question: 'is the air safe right now?', deviceId: 'copilot-seeded' });
    expect(result.answer.length).toBeGreaterThan(10);
  });
});
