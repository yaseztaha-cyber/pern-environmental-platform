/**
 * Backend WebSocket Client (port 8081)
 *
 * Connects to the backend actuator WebSocket for real-time broadcasts:
 * sensor-reading, device-heartbeat, actuator-status, alert, notification.
 */

const WS_URL = typeof window !== 'undefined' && window.location
  ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
  : 'ws://localhost:8081/ws';

type Listener = (data: any) => void;

interface WsMessage {
  type: string;
  [key: string]: any;
}

class BackendWsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private connected = false;
  private intentionalClose = false;

  private listeners: Map<string, Set<Listener>> = new Map();

  private getToken(): string | null {
    try {
      return sessionStorage.getItem('pern_auth_token');
    } catch {
      return null;
    }
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.intentionalClose = false;

    const token = this.getToken();
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('_connected', {});
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type) {
          this.emit(msg.type, msg);
        }
      } catch { /* skip malformed */ }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emit('_disconnected', {});
      if (!this.intentionalClose) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* noop */ } this.ws = null; }
    this.connected = false;
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  isConnected(): boolean {
    return this.connected;
  }

  on(type: string, listener: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => { this.listeners.get(type)?.delete(listener); };
  }

  private emit(type: string, data: any): void {
    this.listeners.get(type)?.forEach(fn => { try { fn(data); } catch { /* noop */ } });
  }

  /**
   * Convenience listeners matching backend broadcast types
   */
  onSensorReading(fn: (data: any) => void): () => void { return this.on('sensor-reading', fn); }
  onDeviceHeartbeat(fn: (data: any) => void): () => void { return this.on('device-heartbeat', fn); }
  onActuatorStatus(fn: (data: any) => void): () => void { return this.on('actuator-status', fn); }
  onOtaStatus(fn: (data: any) => void): () => void { return this.on('device-ota-status', fn); }
  onConfigAck(fn: (data: any) => void): () => void { return this.on('device-config-ack', fn); }
  onAlert(fn: (data: any) => void): () => void { return this.on('alert', fn); }
  onNotification(fn: (data: any) => void): () => void { return this.on('notification', fn); }
  onConnectionChange(fn: (connected: boolean) => void): () => void {
    const unsub1 = this.on('_connected', () => fn(true));
    const unsub2 = this.on('_disconnected', () => fn(false));
    return () => { unsub1(); unsub2(); };
  }
}

export const backendWs = new BackendWsClient();
