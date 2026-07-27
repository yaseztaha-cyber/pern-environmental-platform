/**
 * WebSocket Protocol Adapter
 * For browser-based devices and web clients
 */

const WebSocket = require('ws');
const ProtocolAdapter = require('./protocol-adapter');
const logger = require('../utils/logger');

class WebSocketAdapter extends ProtocolAdapter {
  constructor(port = 8080) {
    super('WebSocket');
    this.port = port;
    this.server = null;
    this.clients = new Map(); // deviceId -> WebSocket
    this.dataCallback = null;
  }

  connect() {
    this.server = new WebSocket.Server({ port: this.port });

    this.server.on('error', (err) => {
      logger.warn('[WebSocket Adapter] Failed to start', { port: this.port, error: err.message });
      this.isConnected = false;
    });

    this.server.on('connection', (ws, req) => {
      const deviceId = req.headers['device-id'] || `browser-${Date.now()}`;

      this.clients.set(deviceId, ws);
      logger.info('[WebSocket Adapter] Browser device connected', { deviceId });

      ws.on('message', (message) => {
        try {
          const payload = JSON.parse(message.toString());

          if (this.dataCallback) {
            this.dataCallback({
              device: deviceId,
              timestamp: Date.now(),
              sensors: payload.sensors || payload,
              protocol: 'websocket'
            });
          }
        } catch (err) {
          logger.error('[WebSocket Adapter] Parse error', { error: err.message });
        }
      });

      ws.on('close', () => {
        this.clients.delete(deviceId);
        logger.debug('[WebSocket Adapter] Device disconnected', { deviceId });
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        deviceId,
        message: 'Connected to PERN via WebSocket'
      }));
    });

    logger.info('[WebSocket Adapter] Listening', { port: this.port });
    this.isConnected = true;
  }

  disconnect() {
    if (this.server) {
      this.server.close();
      this.clients.clear();
      this.isConnected = false;
      logger.info('[WebSocket Adapter] Stopped');
    }
  }

  sendCommand(deviceId, command) {
    const ws = this.clients.get(deviceId);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return { success: false, message: 'Device not connected via WebSocket' };
    }

    ws.send(JSON.stringify({
      type: 'command',
      ...command
    }));

    return { success: true };
  }

  getConnectedDevices() {
    return Array.from(this.clients.keys());
  }
}

module.exports = WebSocketAdapter;