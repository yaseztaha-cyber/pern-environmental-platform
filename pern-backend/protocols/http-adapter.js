/**
 * HTTP/REST Protocol Adapter
 * Allows devices to send data via simple HTTP POST requests.
 *
 * Commands are delivered via a poll-based queue:
 * - sendCommand() enqueues a command for the device
 * - device polls GET  /api/devices/:deviceId/commands   (returns + drains queue)
 * - device acks      POST /api/devices/:deviceId/commands/:commandId/ack
 */

const { randomUUID } = require('crypto');
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
    this.commandQueue = new Map(); // deviceId -> [{ id, command, queuedAt }]
  }

  _queueFor(deviceId) {
    if (!this.commandQueue.has(deviceId)) this.commandQueue.set(deviceId, []);
    return this.commandQueue.get(deviceId);
  }

  connect() {
    this.app.use(express.json());

    this.app.post('/api/devices/:deviceId/data', (req, res) => {
      const { deviceId } = req.params;
      const payload = req.body || {};

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

    // Device polls for pending commands (drain on read)
    this.app.get('/api/devices/:deviceId/commands', (req, res) => {
      const { deviceId } = req.params;
      const queue = this._queueFor(deviceId);
      const batch = queue.splice(0, queue.length);
      res.json({ success: true, commands: batch });
    });

    // Device acknowledges a delivered command
    this.app.post('/api/devices/:deviceId/commands/:commandId/ack', (req, res) => {
      const { deviceId, commandId } = req.params;
      logger.debug('[HTTP Adapter] Command acknowledged', { deviceId, commandId });
      res.json({ success: true, acknowledged: true, commandId });
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
    const id = randomUUID();
    this._queueFor(deviceId).push({ id, command, queuedAt: new Date().toISOString() });
    logger.debug('[HTTP Adapter] Command queued', { deviceId, actuator: command.actuator, commandId: id });
    return { success: true, queued: true, commandId: id, message: 'Command queued for HTTP device (poll /api/devices/:id/commands)' };
  }

  getPendingCommands(deviceId) {
    return this._queueFor(deviceId).slice();
  }
}

module.exports = HttpAdapter;
