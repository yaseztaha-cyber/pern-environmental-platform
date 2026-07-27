/**
 * PERN Real Automation Control System
 * Sends real MQTT actuator commands + ordered execution
 */

import { mqttClient } from './mqtt-client';

export type ActuatorType = 'fan' | 'pump' | 'relay' | 'buzzer' | 'led';
export type ActionType = 'on' | 'off' | 'toggle' | 'pulse';

export interface AutomationAction {
  device: string;
  actuator: ActuatorType;
  command: ActionType;
  duration?: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  sensor: string;
  operator: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  action: AutomationAction;
  priority: number;
  enabled: boolean;
  cooldown: number;
  lastTriggered: number;
}

export interface ActuatorCommand {
  device: string;
  actuator: ActuatorType;
  state: 'on' | 'off';
  source: string;
  timestamp: number;
}

const pendingCommands: ActuatorCommand[] = [];

// Execute automation rule with real MQTT command
export async function executeAutomationRule(rule: AutomationRule, currentValue: number): Promise<boolean> {
  const now = Date.now();
  
  // Cooldown check
  if (rule.lastTriggered && (now - rule.lastTriggered) < rule.cooldown * 1000) {
    return false;
  }

  let triggered = false;
  switch (rule.operator) {
    case '>': triggered = currentValue > rule.threshold; break;
    case '<': triggered = currentValue < rule.threshold; break;
    case '>=': triggered = currentValue >= rule.threshold; break;
    case '<=': triggered = currentValue <= rule.threshold; break;
    case '==': triggered = Math.abs(currentValue - rule.threshold) < 0.1; break;
  }

  if (!triggered || !rule.enabled) return false;

  // Send real actuator command via MQTT
  const topic = `pern/actuators/${rule.action.device}/command`;
  const payload = {
    actuator: rule.action.actuator,
    state: rule.action.command === 'on' ? 'on' : 'off',
    source: rule.id,
    timestamp: now,
    ...(rule.action.command === 'pulse' && { duration: rule.action.duration })
  };

  mqttClient.publish(topic, payload);

  // Record command
  pendingCommands.unshift({
    device: rule.action.device,
    actuator: rule.action.actuator,
    state: rule.action.command === 'on' ? 'on' : 'off',
    source: rule.name,
    timestamp: now
  });

  if (pendingCommands.length > 20) pendingCommands.pop();

  // Update rule
  rule.lastTriggered = now;

  if (import.meta.env.DEV) console.log(`[AUTOMATION] Executed rule: ${rule.name} → ${rule.action.actuator} ${rule.action.command}`);
  return true;
}

// Get recent actuator commands
export function getRecentCommands(): ActuatorCommand[] {
  return [...pendingCommands];
}

// Ordered execution (priority queue)
export function executeRulesInOrder(rules: AutomationRule[], readings: Record<string, number>) {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  
  sorted.forEach(rule => {
    const value = readings[rule.sensor];
    if (value !== undefined) {
      executeAutomationRule(rule, value);
    }
  });
}