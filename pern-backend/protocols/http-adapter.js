/**
 * HTTP/REST Protocol Adapter
 * Allows devices to send data via simple HTTP POST requests
 */

const express = require('express');
const ProtocolAdapter = require('./protocol-adapter');
const logger = require('../utils/logger');

class HttpAdapter extends ProtocolAdapter {
  constructor(port = 3001) {
    super('HTTP');
    this.port = port;
    this.app = express();
    this.server = null;
    this.dataCallback = null;
  }

  connect() {
    this.app.use(express.json());

    this.app.post('/api/devices/:deviceId/data', (req, res) => {
      const { deviceId } = req.params;
      const payload = req.body;

      if (this.dataCallback) {
        this.dataCallback({
          device: deviceId,
          timestamp: Date.now(),
          sensors: payload.sensors || payload,
          protocol: 'http'
        });
      }

      res.json({ success: true, received: true });
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', protocol: 'http' });
    });

    this.server = this.app.listen(this.port, () => {
      logger.info('[HTTP Adapter] Listening', { port: this.port });
      this.isConnected = true;
    });

    this.server.on('error', (err) => {
      logger.warn('[HTTP Adapter] Failed to start', { port: this.port, error: err.message });
      this.isConnected = false;
    });
  }

  disconnect() {
    if (this.server) {
      this.server.close();
      this.isConnected = false;
      logger.info('[HTTP Adapter] Stopped');
    }
  }

  sendCommand(deviceId, command) {
    logger.debug('[HTTP Adapter] Command queued', { deviceId, actuator: command.actuator });
    return { success: true, message: 'Command queued (HTTP push not implemented)' };
  }
}

module.exports = HttpAdapter;