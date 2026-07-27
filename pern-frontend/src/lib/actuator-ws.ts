/**
 * WebSocket Client for Real Actuator Feedback
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

export function disconnectActuatorWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}