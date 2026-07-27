/**
 * PERN Backend Server
 * - Express REST API
 * - Single MQTT subscription (shared with automation engine)
 * - ntfy push notifications
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mqtt = require('mqtt');
const fetch = require('node-fetch');
const { verifyLogtoToken } = require('./auth');
const db = require('./db');
const logger = require('./utils/logger');
const { validateEnv } = require('./utils/env-validator');
const rateLimiter = require('./middleware/rate-limiter');
const { requireRole, requireOrg } = require('./middleware/rbac');
const { sanitizeInput } = require('./middleware/sanitize');
const { validateSensorData } = require('./middleware/validator');
const requestLogger = require('./middleware/request-logger');

validateEnv();

const persistenceRoutes = require('./routes/persistence');
const chatbotRoutes = require('./routes/chatbot');
const aiToolsRoutes = require('./routes/ai-tools');
const automationEngine = require('./services/automation-engine');
const protocolRoutes = require('./routes/protocols');
const automationControlRoutes = require('./routes/automation-control');
const organizationRoutes = require('./routes/organizations');
const alertRoutes = require('./routes/alerts');
const notificationRoutes = require('./routes/notifications');
const deviceRoutes = require('./routes/devices');
const reportRoutes = require('./routes/reports');
const alertEngine = require('./services/alert-engine');
const notificationDispatcher = require('./services/notification-dispatcher');
const anomalyDetector = require('./services/anomaly-detector');
const { startActuatorWebSocket, stopActuatorWebSocket, broadcastNotification, broadcastSensorReading, broadcastAlert, broadcastActuatorStatus, broadcastDeviceHeartbeat, getClientCount } = require('./websocket/actuator-ws');
const protocolManager = require('./protocols/protocol-manager');
const deviceSimulator = require('./device-simulator');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust first proxy (for req.ip behind reverse proxies like nginx)
app.set('trust proxy', 1);

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'https://ntfy.sh', 'https://api.open-meteo.com', 'https://api.openaq.org'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS — restrict origins in all environments
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:80', 'http://localhost:8080'];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'X-User-Id'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '1mb' }));
app.use(sanitizeInput);
app.use(requestLogger);

logger.info('PERN Backend starting...');

// In-memory fallback arrays — used when PostgreSQL is unavailable.
// Capped to prevent unbounded memory growth.
let sensorReadings = [];
let automationRules = [];
let automationLogs = [];

// Process-level guards — never let an unhandled error crash the service
process.on('uncaughtException', (err) => {
  logger.error('[FATAL] uncaughtException', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('[FATAL] unhandledRejection', { reason: String(reason) });
});

// Single MQTT Broker connection (shared with automation engine)
const mqttClient = mqtt.connect(process.env.MQTT_BROKER || 'mqtt://localhost:1883', {
  clientId: `pern-backend-${Date.now()}`,
  reconnectPeriod: 3000,
});

mqttClient.on('connect', () => {
  logger.info('[MQTT] Connected to Mosquitto');
  mqttClient.subscribe('pern/sensors/+/data');
  mqttClient.subscribe('pern/devices/+/status');
  mqttClient.subscribe('pern/devices/+/heartbeat');
  mqttClient.subscribe('pern/devices/+/actuators/+/status');
  mqttClient.subscribe('pern/actuator-status');
});

// Make MQTT client available to routes
app.set('mqttClient', mqttClient);

mqttClient.on('error', (err) => {
  logger.error('[MQTT] Connection error', { error: err.message });
});

// Shared ingestion path for ANY device, regardless of transport
// (MQTT, HTTP, WebSocket). Stores, evaluates automation, and re-publishes
// to the MQTT broker so the frontend (which subscribes to MQTT) sees every
// connected device uniformly.
async function ingestReading(reading) {
  sensorReadings.unshift(reading);
  if (sensorReadings.length > 200) sensorReadings.pop();

  db.saveSensorReading(reading).catch(e => logger.error('[DB] Save sensor reading failed', { error: e.message }));
  db.saveDeviceReading(reading.device, reading.sensors).catch(e => logger.error('[DB] Save device reading failed', { error: e.message }));

  // Re-publish to MQTT so HTTP/WS devices reach the frontend too.
  // Skip if the reading already came from MQTT to avoid an infinite echo.
  if (mqttClient.connected && !reading._fromMqtt) {
    mqttClient.publish(`pern/sensors/${reading.device}/data`, JSON.stringify(reading));
  }

  // Broadcast to WebSocket clients (Dashboard, etc.)
  broadcastSensorReading(reading);

  // Fire-and-forget: automation, alerts, and anomaly detection must not
  // block the MQTT message handler or the event loop stalls.
  automationEngine.evaluateRules(reading).catch(e =>
    logger.warn('[Ingest] automation eval failed', { error: e.message }));

  alertEngine.evaluateAlertRules(reading).catch(e =>
    logger.warn('[Ingest] alert eval failed', { error: e.message }));

  // Run anomaly detection (synchronous — lightweight Z-score only)
  if (reading.sensors) {
    for (const [sensor, value] of Object.entries(reading.sensors)) {
      if (typeof value === 'number') {
        const result = anomalyDetector.analyze(reading.device, sensor, value);
        if (result.isAnomaly) {
          broadcastAlert({
            device: reading.device,
            sensor,
            level: 'warning',
            title: `Anomaly detected: ${sensor}`,
            detail: result.reason,
            timestamp: Date.now(),
          });
        }
      }
    }
  }
}

mqttClient.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    if (topic.includes('/sensors/') && payload.sensors) {
      const deviceId = payload.device || topic.split('/')[2];
      const reading = {
        device: deviceId,
        timestamp: payload.timestamp || Date.now(),
        sensors: payload.sensors,
        _fromMqtt: true,
      };

      // Auto-register device if new
      db.upsertDevice({
        id: deviceId,
        name: deviceId,
        type: 'mqtt-device',
        status: 'online',
        lastSeen: Date.now(),
      }).catch(() => {});

      await ingestReading(reading);
    }

    // Handle device status messages
    if (topic.includes('/devices/') && topic.includes('/status')) {
      const deviceId = topic.split('/')[2];
      if (deviceId) {
        db.upsertDevice({
          id: deviceId,
          name: payload.name || deviceId,
          type: payload.type || 'mqtt-device',
          status: payload.status || 'online',
          lastSeen: Date.now(),
        }).catch(() => {});
      }
    }

    // Handle device heartbeat (ESP32 health data)
    if (topic.includes('/devices/') && topic.includes('/heartbeat')) {
      const deviceId = topic.split('/')[2];
      if (deviceId) {
        db.saveDeviceHealth({
          deviceId,
          rssi: payload.rssi,
          freeHeap: payload.freeHeap,
          uptime: payload.uptime,
          firmwareVersion: payload.fwVersion,
          ip: payload.ip,
          wifiChannel: payload.wifiChannel,
          cpuFreq: payload.cpuFreq,
          actuators: payload.actuators || {},
        }).catch(e => logger.error('[DB] Save device health failed', { error: e.message }));

        // Broadcast heartbeat to frontend via WebSocket
        broadcastDeviceHeartbeat(payload);
      }
    }

    // Handle actuator status feedback from devices
    if ((topic.includes('/actuators/') && topic.includes('/status')) || topic === 'pern/actuator-status') {
      broadcastActuatorStatus({
        device: payload.device || topic.split('/')[2],
        actuator: payload.actuator,
        state: payload.state,
        source: payload.source || 'device',
        timestamp: payload.timestamp || Date.now(),
      });
    }
  } catch (e) {
    logger.error('[MQTT] Parse error', { error: e.message });
  }
});

async function sendNtfyNotification(notification) {
  const topic = process.env.NTFY_TOPIC || 'pern-platform-alerts-2026';
  const url = `https://ntfy.sh/${topic}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Title': notification.title,
        'Priority': notification.priority?.toString() || '4',
        'Tags': notification.tags?.join(',') || 'automation',
      },
      body: notification.message,
      signal: controller.signal,
    });
  } catch (err) {
    logger.error('[ntfy] Failed to send', { error: err.message });
  } finally {
    clearTimeout(timer);
  }
}

// JWT / Logto verification middleware.
// Enforces authentication when ENFORCE_AUTH=true. By default it degrades
// gracefully (no token required) so local development without a Logto
// instance keeps working.
const ENFORCE_AUTH = process.env.ENFORCE_AUTH === 'true';
app.use('/api', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      if (ENFORCE_AUTH) return res.status(401).json({ error: 'Authentication required' });
      return next();
    }
    const token = authHeader.replace('Bearer ', '');
    const result = await verifyLogtoToken(token);
    if (result.valid) {
      req.user = result.payload;
    } else if (ENFORCE_AUTH) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (err) {
    logger.error('[Auth] Middleware error', { error: err.message });
    if (ENFORCE_AUTH) return res.status(401).json({ error: 'Authentication error' });
  }

  // Multi-tenancy: attach organization / user context from headers
  const orgId = req.headers['x-organization-id'];
  const userId = req.headers['x-user-id'];
  if (orgId) req.orgId = orgId;
  if (userId) req.userId = userId;

  next();
});

// API Routes
app.get('/api/health', async (req, res) => {
  const dbStatus = db.isAvailable() ? 'ok' : 'unavailable (in-memory fallback)';
  res.json({
    status: 'ok',
    mqtt: mqttClient.connected,
    db: dbStatus,
    timestamp: Date.now(),
    persistence: 'enabled'
  });
});

app.get('/api/live/status', async (req, res) => {
  const dbStatus = db.isAvailable() ? 'ok' : 'in-memory';
  const deviceCount = (await db.getDevices().catch(() => [])).length;
  res.json({
    mqtt: mqttClient.connected,
    websocketClients: getClientCount(),
    db: dbStatus,
    devices: deviceCount,
    recentReadings: sensorReadings.length,
    uptime: process.uptime(),
    memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: Date.now(),
  });
});

app.use('/api/persistence', persistenceRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/ai-tools', aiToolsRoutes);

// Audit logs endpoint
app.get('/api/audit-logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const userId = req.query.userId || undefined;
    const resourceType = req.query.resourceType || undefined;
    const logs = await db.getAuditLogs({ limit, user_id: userId, resource_type: resourceType });
    res.json(logs.map(l => ({
      id: l.id, userId: l.user_id, action: l.action, resourceType: l.resource_type,
      resourceId: l.resource_id, details: l.details, ipAddress: l.ip_address, createdAt: l.created_at,
    })));
  } catch {
    res.json([]);
  }
});
app.use('/api/protocols', protocolRoutes);
app.use('/api/automation', automationControlRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/firmware', require('./routes/firmware'));
app.use('/api/reports', reportRoutes);
app.use('/api/export', require('./routes/export'));
app.use('/api/users', require('./routes/users'));
app.use('/api/seed', require('./routes/seed'));

// OpenAQ proxy — avoids CORS issues when frontend calls external API
app.get('/api/openaq', async (req, res) => {
  const { city, parameter } = req.query;
  if (!city) return res.status(400).json({ error: 'city is required' });
  try {
    const params = new URLSearchParams({
      city,
      parameter: parameter || 'pm25,no2,o3',
      limit: '10',
      sort: 'desc',
      order_by: 'datetime',
    });
    const response = await fetch(`https://api.openaq.org/v2/latest?${params}`);
    if (!response.ok) throw new Error(`OpenAQ ${response.status}`);
    const data = await response.json();
    if (!data.results || data.results.length === 0) return res.json({ location: city, pm25: null, no2: null, o3: null, timestamp: null });
    const readings = {};
    data.results.forEach((r) => {
      if (r.parameter === 'pm25') readings.pm25 = r.value;
      if (r.parameter === 'no2') readings.no2 = r.value;
      if (r.parameter === 'o3') readings.o3 = r.value;
    });
    res.json({ location: city, ...readings, timestamp: data.results[0]?.date?.utc || null });
  } catch (err) {
    logger.warn('[OpenAQ] Proxy failed', { city, error: err.message });
    res.json({ location: city, pm25: null, no2: null, o3: null, timestamp: null, error: err.message });
  }
});

// Rate limits for write endpoints (60 requests/min)
const coreWriteLimiter = rateLimiter(60000, 60);
const sensorWriteLimiter = rateLimiter(60000, 120);

// Audit log middleware — logs the write event after response is sent
function auditLog(action, resourceType) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Log after response is sent (non-blocking)
      process.nextTick(() => {
        db.logAuditEvent({
          user_id: req.userId || req.user?.sub || 'anonymous',
          action,
          resource_type: resourceType,
          resource_id: String(req.params.id || req.body?.id || ''),
          details: { method: req.method, path: req.path },
          ip_address: req.ip || '',
        }).catch(() => {});
      });
      return originalJson(body);
    };
    next();
  };
}

app.get('/api/sensors', async (req, res) => {
  try {
    const dbReadings = await db.getRecentReadings(40);
    const normalized = dbReadings.map(r => ({ ...r, device: r.device_id || r.device }));
    res.json(normalized.length > 0 ? normalized : sensorReadings.slice(0, 30));
  } catch {
    res.json(sensorReadings.slice(0, 30));
  }
});

app.post('/api/sensors', sensorWriteLimiter, validateSensorData, auditLog('sensors.ingest', 'sensor_reading'), async (req, res) => {
  const reading = req.body;
  if (!reading || typeof reading !== 'object' || !reading.sensors || typeof reading.sensors !== 'object') {
    return res.status(400).json({ error: 'Invalid reading: expected { device?, sensors: {} }' });
  }
  // Persist through the canonical ingestion path (DB + MQTT re-publish + automation)
  try {
    await ingestReading({
      device: reading.device || 'http-device',
      timestamp: reading.timestamp || Date.now(),
      sensors: reading.sensors,
    });
    res.json({ success: true });
  } catch (e) {
    logger.error('[API] POST /api/sensors ingest failed', { error: e.message });
    res.status(500).json({ error: 'Failed to ingest reading' });
  }
});

// ---- Persisted time-series & alert APIs ----

// EHI history (sent from frontend once computed from real data)
app.post('/api/ehi-history', coreWriteLimiter, async (req, res) => {
  const { deviceId, ehi, category } = req.body;
  if (typeof ehi !== 'number') return res.status(400).json({ error: 'ehi required' });
  try {
    await db.saveEHIHistory(deviceId, ehi, category);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ehi-history', async (req, res) => {
  const deviceId = req.query.device;
  const { from, to } = req.query;
  try {
    let rows;
    if (deviceId) {
      rows = await db.getEHIHistory(deviceId, 500, { from, to });
    } else {
      // Return all devices' history when no device specified
      const devices = await db.getDevices();
      const allRows = [];
      for (const d of devices) {
        const r = await db.getEHIHistory(d.id, 200, { from, to });
        allRows.push(...r);
      }
      rows = allRows.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)).slice(-500);
    }
    res.json(rows.map(r => ({ ehi: Number(r.ehi), category: r.category, recordedAt: r.recorded_at })));
  } catch {
    res.json([]);
  }
});

// NOTE: Device CRUD endpoints are now in routes/devices.js

app.get('/api/alerts', async (req, res) => {
  try {
    const rows = await db.getAlerts(req.query.device, 50);
    res.json(rows.map(r => ({
      id: r.id, deviceId: r.device_id, sensor: r.sensor, level: r.level,
      title: r.title, detail: r.detail, acknowledged: r.acknowledged, createdAt: r.created_at,
    })));
  } catch {
    res.json([]);
  }
});

app.post('/api/alerts', coreWriteLimiter, auditLog('alert.create', 'alert'), async (req, res) => {
  try {
    const row = await db.saveAlert(req.body);
    res.json({ success: true, id: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alerts/:id/acknowledge', coreWriteLimiter, async (req, res) => {
  try {
    await db.acknowledgeAlert(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/thresholds', async (req, res) => {
  try {
    const rows = await db.getThresholds();
    res.json(rows);
  } catch {
    res.json([]);
  }
});

app.post('/api/thresholds', coreWriteLimiter, requireRole('admin', 'manager'), auditLog('threshold.save', 'threshold'), async (req, res) => {
  const { sensor, min, max, enabled } = req.body;
  if (!sensor) return res.status(400).json({ error: 'sensor required' });
  try {
    await db.saveThreshold(sensor, min, max, enabled !== false);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/automation/rules', async (req, res) => {
  try {
    const rules = await db.getAutomationRules();
    res.json(rules.length > 0 ? rules : automationRules);
  } catch {
    res.json(automationRules);
  }
});

app.post('/api/automation/rules', coreWriteLimiter, requireRole('admin', 'manager'), auditLog('rule.save', 'automation_rule'), async (req, res) => {
  const rule = { ...req.body, id: req.body.id || 'r' + Date.now() };
  try {
    await db.saveAutomationRule(rule);
    automationRules.push(rule);
    automationEngine.reloadRules(automationRules);
    res.json(rule);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/automation/rules/:id', coreWriteLimiter, requireRole('admin'), auditLog('rule.delete', 'automation_rule'), async (req, res) => {
  try {
    automationRules = automationRules.filter(r => r.id !== req.params.id);
    await db.deleteAutomationRule(req.params.id);
    automationEngine.reloadRules(automationRules);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/automation/logs', async (req, res) => {
  try {
    const logs = await db.getAutomationLogs();
    res.json(logs.length > 0 ? logs : automationLogs);
  } catch {
    res.json(automationLogs);
  }
});

app.post('/api/notifications/send', coreWriteLimiter, async (req, res) => {
  try {
    await sendNtfyNotification(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Actuator commands routed through backend (audit trail) ----
app.post('/api/actuators/command', coreWriteLimiter, auditLog('actuator.command', 'actuator'), async (req, res) => {
  const { deviceId, actuator, command, params } = req.body || {};
  if (!deviceId || !actuator || !command) {
    return res.status(400).json({ error: 'deviceId, actuator, and command are required' });
  }

  const validCommands = ['on', 'off', 'set'];
  if (!validCommands.includes(command)) {
    return res.status(400).json({ error: `command must be one of: ${validCommands.join(', ')}` });
  }

  const logEntry = {
    deviceId,
    actuator,
    command,
    params: params || {},
    userId: req.userId || req.user?.sub || 'anonymous',
    orgId: req.orgId || 'default',
    timestamp: Date.now(),
  };

  // Persist audit log
  try {
    await db.logActuatorCommand(logEntry);
  } catch (err) {
    logger.warn('[Actuator] Failed to persist audit log', { error: err.message });
  }

  // Publish to MQTT so physical actuator receives the command
  const mqttTopic = `pern/devices/${deviceId}/actuators/${actuator}/command`;
  const mqttPayload = JSON.stringify({ command, params, ...logEntry });

  if (mqttClient.connected) {
    mqttClient.publish(mqttTopic, mqttPayload, { qos: 1 }, (err) => {
      if (err) {
        logger.error('[Actuator] MQTT publish failed', { error: err.message, topic: mqttTopic });
        return res.status(502).json({ error: 'Failed to publish command to device' });
      }
      logger.info('[Actuator] Command published', { deviceId, actuator, command, userId: logEntry.userId });
      res.json({ success: true, topic: mqttTopic, auditId: logEntry.timestamp });
    });
  } else {
    logger.warn('[Actuator] MQTT offline — command queued but not delivered', { deviceId, actuator, command });
    res.json({ success: true, warning: 'MQTT broker offline — command logged but not delivered', auditId: logEntry.timestamp });
  }
});

// Root cause analysis is now in routes/ai-tools.js

// Global error handler (MUST be last)
const errorHandler = require('./middleware/error-handler');
app.use(errorHandler);

// Initialize database then load rules, then start simulator
(async () => {
  try {
    await db.initDatabase();
    const rules = await db.getAutomationRules();
    if (rules.length > 0) {
      automationRules = rules;
    } else {
      automationRules = [
        { id: 'r1', name: 'High PM2.5', sensor: 'pm25', operator: '>', threshold: 45, action: { type: 'ntfy' }, enabled: true },
        { id: 'r2', name: 'Low pH', sensor: 'ph', operator: '<', threshold: 6.6, action: { type: 'ntfy' }, enabled: true },
      ];
    }
    automationEngine.reloadRules(automationRules);
    logger.info('Database initialized and rules loaded');

    // Start simulator only AFTER db is ready so writes go to PostgreSQL
    if (process.env.ENABLE_SIMULATOR === 'true') {
      deviceSimulator.start();
    }
  } catch (err) {
    logger.error('[DB] Init error', { error: err.message });
  }
})();

// Start automation engine
automationEngine.setMqttClient(mqttClient);
automationEngine.setBroadcastAlert(broadcastAlert);
automationEngine.start();
logger.info('Automation Engine started');

// Start WebSocket server for actuator feedback
startActuatorWebSocket(8081);

// Wire notification dispatcher to broadcast via actuator WS
notificationDispatcher.setWsBroadcaster(broadcastNotification, getClientCount);

// Wire alert engine to broadcast alerts via actuator WS
alertEngine.setBroadcastAlert(broadcastAlert);

logger.info('All routes mounted successfully');

const httpServer = app.listen(PORT, () => {
  logger.info(`PERN Backend running on http://localhost:${PORT}`);
  if (!process.env.OPENROUTER_API_KEY) {
    logger.warn('[Config] OPENROUTER_API_KEY not set — AI features will fail at runtime');
  }
  protocolManager.startAll();

  // Bridge every protocol (MQTT, HTTP, WebSocket) into the shared ingestion
  // path so all device types surface to the frontend uniformly.
  protocolManager.onData((data) => {
    if (data && data.sensors) {
      ingestReading({
        device: data.device,
        timestamp: data.timestamp || Date.now(),
        sensors: data.sensors,
      }).catch(e => logger.error('[Protocol] Ingest error', { error: e.message }));
    }
  });

  // Start alert escalation checker (every 60s)
  escalationInterval = alertEngine.startEscalationChecker(60000);

  // Start data retention cleanup (every hour)
  const dataRetention = require('./services/data-retention');
  dataRetention.start(3600000);
});

httpServer.on('error', (err) => {
  logger.error('[HTTP] Server error', { error: err.message });
});

let shuttingDown = false;
let escalationInterval = null;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[SHUTDOWN] ${signal} received — closing connections`);
  if (escalationInterval) clearInterval(escalationInterval);
  deviceSimulator.stop();
  protocolManager.stopAll?.();
  try { stopActuatorWebSocket(); } catch (e) { /* noop */ }
  try { mqttClient.end(true); } catch (e) { /* noop */ }
  try { await db.pool.end(); } catch (e) { /* noop */ }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
