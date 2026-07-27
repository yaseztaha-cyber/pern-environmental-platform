/**
 * PERN Real Automation Engine (Server-Side)
 * Receives sensor data from server.js MQTT handler (no duplicate MQTT client)
 * Evaluates rules, dispatches MQTT actuator commands, and writes to alert_history.
 */

const fetch = require('node-fetch');
const db = require('../db');
const logger = require('../utils/logger');

let mqttClientRef = null;
let broadcastAlertRef = null;

function parseAction(action) {
  if (!action) return null;
  if (typeof action === 'object') return action;
  if (typeof action === 'string') {
    try { return JSON.parse(action); } catch { return null; }
  }
  return null;
}

class AutomationEngine {
  constructor() {
    this.rules = [];
    this.isRunning = false;
    this.lastTriggered = new Map();
    this.COOLDOWN_MS = 60000;
  }

  setMqttClient(client) {
    mqttClientRef = client;
  }

  setBroadcastAlert(fn) {
    broadcastAlertRef = fn;
  }

  async start() {
    if (this.isRunning) return;
    await this.loadRulesFromDatabase();
    this.isRunning = true;
    logger.info(`[AutomationEngine] Engine running with ${this.rules.length} active rules`);
  }

  async loadRulesFromDatabase() {
    try {
      const dbRules = await db.getAutomationRules();
      this.rules = dbRules
        .filter(r => r.enabled)
        .map(rule => ({
          ...rule,
          threshold: Number(rule.threshold),
          action: parseAction(rule.action)
        }));
      logger.info(`Loaded ${this.rules.length} automation rules from database`);
    } catch (error) {
      logger.error('Failed to load rules from DB', { error: error.message });
      this.rules = [];
    }
  }

  reloadRules(newRules) {
    this.rules = newRules
      .filter(r => r.enabled)
      .map(rule => ({
        ...rule,
        threshold: Number(rule.threshold),
        action: parseAction(rule.action)
      }));
    logger.info(`[AutomationEngine] Reloaded ${this.rules.length} active rules`);
  }

  async evaluateRules(sensorData) {
    const { device, sensors } = sensorData;

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const sensorValue = sensors[rule.sensor];
      if (sensorValue === undefined) continue;

      const numericValue = Number(sensorValue);
      if (isNaN(numericValue)) continue;

      let triggered = false;
      switch (rule.operator) {
        case '>': triggered = numericValue > rule.threshold; break;
        case '<': triggered = numericValue < rule.threshold; break;
        case '>=': triggered = numericValue >= rule.threshold; break;
        case '<=': triggered = numericValue <= rule.threshold; break;
        case '==': triggered = Math.abs(numericValue - rule.threshold) < 0.1; break;
        case '!=': triggered = Math.abs(numericValue - rule.threshold) >= 0.1; break;
        case 'between': {
          const low = rule.thresholdMin ?? rule.threshold;
          const high = rule.thresholdMax ?? rule.threshold;
          triggered = numericValue >= low && numericValue <= high;
          break;
        }
        case 'outside': {
          const low = rule.thresholdMin ?? rule.threshold;
          const high = rule.thresholdMax ?? rule.threshold;
          triggered = numericValue < low || numericValue > high;
          break;
        }
      }

      if (triggered) {
        const lastFire = this.lastTriggered.get(rule.id) || 0;
        if (Date.now() - lastFire < this.COOLDOWN_MS) continue;
        this.lastTriggered.set(rule.id, Date.now());

        db.saveAutomationLog({
          ruleId: rule.id,
          ruleName: rule.name,
          sensor: rule.sensor,
          value: numericValue
        }).catch(() => {});

        await this.executeAction(rule, numericValue, device);
      }
    }
  }

  async executeAction(rule, currentValue, sourceDevice) {
    const message = `Automation ${rule.name}: ${rule.sensor}=${currentValue} (threshold ${rule.threshold}) on ${sourceDevice}`;
    logger.info(`[AutomationEngine] Rule triggered: ${rule.name} → ${rule.sensor}=${currentValue}`);

    // 1. Send ntfy push notification
    try {
      const topic = process.env.NTFY_TOPIC || 'pern-platform-alerts-2026';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: { 'Title': `Automation: ${rule.name}`, 'Priority': '4', 'Tags': 'automation,pern' },
        body: message,
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (err) {
      logger.error('[AutomationEngine] ntfy failed', { error: err.message });
    }

    // 2. Write to alert_history (so Alerts page sees it)
    try {
      const alertEntry = await db.triggerAlert({
        alertRuleId: rule.id,
        deviceId: sourceDevice,
        sensor: rule.sensor,
        value: currentValue,
        severity: rule.severity || 'warning',
        message,
      });

      if (broadcastAlertRef) {
        broadcastAlertRef({
          device: sourceDevice,
          sensor: rule.sensor,
          level: rule.severity || 'warning',
          title: rule.name,
          detail: message,
          alertId: alertEntry.id,
        });
      }
    } catch (err) {
      logger.error('[AutomationEngine] alert_history write failed', { error: err.message });
    }

    // 3. Server-side actuator MQTT command (if rule has an action with device/actuator)
    if (rule.action && rule.action.device && rule.action.actuator && mqttClientRef && mqttClientRef.connected) {
      const actuatorTopic = `pern/devices/${rule.action.device}/actuators/${rule.action.actuator}/command`;
      const payload = JSON.stringify({
        actuator: rule.action.actuator,
        state: rule.action.command === 'on' ? 'on' : 'off',
        source: `automation:${rule.id}`,
        timestamp: Date.now(),
      });
      mqttClientRef.publish(actuatorTopic, payload, { qos: 1 }, (err) => {
        if (err) {
          logger.error('[AutomationEngine] MQTT actuator publish failed', { error: err.message });
        } else {
          logger.info(`[AutomationEngine] Actuator command: ${rule.action.device}/${rule.action.actuator} → ${rule.action.command}`);
        }
      });

      // Persist the actuator command audit
      db.logActuatorCommand({
        deviceId: rule.action.device,
        actuator: rule.action.actuator,
        command: rule.action.command,
        params: {},
        userId: `automation:${rule.id}`,
        orgId: rule.organization_id || 'default',
        timestamp: Date.now(),
      }).catch(() => {});
    }
  }

  stop() {
    this.isRunning = false;
    logger.info('[AutomationEngine] Stopped');
  }
}

module.exports = new AutomationEngine();
