/**
 * Alert Engine — evaluates alert rules against incoming sensor data.
 * Writes triggered alerts to alert_history and broadcasts via WebSocket.
 */

const db = require('../db');
const logger = require('../utils/logger');

let broadcastAlertFn = null;
let rules = [];
const cooldowns = new Map();

function evaluateCondition(value, operator, threshold) {
  const num = Number(value);
  const thr = Number(threshold);
  if (isNaN(num)) return false;
  switch (operator) {
    case '>': return num > thr;
    case '>=': return num >= thr;
    case '<': return num < thr;
    case '<=': return num <= thr;
    case '==': return Math.abs(num - thr) < 0.01;
    case '!=': return Math.abs(num - thr) >= 0.01;
    case 'between': {
      const parts = String(threshold).split(',');
      if (parts.length < 2) return false;
      const lo = Number(parts[0]), hi = Number(parts[1]);
      return num >= lo && num <= hi;
    }
    case 'outside': {
      const parts = String(threshold).split(',');
      if (parts.length < 2) return false;
      const lo = Number(parts[0]), hi = Number(parts[1]);
      return num < lo || num > hi;
    }
    default: return false;
  }
}

function isInCooldown(ruleId) {
  const last = cooldowns.get(ruleId);
  if (!last) return false;
  return Date.now() - last < 30000;
}

function clearCooldowns() {
  cooldowns.clear();
}

function setCooldown(ruleId) {
  cooldowns.set(ruleId, Date.now());
}

class AlertEngine {
  constructor() {
    this.COOLDOWN_MS = 30000;
  }

  setBroadcastAlert(fn) {
    broadcastAlertFn = fn;
  }

  async loadRules() {
    try {
      rules = await db.getAlertRules();
      logger.info(`[AlertEngine] Loaded ${rules.length} alert rules`);
    } catch {
      rules = [];
    }
  }

  reloadRules(newRules) {
    rules = newRules;
  }

  async evaluateAlertRules(sensorData) {
    if (rules.length === 0) await this.loadRules();

    const { device, sensors } = sensorData;

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const value = sensors[rule.sensor];
      if (value === undefined) continue;

      const num = Number(value);
      if (isNaN(num)) continue;

      if (isInCooldown(rule.id)) continue;

      const triggered = evaluateCondition(num, rule.operator, rule.threshold);

      if (triggered) {
        setCooldown(rule.id);

        const message = `Alert: ${rule.name} — ${rule.sensor}=${num} (threshold ${rule.threshold}) on ${device}`;

        const entry = await db.triggerAlert({
          alertRuleId: rule.id,
          deviceId: device,
          sensor: rule.sensor,
          value: num,
          severity: rule.severity || 'warning',
          message,
        }).catch(() => ({ id: Date.now() }));

        if (broadcastAlertFn) {
          broadcastAlertFn({
            device,
            sensor: rule.sensor,
            level: rule.severity || 'warning',
            title: rule.name,
            detail: message,
            alertId: entry.id,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  startEscalationChecker(intervalMs = 60000) {
    return setInterval(() => {
      const cutoff = Date.now() - 60000;
      for (const [key, ts] of cooldowns.entries()) {
        if (ts < cutoff) cooldowns.delete(key);
      }
    }, intervalMs);
  }
}

const alertEngine = new AlertEngine();

module.exports = alertEngine;
module.exports.evaluateCondition = evaluateCondition;
module.exports.isInCooldown = isInCooldown;
module.exports.clearCooldowns = clearCooldowns;
module.exports.AlertEngine = AlertEngine;
