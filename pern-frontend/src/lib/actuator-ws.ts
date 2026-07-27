/**
 * WebSocket Client for Real Actuator Feedback + Device Heartbeat
 */

export interface ActuatorStatusUpdate {
  type: 'actuator-status';
  device: string;
  actuator: string;
  state: 'on' | 'off';
  source?: string;
  triggeredBy?: string;
  value?: number;
  timestamp: number;
}

let ws: WebSocket | null = null;
const listeners: Array<(status: ActuatorStatusUpdate) => void> = [];
const alertListeners: Array<(alert: any) => void> = [];
const heartbeatListeners: Array<(heartbeat: DeviceHeartbeat) => void> = [];
const sensorReadingListeners: Array<(reading: SensorReadingUpdate) => void> = [];

export interface AlertUpdate {
  type: 'alert';
  device: string;
  sensor: string;
  level: string;
  title: string;
  detail: string;
  alertId?: number;
  timestamp: number;
}

export interface DeviceHeartbeat {
  type: 'device-heartbeat';
  device: string;
  rssi: number;
  freeHeap: number;
  uptime: number;
  fwVersion: string;
  ip: string;
  wifiChannel: number;
  cpuFreq: number;
  actuators: Record<string, boolean>;
  timestamp: number;
}

export interface SensorReadingUpdate {
  type: 'sensor-reading';
  device: string;
  sensors: Record<string, number>;
  timestamp: number;
}

export function connectActuatorWebSocket(url = 'ws://localhost:8081') {
  if (ws) return;

  ws = new WebSocket(url);

  ws.onopen = () => {
    if (import.meta.env.DEV) console.log('[ActuatorWS] Connected to actuator feedback WebSocket');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'actuator-status') {
        listeners.forEach(cb => cb(data));
      }
      if (data.type === 'alert') {
        alertListeners.forEach(cb => cb(data));
      }
      if (data.type === 'device-heartbeat') {
        heartbeatListeners.forEach(cb => cb(data));
      }
      if (data.type === 'sensor-reading') {
        sensorReadingListeners.forEach(cb => cb(data));
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[ActuatorWS] Parse error:', err);
    }
  };

  ws.onclose = () => {
    if (import.meta.env.DEV) console.log('[ActuatorWS] Disconnected');
    ws = null;
  };

  ws.onerror = (err) => {
    if (import.meta.env.DEV) console.error('[ActuatorWS] Error:', err);
  };
}

export function onActuatorStatus(callback: (status: ActuatorStatusUpdate) => void) {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) listeners.splice(index, 1);
  };
}

export function onAlert(callback: (alert: AlertUpdate) => void) {
  alertListeners.push(callback);
  return () => {
    const index = alertListeners.indexOf(callback);
    if (index > -1) alertListeners.splice(index, 1);
  };
}

export function onDeviceHeartbeat(callback: (heartbeat: DeviceHeartbeat) => void) {
  heartbeatListeners.push(callback);
  return () => {
    const index = heartbeatListeners.indexOf(callback);
    if (index > -1) heartbeatListeners.splice(index, 1);
  };
}

export function onSensorReading(callback: (reading: SensorReadingUpdate) => void) {
  sensorReadingListeners.push(callback);
  return () => {
    const index = sensorReadingListeners.indexOf(callback);
    if (index > -1) sensorReadingListeners.splice(index, 1);
  };
}

export function disconnectActuatorWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}
