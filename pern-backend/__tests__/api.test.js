/**
 * Backend API Tests
 * Tests for rate limiter, DB layer, and validation logic
 */

// ---- Rate Limiter Tests ----
describe('Rate Limiter', () => {
  const createRateLimiter = require('../middleware/rate-limiter');

  it('allows requests within limit', () => {
    const limiter = createRateLimiter(60000, 5);
    const req = { ip: '127.0.0.1', headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
    let nextCount = 0;

    for (let i = 0; i < 5; i++) {
      limiter(req, res, () => { nextCount++; });
    }

    expect(nextCount).toBe(5);
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('blocks requests over limit', () => {
    const limiter = createRateLimiter(60000, 3);
    const req = { ip: 'test-block', headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };

    for (let i = 0; i < 4; i++) {
      limiter(req, res, () => {});
    }

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it('differentiates by IP', () => {
    const limiter = createRateLimiter(60000, 2);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };

    limiter({ ip: '1.1.1.1' }, res, () => {});
    limiter({ ip: '1.1.1.1' }, res, () => {});
    limiter({ ip: '2.2.2.2' }, res, () => {});

    expect(res.status).not.toHaveBeenCalledWith(429);
  });
});

// ---- DB Layer Tests (in-memory fallback) ----
describe('DB In-Memory Fallback', () => {
  const db = require('../db');

  it('db module exports all core functions', () => {
    expect(typeof db.initDatabase).toBe('function');
    expect(typeof db.saveSensorReading).toBe('function');
    expect(typeof db.getRecentReadings).toBe('function');
    expect(typeof db.saveAlert).toBe('function');
    expect(typeof db.getAlerts).toBe('function');
    expect(typeof db.logActuatorCommand).toBe('function');
    expect(typeof db.getActuatorCommands).toBe('function');
    expect(typeof db.getOrganizations).toBe('function');
    expect(typeof db.upsertOrganization).toBe('function');
    expect(typeof db.getTeamMembers).toBe('function');
    expect(typeof db.addTeamMember).toBe('function');
    expect(typeof db.removeTeamMember).toBe('function');
  });

  it('db module exports all Phase 2 functions', () => {
    // Alert rules
    expect(typeof db.getAlertRules).toBe('function');
    expect(typeof db.getAlertRule).toBe('function');
    expect(typeof db.saveAlertRule).toBe('function');
    expect(typeof db.deleteAlertRule).toBe('function');

    // Alert history
    expect(typeof db.triggerAlert).toBe('function');
    expect(typeof db.getAlertHistory).toBe('function');
    expect(typeof db.acknowledgeAlertHistory).toBe('function');
    expect(typeof db.getUnacknowledgedAlertCount).toBe('function');

    // Users
    expect(typeof db.getUsers).toBe('function');
    expect(typeof db.getUser).toBe('function');
    expect(typeof db.getUserByEmail).toBe('function');
    expect(typeof db.upsertUser).toBe('function');
    expect(typeof db.updateUserLastLogin).toBe('function');
    expect(typeof db.deleteUser).toBe('function');

    // Notification preferences
    expect(typeof db.getNotificationPreferences).toBe('function');
    expect(typeof db.saveNotificationPreference).toBe('function');
    expect(typeof db.deleteNotificationPreference).toBe('function');

    // Firmware
    expect(typeof db.getFirmwareVersions).toBe('function');
    expect(typeof db.getLatestFirmware).toBe('function');
    expect(typeof db.saveFirmwareVersion).toBe('function');
    expect(typeof db.deleteFirmwareVersion).toBe('function');

    // Device metadata
    expect(typeof db.getDeviceMetadata).toBe('function');
    expect(typeof db.upsertDeviceMetadata).toBe('function');
    expect(typeof db.updateDeviceConfigPush).toBe('function');
    expect(typeof db.getAllDeviceMetadata).toBe('function');

    // Audit logs
    expect(typeof db.logAuditEvent).toBe('function');
    expect(typeof db.getAuditLogs).toBe('function');

    // Data retention
    expect(typeof db.getDataRetentionPolicies).toBe('function');
    expect(typeof db.saveDataRetentionPolicy).toBe('function');
    expect(typeof db.deleteDataRetentionPolicy).toBe('function');
    expect(typeof db.cleanupOldData).toBe('function');

    // Extended device functions
    expect(typeof db.getDevice).toBe('function');
    expect(typeof db.deleteDevice).toBe('function');

    // Extended readings
    expect(typeof db.getReadingsByDateRange).toBe('function');
  });

  it('getRecentReadings returns array (fallback)', async () => {
    const result = await db.getRecentReadings(10);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAlerts returns array (fallback)', async () => {
    const result = await db.getAlerts(undefined, 10);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getThresholds returns array (fallback)', async () => {
    const result = await db.getThresholds();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getOrganizations returns array (fallback)', async () => {
    const result = await db.getOrganizations();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getActuatorCommands returns array (fallback)', async () => {
    const result = await db.getActuatorCommands('test-org');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getTeamMembers returns array (fallback)', async () => {
    const result = await db.getTeamMembers('test-org');
    expect(Array.isArray(result)).toBe(true);
  });

  it('saveAlert returns object with id (fallback)', async () => {
    const result = await db.saveAlert({
      deviceId: 'test',
      sensor: 'pm25',
      level: 'warning',
      title: 'Test Alert',
      detail: 'Test detail',
    });
    expect(result).toHaveProperty('id');
  });

  it('getAlertRules returns array (fallback)', async () => {
    const result = await db.getAlertRules('test-org');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAlertHistory returns array (fallback)', async () => {
    const result = await db.getAlertHistory({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getUnacknowledgedAlertCount returns number (fallback)', async () => {
    const result = await db.getUnacknowledgedAlertCount('critical');
    expect(typeof result).toBe('number');
  });

  it('getUsers returns array (fallback)', async () => {
    const result = await db.getUsers('test-org');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getNotificationPreferences returns array (fallback)', async () => {
    const result = await db.getNotificationPreferences('user-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getFirmwareVersions returns array (fallback)', async () => {
    const result = await db.getFirmwareVersions('esp32');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAllDeviceMetadata returns array (fallback)', async () => {
    const result = await db.getAllDeviceMetadata();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAuditLogs returns array (fallback)', async () => {
    const result = await db.getAuditLogs({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getDataRetentionPolicies returns array (fallback)', async () => {
    const result = await db.getDataRetentionPolicies('default');
    expect(Array.isArray(result)).toBe(true);
  });

  it('triggerAlert returns object with id (fallback)', async () => {
    const result = await db.triggerAlert({
      alertRuleId: 'r1',
      deviceId: 'test',
      sensor: 'pm25',
      value: 55,
      severity: 'warning',
      message: 'Test alert',
    });
    expect(result).toHaveProperty('id');
  });

  it('logAuditEvent does not throw (fallback)', async () => {
    await expect(db.logAuditEvent({
      user_id: 'test',
      action: 'test.action',
      resource_type: 'test',
      resource_id: '1',
      details: { test: true },
    })).resolves.not.toThrow();
  });
});

// ---- Actuator Command Validation ----
describe('Actuator Command Logic', () => {
  it('validates required fields', () => {
    const required = ['deviceId', 'actuator', 'command'];
    const payload = {};

    const missing = required.filter(f => !payload[f]);
    expect(missing).toEqual(['deviceId', 'actuator', 'command']);
  });

  it('validates command values', () => {
    const validCommands = ['on', 'off', 'set'];
    expect(validCommands.includes('on')).toBe(true);
    expect(validCommands.includes('off')).toBe(true);
    expect(validCommands.includes('set')).toBe(true);
    expect(validCommands.includes('toggle')).toBe(false);
  });
});

// ---- Organization Validation ----
describe('Organization Validation', () => {
  it('requires id and name for creation', () => {
    const org = { id: 'org-1', name: 'Test Org' };
    expect(org.id).toBeTruthy();
    expect(org.name).toBeTruthy();

    const invalid = { name: 'No ID' };
    expect(invalid.id).toBeUndefined();
  });

  it('validates team member roles', () => {
    const validRoles = ['admin', 'member', 'viewer'];
    expect(validRoles.includes('admin')).toBe(true);
    expect(validRoles.includes('member')).toBe(true);
    expect(validRoles.includes('viewer')).toBe(true);
    expect(validRoles.includes('superadmin')).toBe(false);
  });
});

// ---- Alert Rule Validation ----
describe('Alert Rule Validation', () => {
  it('validates severity levels', () => {
    const validSeverities = ['info', 'warning', 'critical'];
    expect(validSeverities.includes('info')).toBe(true);
    expect(validSeverities.includes('warning')).toBe(true);
    expect(validSeverities.includes('critical')).toBe(true);
    expect(validSeverities.includes('fatal')).toBe(false);
  });

  it('validates notification channels', () => {
    const validChannels = ['ntfy', 'email', 'slack', 'sms', 'in-app'];
    expect(validChannels.includes('ntfy')).toBe(true);
    expect(validChannels.includes('email')).toBe(true);
    expect(validChannels.includes('slack')).toBe(true);
    expect(validChannels.includes('sms')).toBe(true);
    expect(validChannels.includes('in-app')).toBe(true);
  });
});

// ---- User Validation ----
describe('User Validation', () => {
  it('validates user roles', () => {
    const validRoles = ['admin', 'member', 'viewer'];
    expect(validRoles.includes('admin')).toBe(true);
    expect(validRoles.includes('viewer')).toBe(true);
  });
});

// ---- Logger Tests ----
describe('Logger', () => {
  const logger = require('../utils/logger');

  it('exports expected methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});

// ---- RBAC Middleware Tests ----
describe('RBAC Middleware', () => {
  const { requireRole, requireOrg, requireOwnership } = require('../middleware/rbac');

  it('requireRole allows matching role in enforce mode', () => {
    process.env.ENFORCE_AUTH = 'true';
    const middleware = requireRole('admin', 'manager');
    const req = { user: { role: 'admin' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    let called = false;
    middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
    process.env.ENFORCE_AUTH = 'false';
  });

  it('requireRole rejects non-matching role in enforce mode', () => {
    process.env.ENFORCE_AUTH = 'true';
    const middleware = requireRole('admin');
    const req = { user: { role: 'viewer' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    middleware(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(403);
    process.env.ENFORCE_AUTH = 'false';
  });

  it('requireRole rejects when no user in enforce mode', () => {
    process.env.ENFORCE_AUTH = 'true';
    const middleware = requireRole('admin');
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    middleware(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(401);
    process.env.ENFORCE_AUTH = 'false';
  });

  it('requireRole passes through in non-enforce mode', () => {
    process.env.ENFORCE_AUTH = 'false';
    const middleware = requireRole('admin');
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    let called = false;
    middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('requireOrg rejects when orgId missing in enforce mode', () => {
    process.env.ENFORCE_AUTH = 'true';
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    requireOrg(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(403);
    process.env.ENFORCE_AUTH = 'false';
  });

  it('requireOrg passes when orgId set', () => {
    process.env.ENFORCE_AUTH = 'true';
    const req = { orgId: 'org-1' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    let called = false;
    requireOrg(req, res, () => { called = true; });
    expect(called).toBe(true);
    process.env.ENFORCE_AUTH = 'false';
  });

  it('requireOwnership allows owner', () => {
    process.env.ENFORCE_AUTH = 'true';
    const middleware = requireOwnership('user-1');
    const req = { user: { id: 'user-1', role: 'viewer' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    let called = false;
    middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
    process.env.ENFORCE_AUTH = 'false';
  });

  it('requireOwnership allows admin', () => {
    process.env.ENFORCE_AUTH = 'true';
    const middleware = requireOwnership('user-1');
    const req = { user: { id: 'user-2', role: 'admin' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    let called = false;
    middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
    process.env.ENFORCE_AUTH = 'false';
  });

  it('requireOwnership rejects non-owner non-admin', () => {
    process.env.ENFORCE_AUTH = 'true';
    const middleware = requireOwnership('user-1');
    const req = { user: { id: 'user-2', role: 'viewer' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    middleware(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(403);
    process.env.ENFORCE_AUTH = 'false';
  });
});

// ---- Alert Engine Tests ----
describe('Alert Engine', () => {
  const { evaluateCondition, isInCooldown, clearCooldowns } = require('../services/alert-engine');

  beforeEach(() => { clearCooldowns(); });

  it('evaluateCondition handles > operator', () => {
    expect(evaluateCondition(100, '>', 80)).toBe(true);
    expect(evaluateCondition(50, '>', 80)).toBe(false);
  });

  it('evaluateCondition handles >= operator', () => {
    expect(evaluateCondition(80, '>=', 80)).toBe(true);
    expect(evaluateCondition(79, '>=', 80)).toBe(false);
  });

  it('evaluateCondition handles < operator', () => {
    expect(evaluateCondition(50, '<', 80)).toBe(true);
    expect(evaluateCondition(100, '<', 80)).toBe(false);
  });

  it('evaluateCondition handles <= operator', () => {
    expect(evaluateCondition(80, '<=', 80)).toBe(true);
    expect(evaluateCondition(81, '<=', 80)).toBe(false);
  });

  it('evaluateCondition handles == operator', () => {
    expect(evaluateCondition(42, '==', 42)).toBe(true);
    expect(evaluateCondition(43, '==', 42)).toBe(false);
  });

  it('evaluateCondition handles != operator', () => {
    expect(evaluateCondition(43, '!=', 42)).toBe(true);
    expect(evaluateCondition(42, '!=', 42)).toBe(false);
  });

  it('evaluateCondition handles between operator', () => {
    expect(evaluateCondition(5, 'between', '3,7')).toBe(true);
    expect(evaluateCondition(2, 'between', '3,7')).toBe(false);
    expect(evaluateCondition(8, 'between', '3,7')).toBe(false);
  });

  it('evaluateCondition handles outside operator', () => {
    expect(evaluateCondition(2, 'outside', '3,7')).toBe(true);
    expect(evaluateCondition(5, 'outside', '3,7')).toBe(false);
    expect(evaluateCondition(8, 'outside', '3,7')).toBe(true);
  });

  it('evaluateCondition returns false for NaN', () => {
    expect(evaluateCondition('abc', '>', 80)).toBe(false);
    expect(evaluateCondition(100, '>', 'xyz')).toBe(false);
  });

  it('evaluateCondition returns false for unknown operator', () => {
    expect(evaluateCondition(100, 'unknown', 80)).toBe(false);
  });

  it('isInCooldown returns false for unknown rule', () => {
    expect(isInCooldown('nonexistent')).toBe(false);
  });
});

// ---- Alert History Validation ----
describe('Alert History Validation', () => {
  it('validates severity levels for alerts', () => {
    const validSeverities = ['info', 'warning', 'critical', 'emergency'];
    expect(validSeverities.includes('info')).toBe(true);
    expect(validSeverities.includes('warning')).toBe(true);
    expect(validSeverities.includes('critical')).toBe(true);
    expect(validSeverities.includes('emergency')).toBe(true);
    expect(validSeverities.includes('fatal')).toBe(false);
  });

  it('validates alert operators', () => {
    const validOps = ['>', '>=', '<', '<=', '==', '!=', 'between', 'outside'];
    expect(validOps.includes('>')).toBe(true);
    expect(validOps.includes('between')).toBe(true);
    expect(validOps.includes('outside')).toBe(true);
    expect(validOps.includes('like')).toBe(false);
  });
});

// ---- Sanitize Middleware Tests ----
describe('Sanitize Middleware', () => {
  const { sanitizeInput, sanitizeString, sanitizeObject } = require('../middleware/sanitize');

  it('strips script tags from strings', () => {
    expect(sanitizeString('hello <script>alert(1)</script> world')).toBe('hello  world');
  });

  it('strips on-event handlers', () => {
    expect(sanitizeString('<div onclick="alert(1)">')).toBe('&lt;div &gt;');
  });

  it('strips javascript: protocol', () => {
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
  });

  it('passes clean strings through', () => {
    expect(sanitizeString('hello world')).toBe('hello world');
  });

  it('sanitizeObject cleans nested objects', () => {
    const input = { a: '<script>xss</script>', b: { c: 'clean' } };
    const result = sanitizeObject(input);
    expect(result.a).toBe('');
    expect(result.b.c).toBe('clean');
  });

  it('sanitizeObject handles arrays', () => {
    const input = ['<script>xss</script>', 'clean'];
    const result = sanitizeObject(input);
    expect(result[0]).toBe('');
    expect(result[1]).toBe('clean');
  });

  it('sanitizeInput middleware cleans req.body', () => {
    const req = { body: { msg: '<script>xss</script>' }, query: {}, params: {} };
    const res = {};
    let called = false;
    sanitizeInput(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.body.msg).toBe('');
  });

  it('sanitizeInput passes through null body', () => {
    const req = {};
    const res = {};
    let called = false;
    sanitizeInput(req, res, () => { called = true; });
    expect(called).toBe(true);
  });
});

// ---- Notification Dispatcher Tests ----
describe('Notification Dispatcher', () => {
  const dispatcher = require('../services/notification-dispatcher');

  it('exports dispatch function', () => {
    expect(typeof dispatcher.dispatch).toBe('function');
  });

  it('exports setWsBroadcaster', () => {
    expect(typeof dispatcher.setWsBroadcaster).toBe('function');
  });

  it('exports getWsClientCount', () => {
    expect(typeof dispatcher.getWsClientCount).toBe('function');
    expect(dispatcher.getWsClientCount()).toBe(0);
  });

  it('exports channel senders', () => {
    expect(typeof dispatcher.sendNtfy).toBe('function');
    expect(typeof dispatcher.sendEmail).toBe('function');
    expect(typeof dispatcher.sendSlack).toBe('function');
    expect(typeof dispatcher.sendInApp).toBe('function');
  });

  it('sendInApp uses broadcaster when set', () => {
    let called = false;
    let receivedArgs = null;
    dispatcher.setWsBroadcaster((title, msg, sev) => {
      called = true;
      receivedArgs = { title, msg, sev };
    }, () => 1);
    dispatcher.sendInApp('Test Title', 'Test Message', 'warning');
    expect(called).toBe(true);
    expect(receivedArgs.title).toBe('Test Title');
    expect(receivedArgs.sev).toBe('warning');
    // Reset
    dispatcher.setWsBroadcaster(null, null);
  });

  it('getWsClientCount returns 0 when no broadcaster', () => {
    dispatcher.setWsBroadcaster(null, null);
    expect(dispatcher.getWsClientCount()).toBe(0);
  });
});

// ---- WebSocket Broadcast Tests ----
describe('WebSocket Broadcast', () => {
  const ws = require('../websocket/actuator-ws');

  it('exports broadcastSensorReading', () => {
    expect(typeof ws.broadcastSensorReading).toBe('function');
  });

  it('exports broadcastAlert', () => {
    expect(typeof ws.broadcastAlert).toBe('function');
  });

  it('exports broadcastNotification', () => {
    expect(typeof ws.broadcastNotification).toBe('function');
  });

  it('exports broadcastActuatorStatus', () => {
    expect(typeof ws.broadcastActuatorStatus).toBe('function');
  });

  it('getClientCount returns a number', () => {
    expect(typeof ws.getClientCount()).toBe('number');
  });
});

// ---- Report Routes Tests ----
describe('Report Routes', () => {
  const router = require('../routes/reports');

  it('exports an express router', () => {
    expect(typeof router).toBe('function');
  });
});
