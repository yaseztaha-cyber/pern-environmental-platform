/**
 * PERN Actuator Status Tracking
 * Tracks real actuator states from MQTT feedback
 */

export interface ActuatorStatus {
  device: string;
  actuator: string;
  state: 'on' | 'off';
  lastChanged: string;
  source: string;
}

const actuatorStates: Record<string, ActuatorStatus> = {};

export function updateActuatorStatus(command: any) {
  const key = `${command.device}-${command.actuator}`;
  actuatorStates[key] = {
    device: command.device,
    actuator: command.actuator,
    state: command.state,
    lastChanged: new Date().toISOString(),
    source: command.source || 'automation'
  };
}

export function getActuatorStatus(device: string, actuator: string): ActuatorStatus | null {
  return actuatorStates[`${device}-${actuator}`] || null;
}

export function getAllActuatorStatuses(): ActuatorStatus[] {
  return Object.values(actuatorStates);
}