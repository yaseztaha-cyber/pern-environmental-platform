/**
 * MQTT Client Wrapper for PERN
 * Connects to local Mosquitto broker via WebSocket
 */

import mqtt from 'mqtt';
import { MQTT_BROKER_WS } from './constants';
type MqttClient = ReturnType<typeof mqtt.connect>;

export interface SensorData {
  device: string;
  timestamp: number;
  sensors: Record<string, number>;
}

export interface ActuatorStatus {
  device: string;
  actuator: string;
  state: 'on' | 'off';
  source?: string;
  triggeredBy?: string;
  value?: number;
  timestamp: number;
}

export interface DiscoveredDevice {
  device: string;
  timestamp: number;
}

export interface DeviceHeartbeat {
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

export class PERN_MQTT_Client {
  private client: MqttClient | null = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private listeners: Array<(data: SensorData) => void> = [];
  private actuatorListeners: Array<(status: ActuatorStatus) => void> = [];
  private deviceListeners: Array<(device: DiscoveredDevice) => void> = [];
  private heartbeatListeners: Array<(heartbeat: DeviceHeartbeat) => void> = [];
  private statusListeners: Array<(status: boolean) => void> = [];
  private reconnectingListeners: Array<(reconnecting: boolean, attempt: number) => void> = [];

  connect(brokerUrl: string = MQTT_BROKER_WS): Promise<boolean> {
    if (this.client && (this.connected || this.connecting || this.reconnecting)) {
      return Promise.resolve(this.connected);
    }

    return new Promise((resolve) => {
      this.connecting = true;
      const backoff = Math.min(3000 * Math.pow(2, this.reconnectAttempts), 30000);
      let settled = false;

      const connectionTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.connecting = false;
          if (this.client) {
            this.client.end(true);
            this.client = null;
          }
          this.reconnecting = true;
          this.reconnectAttempts += 1;
          this.notifyReconnecting(true, this.reconnectAttempts);
          this.notifyStatus(false);
          resolve(false);
        }
      }, 10000);

      try {
        this.client = mqtt.connect(brokerUrl, {
          clientId: `pern-frontend-${Date.now()}`,
          clean: true,
          reconnectPeriod: backoff,
          connectTimeout: 5000,
        });

        this.client.on('connect', () => {
          if (settled) return;
          settled = true;
          clearTimeout(connectionTimeout);
          this.connected = true;
          this.connecting = false;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          if (import.meta.env.DEV) console.log('[MQTT] Connected to', brokerUrl);
          
          // Subscribe to sensor data topics
          this.client?.subscribe('pern/sensors/+/data', { qos: 0 });
          this.client?.subscribe('pern/devices/+/status', { qos: 0 });
          this.client?.subscribe('pern/devices/+/heartbeat', { qos: 0 });
          
          this.notifyStatus(true);
          this.notifyReconnecting(false, 0);
          resolve(true);
        });

        this.client.on('message', (topic, message) => {
          try {
            const payload = JSON.parse(message.toString());
            
            if (topic.includes('/sensors/') && payload.sensors) {
              const device = topic.split('/')[2] || payload.device || 'unknown';
              const data: SensorData = {
                device,
                timestamp: payload.timestamp || Date.now(),
                sensors: payload.sensors,
              };
              this.notifyListeners(data);
              this.notifyDeviceListeners({ device, timestamp: data.timestamp });
            }

            // Real actuator status feedback
            if (topic.includes('/actuators/') && topic.includes('/status')) {
              const actuatorStatus: ActuatorStatus = {
                device: topic.split('/')[2],
                actuator: payload.actuator,
                state: payload.state,
                source: payload.source,
                triggeredBy: payload.triggeredBy,
                value: payload.value,
                timestamp: payload.timestamp || Date.now()
              };
              this.notifyActuatorListeners(actuatorStatus);
            }

            // Device heartbeat (health data)
            if (topic.includes('/devices/') && topic.includes('/heartbeat')) {
              const deviceId = topic.split('/')[2] || payload.device;
              const heartbeat: DeviceHeartbeat = {
                device: deviceId,
                rssi: payload.rssi,
                freeHeap: payload.freeHeap,
                uptime: payload.uptime,
                fwVersion: payload.fwVersion,
                ip: payload.ip,
                wifiChannel: payload.wifiChannel,
                cpuFreq: payload.cpuFreq,
                actuators: payload.actuators || {},
                timestamp: payload.timestamp || Date.now(),
              };
              this.notifyHeartbeatListeners(heartbeat);
            }
          } catch (e) {
            if (import.meta.env.DEV) console.warn('[MQTT] Parse error:', e);
          }
        });

        this.client.on('error', (err) => {
          if (import.meta.env.DEV) console.error('[MQTT] Error:', err.message);
          if (settled) return;
          settled = true;
          clearTimeout(connectionTimeout);
          this.connected = false;
          this.connecting = false;
          if (!this.reconnecting) {
            this.reconnecting = true;
            this.reconnectAttempts += 1;
            this.notifyReconnecting(true, this.reconnectAttempts);
          }
          this.notifyStatus(false);
          resolve(false);
        });

        this.client.on('reconnect', () => {
          this.reconnecting = true;
          this.reconnectAttempts += 1;
          this.connecting = true;
          if (import.meta.env.DEV) console.log('[MQTT] Reconnecting (attempt ' + this.reconnectAttempts + ')');
          this.notifyReconnecting(true, this.reconnectAttempts);
        });

        this.client.on('close', () => {
          this.connected = false;
          this.connecting = false;
          if (!this.reconnecting) {
            this.reconnecting = true;
            this.reconnectAttempts += 1;
            this.notifyReconnecting(true, this.reconnectAttempts);
          }
          this.notifyStatus(false);
        });

      } catch (err) {
        if (import.meta.env.DEV) console.error('[MQTT] Connection failed:', err);
        clearTimeout(connectionTimeout);
        this.connecting = false;
        this.reconnecting = true;
        this.reconnectAttempts += 1;
        this.notifyReconnecting(true, this.reconnectAttempts);
        resolve(false);
      }
    });
  }

  disconnect() {
    if (this.client) {
      this.client.removeAllListeners();
      this.client.end(true);
      this.client = null;
      this.connected = false;
      this.connecting = false;
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this.notifyStatus(false);
      this.notifyReconnecting(false, 0);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  subscribeToTopic(topic: string) {
    if (this.client && this.connected) {
      this.client.subscribe(topic);
    }
  }

  publish(topic: string, message: any) {
    if (this.client && this.connected) {
      this.client.publish(topic, JSON.stringify(message));
    }
  }

  onSensorData(callback: (data: SensorData) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  onActuatorStatus(callback: (status: ActuatorStatus) => void) {
    this.actuatorListeners.push(callback);
    return () => {
      this.actuatorListeners = this.actuatorListeners.filter(cb => cb !== callback);
    };
  }

  onStatusChange(callback: (connected: boolean) => void) {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
    };
  }

  onReconnecting(callback: (reconnecting: boolean, attempt: number) => void) {
    this.reconnectingListeners.push(callback);
    return () => {
      this.reconnectingListeners = this.reconnectingListeners.filter(cb => cb !== callback);
    };
  }

  isReconnecting(): boolean {
    return this.reconnecting;
  }

  onDeviceDiscovered(callback: (device: DiscoveredDevice) => void) {
    this.deviceListeners.push(callback);
    return () => {
      this.deviceListeners = this.deviceListeners.filter(cb => cb !== callback);
    };
  }

  onDeviceHeartbeat(callback: (heartbeat: DeviceHeartbeat) => void) {
    this.heartbeatListeners.push(callback);
    return () => {
      this.heartbeatListeners = this.heartbeatListeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners(data: SensorData) {
    this.listeners.forEach(cb => cb(data));
  }

  private notifyActuatorListeners(status: ActuatorStatus) {
    this.actuatorListeners.forEach(cb => cb(status));
  }

  private notifyDeviceListeners(device: DiscoveredDevice) {
    this.deviceListeners.forEach(cb => cb(device));
  }

  private notifyHeartbeatListeners(heartbeat: DeviceHeartbeat) {
    this.heartbeatListeners.forEach(cb => cb(heartbeat));
  }

  private notifyStatus(status: boolean) {
    this.statusListeners.forEach(cb => cb(status));
  }

  private notifyReconnecting(reconnecting: boolean, attempt: number) {
    this.reconnectingListeners.forEach(cb => cb(reconnecting, attempt));
  }
}

export const mqttClient = new PERN_MQTT_Client();