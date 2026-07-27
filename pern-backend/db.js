/**
 * PostgreSQL Database Layer for PERN
 * Tables: sensor_readings, automation_rules, automation_logs, devices,
 *         ehi_history, device_readings, alerts, alert_thresholds,
 *         actuator_commands, organizations, team_members,
 *         alert_rules, alert_history, users, notification_preferences,
 *         firmware_versions, device_metadata, audit_logs, data_retention_policies
 */

const { Pool } = require('pg');
const logger = require('./utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://pern:pern_secret@localhost:5432/pern_db',
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 10000,
  allowExitOnIdle: true,
});

pool.on('error', (err) => {
  logger.error('[DB] Unexpected pool error', { error: err.message });
});

const memory = {
  ehiHistory: [],
  deviceReadings: {},
  alerts: [],
  thresholds: {},
  sensorReadings: [],
};

let dbAvailable = true;
let lastFailAt = 0;
let failCount = 0;

async function withFallback(operation) {
  try {
    const result = await operation();
    if (!dbAvailable) {
      logger.info('[DB] Connection recovered');
    }
    dbAvailable = true;
    failCount = 0;
    return result;
  } catch (err) {
    const now = Date.now();
    failCount++;
    dbAvailable = false;
    lastFailAt = now;
    const cooldown = Math.min(failCount * 2000, 30000);
    if (failCount <= 3 || now - lastFailAt > 30000) {
      logger.warn('[DB] Query failed', { failCount, error: err.message });
    }
    throw err;
  }
}

function isAvailable() {
  return dbAvailable;
}

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100),
        timestamp BIGINT,
        sensors JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS automation_rules (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        sensor VARCHAR(50),
        operator VARCHAR(5),
        threshold NUMERIC,
        action TEXT,
        enabled BOOLEAN DEFAULT true,
        organization_id VARCHAR(100) DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS automation_logs (
        id SERIAL PRIMARY KEY,
        rule_id VARCHAR(50),
        rule_name VARCHAR(100),
        sensor VARCHAR(50),
        value NUMERIC,
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(150),
        type VARCHAR(50),
        region VARCHAR(100),
        status VARCHAR(20) DEFAULT 'online',
        last_seen TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ehi_history (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100),
        ehi NUMERIC,
        category VARCHAR(20),
        recorded_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS device_readings (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100),
        sensors JSONB,
        recorded_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100),
        sensor VARCHAR(50),
        level VARCHAR(20),
        title VARCHAR(200),
        detail TEXT,
        acknowledged BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alert_thresholds (
        sensor VARCHAR(50) PRIMARY KEY,
        min NUMERIC,
        max NUMERIC,
        enabled BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS actuator_commands (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100),
        actuator VARCHAR(50),
        command VARCHAR(10),
        params JSONB,
        user_id VARCHAR(100),
        organization_id VARCHAR(100) DEFAULT 'default',
        timestamp BIGINT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS organizations (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(200),
        description TEXT,
        owner_id VARCHAR(100),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        organization_id VARCHAR(100) REFERENCES organizations(id),
        user_id VARCHAR(100),
        name VARCHAR(200),
        email VARCHAR(200),
        role VARCHAR(20) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(organization_id, user_id)
      );

      -- ============================================================
      -- NEW TABLES (Phase 2)
      -- ============================================================

      CREATE TABLE IF NOT EXISTS alert_rules (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        sensor VARCHAR(50),
        operator VARCHAR(5),
        threshold NUMERIC,
        severity VARCHAR(20) DEFAULT 'warning',
        notification_channels JSONB DEFAULT '["ntfy"]',
        enabled BOOLEAN DEFAULT true,
        organization_id VARCHAR(100) DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alert_history (
        id SERIAL PRIMARY KEY,
        alert_rule_id VARCHAR(50),
        device_id VARCHAR(100),
        sensor VARCHAR(50),
        value NUMERIC,
        severity VARCHAR(20),
        message TEXT,
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_by VARCHAR(100),
        acknowledged_at TIMESTAMP,
        triggered_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(200) UNIQUE,
        name VARCHAR(200),
        role VARCHAR(20) DEFAULT 'viewer',
        organization_id VARCHAR(100) DEFAULT 'default',
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100),
        channel VARCHAR(20),
        alert_types JSONB DEFAULT '["critical", "warning"]',
        enabled BOOLEAN DEFAULT true,
        UNIQUE(user_id, channel)
      );

      CREATE TABLE IF NOT EXISTS firmware_versions (
        id SERIAL PRIMARY KEY,
        device_type VARCHAR(50),
        version VARCHAR(50),
        changelog TEXT,
        download_url TEXT,
        released_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(device_type, version)
      );

      CREATE TABLE IF NOT EXISTS device_metadata (
        device_id VARCHAR(100) PRIMARY KEY,
        firmware_version VARCHAR(50),
        location_lat NUMERIC,
        location_lng NUMERIC,
        description TEXT,
        tags JSONB DEFAULT '[]',
        config JSONB DEFAULT '{}',
        last_config_push TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100),
        action VARCHAR(100),
        resource_type VARCHAR(50),
        resource_id VARCHAR(100),
        details JSONB DEFAULT '{}',
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS data_retention_policies (
        id SERIAL PRIMARY KEY,
        organization_id VARCHAR(100) DEFAULT 'default',
        sensor VARCHAR(50),
        retention_days INTEGER DEFAULT 90,
        enabled BOOLEAN DEFAULT true,
        UNIQUE(organization_id, sensor)
      );

      CREATE TABLE IF NOT EXISTS ai_conversations (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(200) DEFAULT 'New Chat',
        user_id VARCHAR(100) DEFAULT 'anonymous',
        organization_id VARCHAR(100) DEFAULT 'default',
        model VARCHAR(100),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_messages (
        id SERIAL PRIMARY KEY,
        conversation_id VARCHAR(100) REFERENCES ai_conversations(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        model VARCHAR(100),
        tokens_used INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS device_health (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100) REFERENCES devices(id) ON DELETE CASCADE,
        rssi INTEGER,
        free_heap INTEGER,
        uptime_seconds BIGINT,
        firmware_version VARCHAR(50),
        ip_address VARCHAR(45),
        wifi_channel INTEGER,
        cpu_freq INTEGER,
        actuators JSONB DEFAULT '{}',
        recorded_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_device_health_device_ts ON device_health (device_id, recorded_at DESC);
    `);

    // Performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_ts ON sensor_readings (device_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_created ON sensor_readings (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_device_readings_device_ts ON device_readings (device_id, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ehi_history_device_ts ON ehi_history (device_id, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts (device_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts (acknowledged, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_automation_logs_ts ON automation_logs (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_actuator_commands_org ON actuator_commands (organization_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alert_rules_org ON alert_rules (organization_id, enabled);
      CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history (alert_rule_id, triggered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON alert_history (severity, acknowledged, triggered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_users_org ON users (organization_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_firmware_type ON firmware_versions (device_type, version);
      CREATE INDEX IF NOT EXISTS idx_device_metadata_tags ON device_metadata USING GIN (tags);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages (conversation_id, created_at ASC);
    `);

    logger.info('[DB] PostgreSQL tables and indexes initialized');
  } finally {
    client.release();
  }
}

// ============================================================
// SENSOR READINGS
// ============================================================

async function saveSensorReading(reading) {
  const { device, timestamp, sensors } = reading;
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO sensor_readings (device_id, timestamp, sensors) VALUES ($1, $2, $3)`,
      [device, timestamp, sensors]
    ));
  } catch {
    memory.sensorReadings.push({ device_id: device, timestamp, sensors });
    if (memory.sensorReadings.length > 2000) memory.sensorReadings.splice(0, memory.sensorReadings.length - 2000);
  }
}

async function getRecentReadings(limit = 50) {
  try {
    const result = await withFallback(() => pool.query(
      `SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT $1`,
      [limit]
    ));
    return result.rows;
  } catch {
    return memory.sensorReadings.slice(-limit);
  }
}

async function getReadingsByDateRange(from, to, device, limit = 500) {
  const conditions = [];
  const params = [];
  let idx = 1;
  if (from) { conditions.push(`created_at >= $${idx++}`); params.push(new Date(from)); }
  if (to) { conditions.push(`created_at <= $${idx++}`); params.push(new Date(to)); }
  if (device) { conditions.push(`device_id = $${idx++}`); params.push(device); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const result = await pool.query(
      `SELECT * FROM sensor_readings ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      [...params, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

// ============================================================
// AUTOMATION
// ============================================================

async function saveAutomationLog(log) {
  if (!dbAvailable) return;
  try {
    await pool.query(
      `INSERT INTO automation_logs (rule_id, rule_name, sensor, value) VALUES ($1, $2, $3, $4)`,
      [log.ruleId, log.ruleName, log.sensor, log.value]
    );
  } catch { /* no-op */ }
}

async function getAutomationLogs(limit = 30) {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT * FROM automation_logs ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

async function getAutomationRules() {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(`SELECT * FROM automation_rules`);
    return result.rows;
  } catch {
    return [];
  }
}

async function saveAutomationRule(rule) {
  const actionJson = typeof rule.action === 'object' ? JSON.stringify(rule.action) : rule.action;
  const orgId = rule.organization_id || 'default';

  try {
    await pool.query(
      `INSERT INTO automation_rules (id, name, sensor, operator, threshold, action, enabled, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         sensor = EXCLUDED.sensor,
         operator = EXCLUDED.operator,
         threshold = EXCLUDED.threshold,
         action = EXCLUDED.action,
         enabled = EXCLUDED.enabled,
         organization_id = EXCLUDED.organization_id`,
      [rule.id, rule.name, rule.sensor, rule.operator, rule.threshold, actionJson, rule.enabled, orgId]
    );
  } catch { /* no-op */ }
}

async function deleteAutomationRule(id) {
  if (!dbAvailable) return;
  try {
    await pool.query(`DELETE FROM automation_rules WHERE id = $1`, [id]);
  } catch { /* no-op */ }
}

// ============================================================
// EHI HISTORY
// ============================================================

async function saveEHIHistory(deviceId, ehi, category) {
  const key = deviceId || 'global';
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO ehi_history (device_id, ehi, category) VALUES ($1, $2, $3)`,
      [key, ehi, category]
    ));
  } catch {
    memory.ehiHistory.push({ device_id: key, ehi, category, recorded_at: new Date() });
    if (memory.ehiHistory.length > 2000) memory.ehiHistory.splice(0, memory.ehiHistory.length - 2000);
  }
}

async function getEHIHistory(deviceId, limit = 100, options = {}) {
  const key = deviceId || 'global';
  const { from, to } = options;
  try {
    let query = `SELECT ehi, category, recorded_at FROM ehi_history WHERE device_id = $1`;
    const params = [key];
    let idx = 2;
    if (from) { query += ` AND recorded_at >= $${idx++}`; params.push(new Date(from)); }
    if (to) { query += ` AND recorded_at <= $${idx++}`; params.push(new Date(to)); }
    query += ` ORDER BY recorded_at DESC LIMIT $${idx}`;
    params.push(limit);
    const result = await withFallback(() => pool.query(query, params));
    return result.rows.reverse();
  } catch {
    let rows = memory.ehiHistory.filter(r => r.device_id === key);
    if (from) rows = rows.filter(r => new Date(r.recorded_at) >= new Date(from));
    if (to) rows = rows.filter(r => new Date(r.recorded_at) <= new Date(to));
    return rows.slice(-limit).reverse();
  }
}

// ============================================================
// DEVICE READINGS
// ============================================================

async function getDeviceReadings(deviceId, limit = 50) {
  try {
    const result = await withFallback(() => pool.query(
      `SELECT sensors, recorded_at FROM device_readings WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
      [deviceId, limit]
    ));
    return result.rows.reverse();
  } catch {
    return (memory.deviceReadings[deviceId] || []).slice(-limit).reverse();
  }
}

async function saveDeviceReading(deviceId, sensors) {
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO device_readings (device_id, sensors) VALUES ($1, $2)`,
      [deviceId, sensors]
    ));
  } catch {
    if (!memory.deviceReadings[deviceId]) memory.deviceReadings[deviceId] = [];
    memory.deviceReadings[deviceId].push({ sensors, recorded_at: new Date() });
    if (memory.deviceReadings[deviceId].length > 500) memory.deviceReadings[deviceId].splice(0, memory.deviceReadings[deviceId].length - 500);
  }
}

// ============================================================
// ALERTS (legacy — kept for backward compat)
// ============================================================

async function saveAlert(alert) {
  try {
    const result = await withFallback(() => pool.query(
      `INSERT INTO alerts (device_id, sensor, level, title, detail)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [alert.deviceId, alert.sensor, alert.level, alert.title, alert.detail]
    ));
    return result.rows[0];
  } catch {
    const row = {
      id: memory.alerts.length + 1,
      device_id: alert.deviceId,
      sensor: alert.sensor,
      level: alert.level,
      title: alert.title,
      detail: alert.detail,
      acknowledged: false,
      created_at: new Date(),
    };
    memory.alerts.push(row);
    if (memory.alerts.length > 1000) memory.alerts.splice(0, memory.alerts.length - 1000);
    return row;
  }
}

async function getAlerts(deviceId, limit = 50) {
  try {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (deviceId) { conditions.push(`device_id = $${idx++}`); params.push(deviceId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    const result = await withFallback(() => pool.query(
      `SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      params
    ));
    return result.rows;
  } catch {
    const rows = deviceId
      ? memory.alerts.filter(a => a.device_id === deviceId)
      : memory.alerts;
    return rows.slice(-limit);
  }
}

async function acknowledgeAlert(id) {
  try {
    return await withFallback(() => pool.query(`UPDATE alerts SET acknowledged = true WHERE id = $1`, [id]));
  } catch {
    const row = memory.alerts.find(a => a.id === Number(id));
    if (row) row.acknowledged = true;
  }
}

// ============================================================
// ALERT THRESHOLDS
// ============================================================

async function getThresholds() {
  try {
    const result = await withFallback(() => pool.query(`SELECT * FROM alert_thresholds`));
    return result.rows;
  } catch {
    return Object.values(memory.thresholds);
  }
}

async function saveThreshold(sensor, min, max, enabled) {
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO alert_thresholds (sensor, min, max, enabled) VALUES ($1, $2, $3, $4)
       ON CONFLICT (sensor) DO UPDATE SET min = EXCLUDED.min, max = EXCLUDED.max, enabled = EXCLUDED.enabled`,
      [sensor, min, max, enabled]
    ));
  } catch {
    memory.thresholds[sensor] = { sensor, min, max, enabled };
  }
}

// ============================================================
// DEVICES
// ============================================================

async function upsertDevice(device) {
  const { id, name, type, status, lastSeen } = device;
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO devices (id, name, type, status, last_seen) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type,
         status = EXCLUDED.status, last_seen = EXCLUDED.last_seen`,
      [id, name || id, type || 'Generic', status || 'online', new Date(lastSeen || Date.now())]
    ));
  } catch {
    memory.devices = memory.devices || {};
    memory.devices[id] = { id, name: name || id, type: type || 'Generic', status: status || 'online', last_seen: new Date(lastSeen || Date.now()) };
  }
}

async function getDevices() {
  try {
    const result = await withFallback(() => pool.query(
      `SELECT id, name, type, status, last_seen FROM devices ORDER BY last_seen DESC`
    ));
    return result.rows;
  } catch {
    return Object.values(memory.devices || {});
  }
}

async function getDevice(id) {
  try {
    const result = await pool.query(`SELECT * FROM devices WHERE id = $1`, [id]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function deleteDevice(id) {
  try {
    return await pool.query(`DELETE FROM devices WHERE id = $1`, [id]);
  } catch {
    // no-op
  }
}

// ============================================================
// ACTUATOR COMMANDS
// ============================================================

async function logActuatorCommand(entry) {
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO actuator_commands (device_id, actuator, command, params, user_id, organization_id, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.deviceId, entry.actuator, entry.command, JSON.stringify(entry.params), entry.userId, entry.orgId, entry.timestamp]
    ));
  } catch {
    // Best effort
  }
}

async function getActuatorCommands(orgId, limit = 50) {
  try {
    const query = orgId
      ? `SELECT * FROM actuator_commands WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM actuator_commands ORDER BY created_at DESC LIMIT $1`;
    const params = orgId ? [orgId, limit] : [limit];
    const result = await withFallback(() => pool.query(query, params));
    return result.rows;
  } catch {
    return [];
  }
}

// ============================================================
// ORGANIZATIONS
// ============================================================

async function getOrganizations() {
  try {
    const result = await withFallback(() => pool.query(`SELECT * FROM organizations ORDER BY created_at DESC`));
    return result.rows;
  } catch {
    return [];
  }
}

async function getOrganization(id) {
  try {
    const result = await withFallback(() => pool.query(`SELECT * FROM organizations WHERE id = $1`, [id]));
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function upsertOrganization(org) {
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO organizations (id, name, description, owner_id, settings)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, settings = EXCLUDED.settings`,
      [org.id, org.name, org.description || '', org.ownerId || '', JSON.stringify(org.settings || {})]
    ));
  } catch {
    // no-op
  }
}

async function deleteOrganization(id) {
  try {
    return await withFallback(() => pool.query(`DELETE FROM organizations WHERE id = $1`, [id]));
  } catch {
    // no-op
  }
}

// ============================================================
// TEAM MEMBERS
// ============================================================

async function getTeamMembers(orgId) {
  try {
    const result = await withFallback(() => pool.query(
      `SELECT * FROM team_members WHERE organization_id = $1 ORDER BY joined_at DESC`, [orgId]
    ));
    return result.rows;
  } catch {
    return [];
  }
}

async function addTeamMember(member) {
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO team_members (organization_id, user_id, name, email, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role`,
      [member.orgId, member.userId, member.name, member.email || '', member.role || 'member']
    ));
  } catch {
    // no-op
  }
}

async function removeTeamMember(orgId, userId) {
  try {
    return await withFallback(() => pool.query(
      `DELETE FROM team_members WHERE organization_id = $1 AND user_id = $2`, [orgId, userId]
    ));
  } catch {
    // no-op
  }
}

async function updateTeamMemberRole(orgId, userId, role) {
  try {
    return await withFallback(() => pool.query(
      `UPDATE team_members SET role = $3 WHERE organization_id = $1 AND user_id = $2`, [orgId, userId, role]
    ));
  } catch {
    // no-op
  }
}

// ============================================================
// ALERT RULES (new — user-configurable)
// ============================================================

async function getAlertRules(orgId) {
  if (!dbAvailable) return [];
  try {
    const query = orgId
      ? `SELECT * FROM alert_rules WHERE organization_id = $1 ORDER BY created_at DESC`
      : `SELECT * FROM alert_rules ORDER BY created_at DESC`;
    const params = orgId ? [orgId] : [];
    const result = await pool.query(query, params);
    return result.rows;
  } catch {
    return [];
  }
}

async function getAlertRule(id) {
  try {
    const result = await pool.query(`SELECT * FROM alert_rules WHERE id = $1`, [id]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function saveAlertRule(rule) {
  const channelsJson = typeof rule.notification_channels === 'object'
    ? JSON.stringify(rule.notification_channels)
    : JSON.stringify(rule.notification_channels || ['ntfy']);
  const orgId = rule.organization_id || 'default';

  await pool.query(
    `INSERT INTO alert_rules (id, name, sensor, operator, threshold, severity, notification_channels, enabled, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, sensor = EXCLUDED.sensor, operator = EXCLUDED.operator,
       threshold = EXCLUDED.threshold, severity = EXCLUDED.severity,
       notification_channels = EXCLUDED.notification_channels, enabled = EXCLUDED.enabled,
       organization_id = EXCLUDED.organization_id`,
    [rule.id, rule.name, rule.sensor, rule.operator, rule.threshold,
     rule.severity || 'warning', channelsJson, rule.enabled !== false, orgId]
  );
}

async function deleteAlertRule(id) {
  try {
    return await pool.query(`DELETE FROM alert_rules WHERE id = $1`, [id]);
  } catch {
    // no-op
  }
}

// ============================================================
// ALERT HISTORY
// ============================================================

async function triggerAlert(entry) {
  try {
    const result = await withFallback(() => pool.query(
      `INSERT INTO alert_history (alert_rule_id, device_id, sensor, value, severity, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, triggered_at`,
      [entry.alertRuleId, entry.deviceId, entry.sensor, entry.value, entry.severity, entry.message]
    ));
    return result.rows[0];
  } catch {
    return { id: Date.now(), triggered_at: new Date() };
  }
}

async function getAlertHistory(options = {}) {
  if (!dbAvailable) return [];
  const { limit = 50, severity, acknowledged, deviceId } = options;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity); }
  if (acknowledged !== undefined) { conditions.push(`acknowledged = $${idx++}`); params.push(acknowledged); }
  if (deviceId) { conditions.push(`device_id = $${idx++}`); params.push(deviceId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const result = await pool.query(
      `SELECT * FROM alert_history ${where} ORDER BY triggered_at DESC LIMIT $${idx}`,
      [...params, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

async function acknowledgeAlertHistory(id, userId) {
  try {
    return await pool.query(
      `UPDATE alert_history SET acknowledged = true, acknowledged_by = $2, acknowledged_at = NOW() WHERE id = $1`,
      [id, userId || 'unknown']
    );
  } catch {
    // no-op
  }
}

async function updateAlertSeverity(id, newSeverity) {
  try {
    return await pool.query(
      `UPDATE alert_history SET severity = $2 WHERE id = $1`,
      [id, newSeverity]
    );
  } catch {
    // no-op
  }
}

async function getUnacknowledgedAlertCount(severity) {
  try {
    const query = severity
      ? `SELECT COUNT(*)::int as count FROM alert_history WHERE acknowledged = false AND severity = $1`
      : `SELECT COUNT(*)::int as count FROM alert_history WHERE acknowledged = false`;
    const params = severity ? [severity] : [];
    const result = await pool.query(query, params);
    return result.rows[0]?.count || 0;
  } catch {
    return 0;
  }
}

// ============================================================
// USERS
// ============================================================

async function getUsers(orgId) {
  try {
    const query = orgId
      ? `SELECT * FROM users WHERE organization_id = $1 ORDER BY created_at DESC`
      : `SELECT * FROM users ORDER BY created_at DESC`;
    const params = orgId ? [orgId] : [];
    const result = await pool.query(query, params);
    return result.rows;
  } catch {
    return [];
  }
}

async function getUser(id) {
  try {
    const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function getUserByEmail(email) {
  try {
    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function upsertUser(user) {
  try {
    return await pool.query(
      `INSERT INTO users (id, email, name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role,
         organization_id = EXCLUDED.organization_id`,
      [user.id, user.email, user.name || '', user.role || 'viewer', user.organization_id || 'default']
    );
  } catch {
    // no-op
  }
}

async function updateUserLastLogin(id) {
  try {
    return await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [id]);
  } catch {
    // no-op
  }
}

async function deleteUser(id) {
  try {
    return await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  } catch {
    // no-op
  }
}

// ============================================================
// NOTIFICATION PREFERENCES
// ============================================================

async function getNotificationPreferences(userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`, [userId]
    );
    return result.rows;
  } catch {
    return [];
  }
}

async function saveNotificationPreference(pref) {
  const typesJson = typeof pref.alert_types === 'object'
    ? JSON.stringify(pref.alert_types)
    : JSON.stringify(pref.alert_types || ['critical', 'warning']);
  try {
    return await pool.query(
      `INSERT INTO notification_preferences (user_id, channel, alert_types, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, channel) DO UPDATE SET alert_types = EXCLUDED.alert_types, enabled = EXCLUDED.enabled`,
      [pref.user_id, pref.channel, typesJson, pref.enabled !== false]
    );
  } catch {
    // no-op
  }
}

async function deleteNotificationPreference(userId, channel) {
  try {
    return await pool.query(
      `DELETE FROM notification_preferences WHERE user_id = $1 AND channel = $2`, [userId, channel]
    );
  } catch {
    // no-op
  }
}

// ============================================================
// FIRMWARE VERSIONS
// ============================================================

async function getFirmwareVersions(deviceType) {
  try {
    const query = deviceType
      ? `SELECT * FROM firmware_versions WHERE device_type = $1 ORDER BY released_at DESC`
      : `SELECT * FROM firmware_versions ORDER BY released_at DESC`;
    const params = deviceType ? [deviceType] : [];
    const result = await pool.query(query, params);
    return result.rows;
  } catch {
    return [];
  }
}

async function getLatestFirmware(deviceType) {
  try {
    const result = await pool.query(
      `SELECT * FROM firmware_versions WHERE device_type = $1 ORDER BY released_at DESC LIMIT 1`,
      [deviceType]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function saveFirmwareVersion(fw) {
  try {
    return await pool.query(
      `INSERT INTO firmware_versions (device_type, version, changelog, download_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_type, version) DO UPDATE SET changelog = EXCLUDED.changelog, download_url = EXCLUDED.download_url`,
      [fw.device_type, fw.version, fw.changelog || '', fw.download_url || '']
    );
  } catch {
    // no-op
  }
}

async function deleteFirmwareVersion(id) {
  try {
    return await pool.query(`DELETE FROM firmware_versions WHERE id = $1`, [id]);
  } catch {
    // no-op
  }
}

// ============================================================
// DEVICE METADATA
// ============================================================

async function getDeviceMetadata(deviceId) {
  try {
    const result = await pool.query(`SELECT * FROM device_metadata WHERE device_id = $1`, [deviceId]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function upsertDeviceMetadata(meta) {
  const tagsJson = typeof meta.tags === 'object' ? JSON.stringify(meta.tags) : JSON.stringify(meta.tags || []);
  const configJson = typeof meta.config === 'object' ? JSON.stringify(meta.config) : JSON.stringify(meta.config || {});
  try {
    return await pool.query(
      `INSERT INTO device_metadata (device_id, firmware_version, location_lat, location_lng, description, tags, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (device_id) DO UPDATE SET
         firmware_version = EXCLUDED.firmware_version, location_lat = EXCLUDED.location_lat,
         location_lng = EXCLUDED.location_lng, description = EXCLUDED.description,
         tags = EXCLUDED.tags, config = EXCLUDED.config`,
      [meta.device_id, meta.firmware_version || '', meta.location_lat || null,
       meta.location_lng || null, meta.description || '', tagsJson, configJson]
    );
  } catch {
    // no-op
  }
}

async function updateDeviceConfigPush(deviceId) {
  try {
    return await pool.query(
      `UPDATE device_metadata SET last_config_push = NOW() WHERE device_id = $1`, [deviceId]
    );
  } catch {
    // no-op
  }
}

async function getAllDeviceMetadata() {
  try {
    const result = await pool.query(`SELECT * FROM device_metadata ORDER BY created_at DESC`);
    return result.rows;
  } catch {
    return [];
  }
}

// ============================================================
// AUDIT LOGS
// ============================================================

async function logAuditEvent(entry) {
  if (!dbAvailable) return;
  try {
    return await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.user_id || 'system', entry.action, entry.resource_type || '',
       entry.resource_id || '', JSON.stringify(entry.details || {}), entry.ip_address || '']
    );
  } catch {
    // Best effort — never block requests
  }
}

async function getAuditLogs(options = {}) {
  const { limit = 100, user_id, resource_type } = options;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
  if (resource_type) { conditions.push(`resource_type = $${idx++}`); params.push(resource_type); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const result = await pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      [...params, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

// ============================================================
// DATA RETENTION POLICIES
// ============================================================

async function getDataRetentionPolicies(orgId) {
  try {
    const query = orgId
      ? `SELECT * FROM data_retention_policies WHERE organization_id = $1`
      : `SELECT * FROM data_retention_policies`;
    const params = orgId ? [orgId] : [];
    const result = await pool.query(query, params);
    return result.rows;
  } catch {
    return [];
  }
}

async function saveDataRetentionPolicy(policy) {
  try {
    return await pool.query(
      `INSERT INTO data_retention_policies (organization_id, sensor, retention_days, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, sensor) DO UPDATE SET
         retention_days = EXCLUDED.retention_days, enabled = EXCLUDED.enabled`,
      [policy.organization_id || 'default', policy.sensor, policy.retention_days || 90, policy.enabled !== false]
    );
  } catch {
    // no-op
  }
}

async function deleteDataRetentionPolicy(id) {
  try {
    return await pool.query(`DELETE FROM data_retention_policies WHERE id = $1`, [id]);
  } catch {
    // no-op
  }
}

async function cleanupOldData() {
  try {
    const policies = await pool.query(
      `SELECT * FROM data_retention_policies WHERE enabled = true`
    );
    let totalDeleted = 0;
    for (const p of policies.rows) {
      // Delete sensor readings older than the retention period
      // Match by device_id if the policy specifies one, otherwise clean all
      const result = await pool.query(
        `DELETE FROM sensor_readings
         WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
        [p.retention_days]
      );
      totalDeleted += result.rowCount || 0;
    }
    if (totalDeleted > 0) {
      logger.info('[DB] Data retention cleanup', { deleted: totalDeleted });
    }
    return totalDeleted;
  } catch {
    return 0;
  }
}

// ============================================================
// AI CONVERSATIONS
// ============================================================

async function createConversation(id, title, userId, orgId, model) {
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO ai_conversations (id, title, user_id, organization_id, model) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
      [id, title || 'New Chat', userId || 'anonymous', orgId || 'default', model || null]
    ));
  } catch { /* no-op */ }
}

async function getConversations(userId, orgId, limit = 50) {
  try {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (userId) { conditions.push(`user_id = $${idx++}`); params.push(userId); }
    if (orgId) { conditions.push(`organization_id = $${idx++}`); params.push(orgId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await withFallback(() => pool.query(
      `SELECT id, title, model, created_at, updated_at FROM ai_conversations ${where} ORDER BY updated_at DESC LIMIT $${idx}`,
      [...params, limit]
    ));
    return result.rows;
  } catch { return []; }
}

async function updateConversation(id, updates) {
  const sets = [];
  const params = [];
  let idx = 1;
  if (updates.title) { sets.push(`title = $${idx++}`); params.push(updates.title); }
  if (updates.model) { sets.push(`model = $${idx++}`); params.push(updates.model); }
  sets.push(`updated_at = NOW()`);
  params.push(id);
  try {
    return await withFallback(() => pool.query(
      `UPDATE ai_conversations SET ${sets.join(', ')} WHERE id = $${idx}`, params
    ));
  } catch { /* no-op */ }
}

async function deleteConversation(id) {
  try {
    return await withFallback(() => pool.query(
      `DELETE FROM ai_conversations WHERE id = $1`, [id]
    ));
  } catch { /* no-op */ }
}

async function saveMessage(conversationId, role, content, model, tokensUsed, metadata) {
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO ai_messages (conversation_id, role, content, model, tokens_used, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
      [conversationId, role, content, model || null, tokensUsed || 0, metadata ? JSON.stringify(metadata) : '{}']
    ));
  } catch { /* no-op */ }
}

async function getMessages(conversationId, limit = 100) {
  try {
    const result = await withFallback(() => pool.query(
      `SELECT id, role, content, model, tokens_used, metadata, created_at FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`,
      [conversationId, limit]
    ));
    return result.rows;
  } catch { return []; }
}

async function getRecentMessages(conversationId, limit = 12) {
  try {
    const result = await withFallback(() => pool.query(
      `SELECT role, content FROM (SELECT role, content, created_at FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2) sub ORDER BY created_at ASC`,
      [conversationId, limit]
    ));
    return result.rows;
  } catch { return []; }
}

async function searchConversations(query, userId, limit = 20) {
  try {
    const conditions = [`(title ILIKE $1 OR id ILIKE $1)`];
    const params = [`%${query}%`];
    let idx = 2;
    if (userId) { conditions.push(`user_id = $${idx++}`); params.push(userId); }
    const where = conditions.join(' AND ');
    const result = await withFallback(() => pool.query(
      `SELECT id, title, model, created_at, updated_at FROM ai_conversations WHERE ${where} ORDER BY updated_at DESC LIMIT $${idx}`,
      [...params, limit]
    ));
    return result.rows;
  } catch { return []; }
}

module.exports = {
  pool,
  initDatabase,
  isAvailable: () => dbAvailable,

  // Sensor readings
  saveSensorReading,
  getRecentReadings,
  getReadingsByDateRange,

  // Automation
  saveAutomationLog,
  getAutomationLogs,
  getAutomationRules,
  saveAutomationRule,
  deleteAutomationRule,

  // EHI
  saveEHIHistory,
  getEHIHistory,

  // Device readings
  getDeviceReadings,
  saveDeviceReading,

  // Alerts (legacy)
  saveAlert,
  getAlerts,
  acknowledgeAlert,
  updateAlertSeverity,

  // Thresholds
  getThresholds,
  saveThreshold,

  // Devices
  upsertDevice,
  getDevices,
  getDevice,
  deleteDevice,

  // Actuator commands
  logActuatorCommand,
  getActuatorCommands,

  // Organizations
  getOrganizations,
  getOrganization,
  upsertOrganization,
  deleteOrganization,

  // Team members
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,

  // Alert rules (new)
  getAlertRules,
  getAlertRule,
  saveAlertRule,
  deleteAlertRule,

  // Alert history (new)
  triggerAlert,
  getAlertHistory,
  acknowledgeAlertHistory,
  getUnacknowledgedAlertCount,

  // Users (new)
  getUsers,
  getUser,
  getUserByEmail,
  upsertUser,
  updateUserLastLogin,
  deleteUser,

  // Notification preferences (new)
  getNotificationPreferences,
  saveNotificationPreference,
  deleteNotificationPreference,

  // Firmware versions (new)
  getFirmwareVersions,
  getLatestFirmware,
  saveFirmwareVersion,
  deleteFirmwareVersion,

  // Device metadata (new)
  getDeviceMetadata,
  upsertDeviceMetadata,
  updateDeviceConfigPush,
  getAllDeviceMetadata,

  // Audit logs (new)
  logAuditEvent,
  getAuditLogs,

  // Data retention (new)
  getDataRetentionPolicies,
  saveDataRetentionPolicy,
  deleteDataRetentionPolicy,
  cleanupOldData,

  // AI Conversations
  createConversation,
  getConversations,
  updateConversation,
  deleteConversation,
  saveMessage,
  getMessages,
  getRecentMessages,
  searchConversations,

  // Device Health
  saveDeviceHealth,
  getLatestDeviceHealth,
  getDeviceHealthHistory,
};

// ============================================================
//  Device Health Functions
// ============================================================

async function saveDeviceHealth(data) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO device_health (device_id, rssi, free_heap, uptime_seconds, firmware_version, ip_address, wifi_channel, cpu_freq, actuators)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      data.deviceId,
      data.rssi ?? null,
      data.freeHeap ?? null,
      data.uptime ?? null,
      data.firmwareVersion ?? null,
      data.ip ?? null,
      data.wifiChannel ?? null,
      data.cpuFreq ?? null,
      JSON.stringify(data.actuators || {}),
    ]);

    // Also upsert device status
    await client.query(`
      INSERT INTO devices (id, name, type, status, last_seen)
      VALUES ($1, $1, 'ESP32', 'online', NOW())
      ON CONFLICT (id) DO UPDATE SET status = 'online', last_seen = NOW()
    `, [data.deviceId]);
  } finally {
    client.release();
  }
}

async function getLatestDeviceHealth(deviceId) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM device_health WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT 1
    `, [deviceId]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function getDeviceHealthHistory(deviceId, limit = 50) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM device_health WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT $2
    `, [deviceId, limit]);
    return rows;
  } catch {
    return [];
  }
}
