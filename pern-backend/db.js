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
  deviceApiKeys: {},
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
    // ------------------------------------------------------------
    // v3.1 idempotent schema migration
    // CREATE TABLE IF NOT EXISTS never alters existing tables. Older
    // deployments can carry a live schema that drifted from the code DDL
    // below (e.g. compliance_frameworks, virtual_sensors, external_readings,
    // wind_trajectories, sensor_confidence_scores). These are transient /
    // re-seedable data-fabric tables, so drop them here and let the
    // CREATE TABLE IF NOT EXISTS block recreate them with the current DDL.
    // ------------------------------------------------------------
    const driftChecks = [
      { table: 'compliance_frameworks', requiredColumn: 'pollutant' },
      { table: 'virtual_sensors', requiredColumn: 'grid_cell' },
      { table: 'external_readings', requiredColumn: 'virtual_sensor_id' },
      { table: 'wind_trajectories', requiredColumn: 'created_at' },
      { table: 'sensor_confidence_scores', primaryKeyColumn: 'sensor_id' },
      { table: 'global_data_sources', column: 'id', dataType: 'integer' },
    ];
    for (const check of driftChecks) {
      let drifted = false;
      if (check.requiredColumn) {
        const { rows } = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [check.table]
        );
        drifted = !rows.some((r) => r.column_name === check.requiredColumn);
      } else if (check.primaryKeyColumn) {
        const { rows } = await client.query(
          `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
           WHERE tc.table_schema = 'public'
             AND tc.table_name = $1
             AND tc.constraint_type = 'PRIMARY KEY'`,
          [check.table]
        );
        drifted = !rows.some((r) => r.column_name === check.primaryKeyColumn);
      } else if (check.dataType) {
        const { rows } = await client.query(
          `SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
          [check.table, check.column]
        );
        drifted = rows.length === 0 || rows[0].data_type !== check.dataType;
      }
      if (drifted) {
        await client.query(`DROP TABLE IF EXISTS ${check.table} CASCADE`);
        logger.warn(`[DB] Rebuilding drifted table ${check.table} (v3.1 schema migration)`);
      }
    }

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

      CREATE TABLE IF NOT EXISTS device_api_keys (
        device_id VARCHAR(100) PRIMARY KEY,
        key_hash VARCHAR(64),
        created_at TIMESTAMP DEFAULT NOW()
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

      -- Data Fabric (global) tables
      CREATE TABLE IF NOT EXISTS global_data_sources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        api_endpoint TEXT,
        country VARCHAR(100),
        active BOOLEAN DEFAULT TRUE,
        last_fetch TIMESTAMP,
        confidence_weight NUMERIC(4,3) DEFAULT 0.5,
        priority INTEGER DEFAULT 5,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_global_sources_name UNIQUE (name)
      );

      CREATE TABLE IF NOT EXISTS virtual_sensors (
        id SERIAL PRIMARY KEY,
        source_type VARCHAR(50) NOT NULL,
        latitude NUMERIC(10,6),
        longitude NUMERIC(10,6),
        grid_cell VARCHAR(20),
        parameters TEXT[] DEFAULT '{}',
        source_id VARCHAR(200),
        last_reading_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_virtual_sensors_src_cell UNIQUE (source_type, grid_cell)
      );

      CREATE TABLE IF NOT EXISTS external_readings (
        id SERIAL PRIMARY KEY,
        source_type VARCHAR(50) NOT NULL,
        source_id VARCHAR(200),
        virtual_sensor_id INTEGER REFERENCES virtual_sensors(id) ON DELETE SET NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        parameters JSONB DEFAULT '{}',
        raw_response JSONB DEFAULT '{}',
        data_quality NUMERIC(4,3) DEFAULT 0.5
      );

      CREATE TABLE IF NOT EXISTS sensor_confidence_scores (
        sensor_id VARCHAR(200) PRIMARY KEY,
        source_type VARCHAR(50) NOT NULL,
        overall_score NUMERIC(4,3) DEFAULT 0.5,
        freshness_score NUMERIC(4,3) DEFAULT 0.5,
        spatial_consistency NUMERIC(4,3) DEFAULT 0.5,
        calibration_status VARCHAR(50) DEFAULT 'unknown',
        last_evaluated_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS compliance_frameworks (
        id SERIAL PRIMARY KEY,
        country VARCHAR(100) NOT NULL,
        region VARCHAR(100),
        authority VARCHAR(200),
        framework_name VARCHAR(200),
        pollutant VARCHAR(50) NOT NULL,
        standard_value NUMERIC(12,4),
        averaging_period VARCHAR(50),
        effective_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_compliance_key UNIQUE (country, pollutant, averaging_period)
      );

      CREATE TABLE IF NOT EXISTS wind_trajectories (
        id SERIAL PRIMARY KEY,
        latitude NUMERIC(10,6),
        longitude NUMERIC(10,6),
        altitude INTEGER,
        wind_speed NUMERIC(8,3),
        wind_direction NUMERIC(8,3),
        forecast_horizon INTEGER,
        forecasted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plume_events (
        id SERIAL PRIMARY KEY,
        source_lat NUMERIC(10,6),
        source_lon NUMERIC(10,6),
        pollutant VARCHAR(50),
        concentration NUMERIC(12,4),
        trajectory_path JSONB DEFAULT '[]',
        affected_regions JSONB DEFAULT '[]',
        detected_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS global_api_keys (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(200),
        key_hash VARCHAR(64) NOT NULL UNIQUE,
        tier VARCHAR(20) DEFAULT 'free',
        enabled BOOLEAN DEFAULT TRUE,
        daily_requests INTEGER DEFAULT 0,
        quota_per_day INTEGER DEFAULT 1000,
        created_at TIMESTAMP DEFAULT NOW(),
        last_used_at TIMESTAMP
      );

      -- v4.0 AI engine: aligned feature vectors for model training/serving
      CREATE TABLE IF NOT EXISTS feature_vectors (
        id BIGSERIAL PRIMARY KEY,
        feature_group TEXT NOT NULL,
        latitude NUMERIC(10,6) NOT NULL,
        longitude NUMERIC(10,6) NOT NULL,
        ts TIMESTAMPTZ NOT NULL,
        source_id TEXT NOT NULL,
        snapshot TEXT NOT NULL DEFAULT 'local',
        features JSONB NOT NULL DEFAULT '{}',
        target JSONB,
        quality NUMERIC(5,4) DEFAULT 0.5,
        provenance TEXT[] DEFAULT '{}'
      );
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
      CREATE INDEX IF NOT EXISTS idx_ext_readings_source_ts ON external_readings (source_type, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_ext_readings_vsensor ON external_readings (virtual_sensor_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_vsensors_grid ON virtual_sensors (grid_cell, source_type);
      CREATE INDEX IF NOT EXISTS idx_sources_active ON global_data_sources (active, priority);
      CREATE INDEX IF NOT EXISTS idx_compliance_country ON compliance_frameworks (country, pollutant);
      CREATE INDEX IF NOT EXISTS idx_wind_trajectories_ts ON wind_trajectories (forecasted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_plume_events_ts ON plume_events (detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feature_vectors_gt ON feature_vectors (feature_group, ts);
      CREATE INDEX IF NOT EXISTS idx_feature_vectors_xy ON feature_vectors (latitude, longitude);
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

// ---- Device API keys (per-device authentication) ----

async function storeDeviceApiKey(deviceId, keyHash) {
  try {
    return await withFallback(() => pool.query(
      `INSERT INTO device_api_keys (device_id, key_hash) VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET key_hash = EXCLUDED.key_hash, created_at = NOW()`,
      [deviceId, keyHash]
    ));
  } catch {
    memory.deviceApiKeys[deviceId] = { key_hash: keyHash, created_at: new Date() };
  }
}

async function getDeviceApiKeyHash(deviceId) {
  try {
    const result = await withFallback(() => pool.query(
      `SELECT key_hash FROM device_api_keys WHERE device_id = $1`, [deviceId]
    ));
    return result.rows[0]?.key_hash || null;
  } catch {
    return memory.deviceApiKeys[deviceId]?.key_hash || null;
  }
}

async function revokeDeviceApiKey(deviceId) {
  try {
    await withFallback(() => pool.query(`DELETE FROM device_api_keys WHERE device_id = $1`, [deviceId]));
  } catch {
    delete memory.deviceApiKeys[deviceId];
  }
}

async function deviceHasApiKey(deviceId) {
  const hash = await getDeviceApiKeyHash(deviceId);
  return Boolean(hash);
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

  try {
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
  } catch (err) {
    logger.error('[DB] saveAlertRule failed', { error: err.message });
    throw err;
  }
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
// DATA RETENTION
// ============================================================

const RETENTION_WHITELIST = new Set([
  'external_readings', 'wind_trajectories', 'plume_events',
  'sensor_confidence_scores', 'sensor_readings', 'device_readings',
  'ehi_history', 'alert_history', 'audit_logs', 'automation_logs',
]);

async function runRetention(rules) {
  const summary = {};
  for (const rule of rules || []) {
    const table = rule.table;
    const column = rule.column;
    const days = Math.max(1, Math.min(3650, Number(rule.days) || 90));
    if (!RETENTION_WHITELIST.has(table) || !/^[a-z_]+$/.test(column)) {
      summary[table] = 0;
      continue;
    }
    try {
      const result = await pool.query(
        `DELETE FROM ${table} WHERE ${column} < NOW() - INTERVAL '${days} days'`
      );
      summary[table] = result.rowCount || 0;
    } catch {
      summary[table] = 0;
    }
  }
  return summary;
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
  storeDeviceApiKey,
  getDeviceApiKeyHash,
  revokeDeviceApiKey,
  deviceHasApiKey,

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
  runRetention,

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

  // Data Fabric (global)
  upsertGlobalDataSource,
  getGlobalDataSources,
  setSourceLastFetch,
  createVirtualSensor,
  getVirtualSensors,
  saveExternalReading,
  getExternalReadings,
  saveFeatureVector,
  getFeatureVectors,
  upsertSensorConfidence,
  getSensorConfidence,
  listConfidenceScores,
  upsertComplianceFramework,
  getComplianceFrameworks,
  saveWindTrajectory,
  getWindTrajectories,
  savePlumeEvent,
  getPlumeEvents,

  // Public API keys
  saveGlobalApiKey,
  getGlobalApiKeyByHash,
  listGlobalApiKeys,
  revokeGlobalApiKey,
  incrementApiKeyUsage,
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

// ============================================================
//  Data Fabric Functions (global)
// ============================================================

// --- global_data_sources ---
async function upsertGlobalDataSource(source) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO global_data_sources (name, type, api_endpoint, country, active, confidence_weight, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (name) DO UPDATE SET
        api_endpoint = EXCLUDED.api_endpoint,
        country = EXCLUDED.country,
        active = EXCLUDED.active,
        confidence_weight = EXCLUDED.confidence_weight,
        priority = EXCLUDED.priority
      RETURNING *
    `, [
      source.name,
      source.type,
      source.apiEndpoint ?? null,
      source.country ?? null,
      source.active ?? true,
      source.confidenceWeight ?? 0.5,
      source.priority ?? 5,
    ]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] upsertGlobalDataSource failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getGlobalDataSources(options = {}) {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (options.active !== undefined) {
      params.push(options.active);
      where += ` AND active = $${params.length}`;
    }
    if (options.type) {
      params.push(options.type);
      where += ` AND type = $${params.length}`;
    }
    const { rows } = await pool.query(`
      SELECT * FROM global_data_sources ${where}
      ORDER BY priority ASC, name ASC
    `, params);
    return rows;
  } catch {
    return [];
  }
}

async function setSourceLastFetch(name) {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      UPDATE global_data_sources SET last_fetch = NOW() WHERE name = $1
    `, [name]);
  } catch (err) {
    logger.warn('[DB] setSourceLastFetch failed', { error: err.message });
  } finally {
    if (client) client.release();
  }
}

// --- virtual_sensors ---
async function createVirtualSensor(sensor) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO virtual_sensors (source_type, latitude, longitude, grid_cell, parameters, source_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (source_type, grid_cell) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        parameters = EXCLUDED.parameters,
        source_id = EXCLUDED.source_id,
        last_reading_at = NOW()
      RETURNING *
    `, [
      sensor.sourceType,
      sensor.latitude ?? null,
      sensor.longitude ?? null,
      sensor.gridCell ?? null,
      Array.isArray(sensor.parameters) ? sensor.parameters : [],
      sensor.sourceId ?? null,
    ]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] createVirtualSensor failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getVirtualSensors(options = {}) {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (options.sourceType) {
      params.push(options.sourceType);
      where += ` AND source_type = $${params.length}`;
    }
    if (options.gridCell) {
      params.push(options.gridCell);
      where += ` AND grid_cell = $${params.length}`;
    }
    const { rows } = await pool.query(`
      SELECT * FROM virtual_sensors ${where}
      ORDER BY last_reading_at DESC
    `, params);
    return rows;
  } catch {
    return [];
  }
}

// --- external_readings ---
async function saveExternalReading(reading) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO external_readings (source_type, source_id, virtual_sensor_id, timestamp, parameters, raw_response, data_quality)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      reading.sourceType,
      reading.sourceId ?? null,
      reading.virtualSensorId ?? null,
      reading.timestamp ? new Date(reading.timestamp) : new Date(),
      JSON.stringify(reading.parameters || {}),
      JSON.stringify(reading.rawResponse || {}),
      reading.dataQuality ?? 0.5,
    ]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] saveExternalReading failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getExternalReadings(options = {}) {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (options.sourceType) {
      params.push(options.sourceType);
      where += ` AND source_type = $${params.length}`;
    }
    if (options.virtualSensorId) {
      params.push(options.virtualSensorId);
      where += ` AND virtual_sensor_id = $${params.length}`;
    }
    const limit = options.limit || 100;
    params.push(limit);
    const { rows } = await pool.query(`
      SELECT * FROM external_readings ${where}
      ORDER BY timestamp DESC LIMIT $${params.length}
    `, params);
    return rows;
  } catch {
    return [];
  }
}

// --- feature_vectors (v4.0 AI engine) ---
async function saveFeatureVector(row) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO feature_vectors (feature_group, latitude, longitude, ts, source_id, snapshot, features, target, quality, provenance)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      row.feature_group,
      row.latitude,
      row.longitude,
      new Date(row.ts),
      row.source_id,
      row.snapshot || 'local',
      JSON.stringify(row.features || {}),
      row.target ? JSON.stringify(row.target) : null,
      row.quality ?? 0.5,
      row.provenance || [],
    ]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] saveFeatureVector failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getFeatureVectors(options = {}) {
  const conditions = ['1=1'];
  const params = [];
  const { featureGroup, from, to, limit = 5000 } = options;
  if (featureGroup) { params.push(featureGroup); conditions.push(`feature_group = $${params.length}`); }
  if (from) { params.push(new Date(from)); conditions.push(`ts >= $${params.length}`); }
  if (to) { params.push(new Date(to)); conditions.push(`ts <= $${params.length}`); }
  params.push(limit);
  try {
    const { rows } = await pool.query(`
      SELECT * FROM feature_vectors WHERE ${conditions.join(' AND ')}
      ORDER BY ts ASC LIMIT $${params.length}
    `, params);
    return rows;
  } catch {
    return [];
  }
}

// --- sensor_confidence_scores ---
async function upsertSensorConfidence(score) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO sensor_confidence_scores (sensor_id, source_type, overall_score, freshness_score, spatial_consistency, calibration_status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (sensor_id) DO UPDATE SET
        source_type = EXCLUDED.source_type,
        overall_score = EXCLUDED.overall_score,
        freshness_score = EXCLUDED.freshness_score,
        spatial_consistency = EXCLUDED.spatial_consistency,
        calibration_status = EXCLUDED.calibration_status,
        last_evaluated_at = NOW()
      RETURNING *
    `, [
      score.sensorId,
      score.sourceType,
      score.overallScore ?? 0.5,
      score.freshnessScore ?? 0.5,
      score.spatialConsistency ?? 0.5,
      score.calibrationStatus ?? 'unknown',
    ]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] upsertSensorConfidence failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getSensorConfidence(sensorId) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM sensor_confidence_scores WHERE sensor_id = $1
    `, [sensorId]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function listConfidenceScores(limit = 50) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM sensor_confidence_scores ORDER BY overall_score DESC LIMIT $1
    `, [limit]);
    return rows;
  } catch {
    return [];
  }
}

// --- compliance_frameworks ---
async function upsertComplianceFramework(fw) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO compliance_frameworks (country, region, authority, framework_name, pollutant, standard_value, averaging_period, effective_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (country, pollutant, averaging_period) DO UPDATE SET
        region = EXCLUDED.region,
        authority = EXCLUDED.authority,
        framework_name = EXCLUDED.framework_name,
        standard_value = EXCLUDED.standard_value,
        effective_date = EXCLUDED.effective_date
      RETURNING *
    `, [
      fw.country,
      fw.region ?? null,
      fw.authority ?? null,
      fw.frameworkName ?? null,
      fw.pollutant,
      fw.standardValue ?? null,
      fw.averagingPeriod ?? null,
      fw.effectiveDate ?? null,
    ]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] upsertComplianceFramework failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getComplianceFrameworks(options = {}) {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (options.country) {
      params.push(options.country);
      where += ` AND country = $${params.length}`;
    }
    if (options.pollutant) {
      params.push(options.pollutant);
      where += ` AND pollutant = $${params.length}`;
    }
    const { rows } = await pool.query(`
      SELECT * FROM compliance_frameworks ${where}
      ORDER BY country ASC, pollutant ASC
    `, params);
    return rows;
  } catch {
    return [];
  }
}

// --- wind_trajectories ---
async function saveWindTrajectory(traj) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO wind_trajectories (latitude, longitude, altitude, wind_speed, wind_direction, forecast_horizon, forecasted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      traj.latitude ?? null,
      traj.longitude ?? null,
      traj.altitude ?? null,
      traj.windSpeed ?? null,
      traj.windDirection ?? null,
      traj.forecastHorizon ?? null,
      traj.forecastedAt ? new Date(traj.forecastedAt) : new Date(),
    ]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] saveWindTrajectory failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getWindTrajectories(limit = 50) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM wind_trajectories ORDER BY forecasted_at DESC LIMIT $1
    `, [limit]);
    return rows;
  } catch {
    return [];
  }
}

// --- plume_events ---
async function savePlumeEvent(event) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO plume_events (source_lat, source_lon, pollutant, concentration, trajectory_path, affected_regions)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      event.sourceLat ?? null,
      event.sourceLon ?? null,
      event.pollutant ?? null,
      event.concentration ?? null,
      JSON.stringify(event.trajectoryPath || []),
      JSON.stringify(event.affectedRegions || []),
    ]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] savePlumeEvent failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getPlumeEvents(limit = 50) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM plume_events ORDER BY detected_at DESC LIMIT $1
    `, [limit]);
    return rows;
  } catch {
    return [];
  }
}

// --- global_api_keys ---
async function saveGlobalApiKey(keyRecord) {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      INSERT INTO global_api_keys (name, email, key_hash, tier, quota_per_day)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [keyRecord.name, keyRecord.email ?? null, keyRecord.keyHash, keyRecord.tier || 'free', keyRecord.quotaPerDay ?? 1000]);
    return rows[0] || null;
  } catch (err) {
    logger.warn('[DB] saveGlobalApiKey failed', { error: err.message });
    return null;
  } finally {
    if (client) client.release();
  }
}

async function getGlobalApiKeyByHash(keyHash) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM global_api_keys WHERE key_hash = $1
    `, [keyHash]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function listGlobalApiKeys() {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, email, tier, enabled, daily_requests, quota_per_day, created_at, last_used_at
      FROM global_api_keys ORDER BY created_at DESC
    `);
    return rows;
  } catch {
    return [];
  }
}

async function revokeGlobalApiKey(keyHash) {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      UPDATE global_api_keys SET enabled = FALSE WHERE key_hash = $1
    `, [keyHash]);
    return true;
  } catch (err) {
    logger.warn('[DB] revokeGlobalApiKey failed', { error: err.message });
    return false;
  } finally {
    if (client) client.release();
  }
}

async function incrementApiKeyUsage(keyHash) {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      UPDATE global_api_keys SET daily_requests = daily_requests + 1, last_used_at = NOW() WHERE key_hash = $1
    `, [keyHash]);
  } catch (err) {
    logger.warn('[DB] incrementApiKeyUsage failed', { error: err.message });
  } finally {
    if (client) client.release();
  }
}
