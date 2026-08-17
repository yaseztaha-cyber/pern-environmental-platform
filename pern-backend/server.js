/**
 * PERN Backend Server
 * - Express REST API
 * - Single MQTT subscription (shared with automation engine)
 * - ntfy push notifications
 */

require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mqtt = require('mqtt');
const fetch = require('node-fetch');
const { authenticateToken } = require('./auth');
const authRoutes = require('./routes/auth');
const db = require('./db');
const logger = require('./utils/logger');
const { validateEnv } = require('./utils/env-validator');
const rateLimiter = require('./middleware/rate-limiter');
const { requireRole, requireOrg } = require('./middleware/rbac');
const { sanitizeInput } = require('./middleware/sanitize');
const { validateSensorData } = require('./middleware/validator');
const requestLogger = require('./middleware/request-logger');
const { enhancedSecurityHeaders } = require('./middleware/security-headers');
const { validateQueryParams } = require('./middleware/query-validator');
const { auditLogger, withAuditLabel } = require('./middleware/audit-logger');
const { bruteForceProtection } = require('./middleware/brute-force');
const { csrfProtection, csrfTokenEndpoint } = require('./middleware/csrf');

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
const { startActuatorWebSocket, stopActuatorWebSocket, broadcastNotification, broadcastSensorReading, broadcastAlert, broadcastActuatorStatus, broadcastDeviceHeartbeat, broadcastOtaStatus, broadcastConfigAck, getClientCount } = require('./websocket/actuator-ws');
const protocolManager = require('./protocols/protocol-manager');
const deviceSimulator = require('./device-simulator');
const { authenticateDevice, verifyDeviceApiKey } = require('./middleware/device-auth');
const { SENSOR_THRESHOLDS } = require('./services/analysis-engine');
const { referencesForSensor, toCitation } = require('./services/ai-references');

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
      connectSrc: ["'self'", 'ws:', 'wss:', 'https://ntfy.sh', 'https://api.open-meteo.com', 'https://air-quality-api.open-meteo.com'],
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

// Additional security headers layered on top of Helmet
app.use(enhancedSecurityHeaders);

// CORS — restrict origins in all environments
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:80', 'http://localhost:8080'];

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
app.use(compression());

const SERVER_START = Date.now();

logger.info('PERN Backend starting...');

// In-memory fallback arrays — used when PostgreSQL is unavailable.
// Capped to prevent unbounded memory growth.
let sensorReadings = [];
let automationRules = [];

// Transport telemetry — per-channel ingestion counters surfaced in /api/live/status.
const transportStats = {
  http: { messages: 0, lastIngestAt: 0 },
  mqtt: { messages: 0, lastMessageAt: 0 },
  ws: { clients: 0, messages: 0, lastMessageAt: 0 },
  adapter: { messages: 0, lastIngestAt: 0 },
};
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
  mqttClient.subscribe('pern/devices/+/ota/status');
  mqttClient.subscribe('pern/devices/+/config/ack');
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

  // Track per-transport telemetry (source set by the calling entry point).
  const source = reading._source || 'http';
  if (transportStats[source]) {
    transportStats[source].messages++;
    transportStats[source].lastIngestAt = Date.now();
    transportStats[source].lastMessageAt = Date.now();
  }

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

  // Run anomaly detection (synchronous — lightweight Z-score only).
  // Anomalies are broadcast with deterministic statistical evidence and
  // curated citations attached — no LLM call in the hot path.
  if (reading.sensors) {
    for (const [sensor, value] of Object.entries(reading.sensors)) {
      if (typeof value === 'number') {
        const result = anomalyDetector.analyze(reading.device, sensor, value);
        if (result.isAnomaly) {
          const threshold = SENSOR_THRESHOLDS[sensor] || null;
          broadcastAlert({
            device: reading.device,
            sensor,
            level: 'warning',
            title: `Anomaly detected: ${sensor}`,
            detail: result.reason,
            timestamp: Date.now(),
            evidence: {
              zScore: result.zScore,
              mean: result.mean,
              stdDev: result.stdDev,
              value,
              threshold: threshold ? { warn: threshold.warn, crit: threshold.crit } : null,
              label: threshold?.label || sensor,
              unit: threshold?.unit || '',
            },
            references: referencesForSensor(sensor).slice(0, 3).map(toCitation),
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

      // Message-level device auth for MQTT (enforced when ENFORCE_DEVICE_AUTH=true)
      if (process.env.ENFORCE_DEVICE_AUTH === 'true') {
        const apiKey = payload.apiKey || '';
        const ok = await verifyDeviceApiKey(deviceId, apiKey);
        if (!ok) {
          logger.warn('[MQTT] Rejected unauthenticated sensor message', { deviceId });
          return;
        }
      }

      const reading = {
        device: deviceId,
        timestamp: payload.timestamp || Date.now(),
        sensors: payload.sensors,
        _fromMqtt: true,
        _source: 'mqtt',
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

    // Handle OTA progress/result from devices (pern/devices/{id}/ota/status)
    if (topic.includes('/ota/status')) {
      const deviceId = topic.split('/')[2];
      broadcastOtaStatus({
        device: deviceId,
        state: payload.state,
        percent: payload.percent,
        message: payload.message,
        version: payload.version,
        detail: payload.detail || null,
        timestamp: payload.timestamp || Date.now(),
      });
    }

    // Handle config apply acknowledgements (pern/devices/{id}/config/ack)
    if (topic.includes('/config/ack')) {
      const deviceId = topic.split('/')[2];
      broadcastConfigAck({
        device: deviceId,
        accepted: payload.accepted,
        message: payload.message || null,
        config: payload.config || null,
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
app.use(cookieParser());

// Auth routes — mounted BEFORE authenticateToken so they are public
app.use('/api/auth', authRoutes);

app.use('/api', authenticateToken);

// Guard every /api query string against injection / prototype pollution.
app.use('/api', validateQueryParams);

// Unify the audit trail: every state-changing /api request gets a request id
// and (on success) an audit_logs row. Routes may override the default
// "METHOD /path" label via withAuditLabel(...).
app.use('/api', auditLogger);

// CSRF (double-submit cookie). Enabled only when ENFORCE_CSRF=true.
app.use('/api', csrfProtection);

// Security posture + CSRF token endpoints (mounted before route modules so
// they are not shadowed by catch-all routers).
app.get('/api/security/csrf-token', csrfTokenEndpoint);

// API Routes
app.get('/api/health', async (req, res) => {
  const dbStatus = db.isAvailable() ? 'ok' : 'unavailable (in-memory fallback)';
  res.json({
    status: 'ok',
    version: '2.7.0',
    uptime: Math.floor((Date.now() - SERVER_START) / 1000),
    mqtt: mqttClient.connected,
    db: dbStatus,
    timestamp: Date.now(),
    persistence: 'enabled'
  });
});

// Published tolerance-accuracy tables from the pern-ai microservice.
app.get('/api/benchmark', async (req, res) => {
  const benchmarkClient = require('./services/ai-benchmark-client');
  const tables = await benchmarkClient.getBenchmark();
  if (!tables) {
    return res.status(503).json({ available: false, detail: 'AI benchmark unavailable' });
  }
  res.json(tables);
});

app.get('/api/live/status', async (req, res) => {
  const dbStatus = db.isAvailable() ? 'ok' : 'in-memory';
  const deviceCount = (await db.getDevices().catch(() => [])).length;
  const adapterStatus = protocolManager.getStatus?.() || [];
  const adaptersActive = Array.isArray(adapterStatus) ? adapterStatus.some(a => a.connected) : Boolean(adapterStatus);
  res.json({
    mqtt: mqttClient.connected,
    websocketClients: getClientCount(),
    db: dbStatus,
    devices: deviceCount,
    recentReadings: sensorReadings.length,
    uptime: process.uptime(),
    memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: Date.now(),
    transports: {
      http: { active: true, messages: transportStats.http.messages, lastIngestAt: transportStats.http.lastIngestAt || null },
      mqtt: { active: mqttClient.connected, messages: transportStats.mqtt.messages, lastMessageAt: transportStats.mqtt.lastMessageAt || null },
      websocket: { active: getClientCount() > 0, clients: getClientCount(), messages: transportStats.ws.messages, lastMessageAt: transportStats.ws.lastMessageAt || null },
      adapters: { active: adaptersActive, messages: transportStats.adapter.messages, lastIngestAt: transportStats.adapter.lastIngestAt || null },
    },
    deviceAuth: { enforcementEnabled: process.env.ENFORCE_DEVICE_AUTH === 'true' },
  });
});

app.use('/api/persistence', persistenceRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/ai-tools', aiToolsRoutes);

// Expose the canonical ingestion path to route modules (e.g. persistence)
// so every ingest entry point shares the same pipeline.
app.set('ingestReading', ingestReading);
app.set('transportStats', transportStats);

// Audit logs endpoint — restricted to admin/manager roles
app.get('/api/audit-logs', requireRole('admin', 'manager'), async (req, res) => {
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

// Security posture — reports which protections are active. Powers the
// SecurityAudit panel in the frontend.
app.get('/api/security/status', (req, res) => {
  res.json({
    authentication: {
      enforced: process.env.ENFORCE_AUTH === 'true',
      provider: process.env.LOGTO_ENDPOINT || 'local (Logto)',
    },
    deviceAuthentication: {
      enforced: process.env.ENFORCE_DEVICE_AUTH === 'true',
      apiKeys: process.env.DEVICE_API_KEYS !== 'false',
    },
    helmet: { enabled: true },
    securityHeaders: { enabled: true },
    queryValidation: { enabled: true },
    csrf: {
      enabled: process.env.ENFORCE_CSRF === 'true',
      cookie: 'pern_csrf',
    },
    rateLimiting: { enabled: true },
    bruteForceProtection: { enabled: true, maxFailures: 5 },
    auditLogging: { enabled: true },
    requestIds: { enabled: true },
    corsOrigins: (process.env.ALLOWED_ORIGINS || 'localhost:*').split(',').map(s => s.trim()),
    db: db.isAvailable() ? 'postgres' : 'in-memory',
    mqtt: Boolean(mqttClient && (mqttClient.connected || mqttClient.connecting)),
    version: '2.7.0',
    timestamp: Date.now(),
  });
});

// Client-side audit sync (rate-limited so the trail cannot be spammed).
// Writes a sanitized event into the same audit_logs table the UI reads.
const clientAuditLimiter = rateLimiter(60000, 30);
app.post('/api/security/log', clientAuditLimiter, (req, res) => {
  const { action, resource, details } = req.body || {};
  if (!action || typeof action !== 'string' || action.length > 100) {
    return res.status(400).json({ error: 'action is required (max 100 chars)' });
  }
  const resourceType = typeof resource === 'string' && resource.length > 0 ? resource.slice(0, 100) : 'client';
  db.logAuditEvent({
    user_id: req.userId || req.user?.sub || 'anonymous',
    action: action.slice(0, 100),
    resource_type: resourceType,
    resource_id: '',
    details: details && typeof details === 'object' ? { client: true, ...details } : { client: true },
    ip_address: req.ip || '',
  }).catch(() => {});
  res.json({ success: true });
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

// PERN v3 — Global Intelligence routes
app.use('/api/v3', require('./routes/global-v3'));

// PERN v3 — Public API gateway + key management
app.use('/public/v1', require('./routes/public'));
app.use('/api/keys', require('./routes/api-keys'));

// Support tickets (in-memory store for demo, would be DB-backed in production)
const supportTickets = [];
app.get('/api/support/tickets', (req, res) => {
  res.json(supportTickets.slice(-50).reverse());
});
app.post('/api/support/ticket', (req, res) => {
  const { name, email, subject, message, priority } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email, and message are required' });
  }
  const ticket = {
    id: 'st-' + Date.now(),
    subject: subject || 'No Subject',
    status: 'open',
    priority: priority || 'medium',
    name, email, message,
    createdAt: new Date().toISOString(),
  };
  supportTickets.push(ticket);
  res.json({ success: true, ticket });
});

const CITY_COORDS = {
  Cairo: { lat: 30.04, lng: 31.24 }, Alexandria: { lat: 31.20, lng: 29.92 },
  Giza: { lat: 30.01, lng: 31.21 }, London: { lat: 51.51, lng: -0.13 },
  Paris: { lat: 48.86, lng: 2.35 }, Berlin: { lat: 52.52, lng: 13.41 },
  'New York': { lat: 40.71, lng: -74.01 }, Beijing: { lat: 39.90, lng: 116.41 },
  Delhi: { lat: 28.70, lng: 77.10 }, Tokyo: { lat: 35.68, lng: 139.69 },
};

// OpenAQ-compatible proxy — backed by Open-Meteo Air Quality API (free, no key needed)
app.get('/api/openaq', async (req, res) => {
  const { city } = req.query;
  if (!city) return res.status(400).json({ error: 'city is required' });
  try {
    const coords = CITY_COORDS[city] || { lat: 30.04, lng: 31.24 };
    const params = new URLSearchParams({
      latitude: String(coords.lat),
      longitude: String(coords.lng),
      current: 'pm2_5,pm10,nitrogen_dioxide,ozone',
      timezone: 'auto',
    });
    const response = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = await response.json();
    if (!data.current) return res.json({ location: city, pm25: null, no2: null, o3: null, timestamp: null });
    const { current } = data;
    res.json({
      location: city,
      pm25: current.pm2_5 ?? null,
      pm10: current.pm10 ?? null,
      no2: current.nitrogen_dioxide ?? null,
      o3: current.ozone ?? null,
      timestamp: current.time || null,
    });
  } catch (err) {
    logger.warn('[Open-Meteo] Proxy failed', { city, error: err.message });
    res.json({ location: city, pm25: null, no2: null, o3: null, timestamp: null, error: err.message });
  }
});

// Rate limits for write endpoints (60 requests/min)
const coreWriteLimiter = rateLimiter(60000, 60);
const sensorWriteLimiter = rateLimiter(60000, 120);

// Counts any 4xx/5xx JSON error response as a failed attempt, then bans the
// IP with exponential backoff after MAX_FAILURES. Used on device-auth and
// actuator command endpoints.
const isFailure = (req, body) => Boolean(body && body.error);

app.get('/api/sensors', async (req, res) => {
  try {
    const dbReadings = await db.getRecentReadings(40);
    const normalized = dbReadings.map(r => ({ ...r, device: r.device_id || r.device }));
    res.json(normalized.length > 0 ? normalized : sensorReadings.slice(0, 30));
  } catch {
    res.json(sensorReadings.slice(0, 30));
  }
});

app.post('/api/sensors', sensorWriteLimiter, bruteForceProtection(isFailure), validateSensorData, authenticateDevice, withAuditLabel('sensors.ingest', 'sensor_reading'), async (req, res) => {
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
      _source: 'http',
    });
    res.json({ success: true });
  } catch (e) {
    logger.error('[API] POST /api/sensors ingest failed', { error: e.message });
    res.status(500).json({ error: 'Failed to ingest reading' });
  }
});

// Unified device ingestion endpoint.
// Accepts both { device, sensors } and { deviceId, readings } schemas, coerces
// numeric values, applies device auth (when ENFORCE_DEVICE_AUTH=true), and runs
// the exact same ingestion pipeline as /api/sensors.
app.post('/api/readings', sensorWriteLimiter, bruteForceProtection(isFailure), authenticateDevice, withAuditLabel('readings.ingest', 'reading'), async (req, res) => {
  const body = req.body || {};
  const device = body.device || body.deviceId || req.deviceId || null;
  const rawSensors = body.sensors || body.readings || null;

  if (!device || typeof device !== 'string' || device.trim().length < 3) {
    return res.status(400).json({ error: 'Invalid device id (min 3 chars)' });
  }
  if (!rawSensors || typeof rawSensors !== 'object' || Object.keys(rawSensors).length === 0) {
    return res.status(400).json({ error: 'Invalid payload: expected { device, sensors: {} }' });
  }

  const sensors = {};
  for (const [key, value] of Object.entries(rawSensors)) {
    const num = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(num)) {
      return res.status(400).json({ error: `Sensor "${key}" must be numeric, got ${JSON.stringify(value)}` });
    }
    sensors[key] = num;
  }

  try {
    await ingestReading({
      device: device.trim(),
      timestamp: body.timestamp ? Number(body.timestamp) : Date.now(),
      sensors,
      _source: 'http',
    });
    res.json({
      success: true,
      device: device.trim(),
      timestamp: body.timestamp || Date.now(),
      count: Object.keys(sensors).length,
      accepted: true,
    });
  } catch (e) {
    logger.error('[API] POST /api/readings ingest failed', { error: e.message });
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
    sendError(res, e);
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

app.post('/api/alerts', coreWriteLimiter, withAuditLabel('alert.create', 'alert'), async (req, res) => {
  try {
    const row = await db.saveAlert(req.body);
    res.json({ success: true, id: row.id });
  } catch (e) {
    sendError(res, e);
  }
});

app.post('/api/alerts/:id/acknowledge', coreWriteLimiter, async (req, res) => {
  try {
    await db.acknowledgeAlert(req.params.id);
    res.json({ success: true });
  } catch (e) {
    sendError(res, e);
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

app.post('/api/thresholds', coreWriteLimiter, requireRole('admin', 'manager'), withAuditLabel('threshold.save', 'threshold'), async (req, res) => {
  const { sensor, min, max, enabled } = req.body;
  if (!sensor) return res.status(400).json({ error: 'sensor required' });
  try {
    await db.saveThreshold(sensor, min, max, enabled !== false);
    res.json({ success: true });
  } catch (e) {
    sendError(res, e);
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

app.post('/api/automation/rules', coreWriteLimiter, requireRole('admin', 'manager'), withAuditLabel('rule.save', 'automation_rule'), async (req, res) => {
  const rule = { ...req.body, id: req.body.id || 'r' + Date.now() };
  try {
    await db.saveAutomationRule(rule);
    automationRules.push(rule);
    automationEngine.reloadRules(automationRules);
    res.json(rule);
  } catch (e) {
    sendError(res, e);
  }
});

app.delete('/api/automation/rules/:id', coreWriteLimiter, requireRole('admin'), withAuditLabel('rule.delete', 'automation_rule'), async (req, res) => {
  try {
    automationRules = automationRules.filter(r => r.id !== req.params.id);
    await db.deleteAutomationRule(req.params.id);
    automationEngine.reloadRules(automationRules);
    res.json({ success: true });
  } catch (e) {
    sendError(res, e);
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
    sendError(res, e);
  }
});

// ---- Actuator commands routed through backend (audit trail) ----
app.post('/api/actuators/command', coreWriteLimiter, bruteForceProtection(isFailure), withAuditLabel('actuator.command', 'actuator'), async (req, res) => {
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

// 404 handler — uniform JSON response for unmatched routes (MUST be before
// the error handler but after every route module).
app.use(require('./middleware/not-found'));

// Global error handler (MUST be last)
const { errorHandler, sendError } = require('./middleware/error-handler');
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

// Start global ingestion scheduler + seed compliance frameworks
const globalIngestion = require('./services/global-ingestion');
globalIngestion.setMqttClient(mqttClient);
const complianceEngine = require('./services/compliance-engine');
complianceEngine.seedFrameworks().then(() => {
  if (process.env.ENABLE_INGESTION !== 'false') {
    globalIngestion.startScheduler();
  }
});

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
        _source: 'adapter',
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
