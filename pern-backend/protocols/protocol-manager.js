/**
 * PERN Protocol Manager
 * Manages multiple IoT protocols (MQTT, HTTP, CoAP, etc.)
 */

const HttpAdapter = require('./http-adapter');
const WebSocketAdapter = require('./websocket-adapter');
const logger = require('../utils/logger');

class ProtocolManager {
  constructor() {
    this.adapters = new Map();
    this.dataHandlers = [];
  }

  /**
   * Register a protocol adapter
   */
  register(adapter) {
    this.adapters.set(adapter.name, adapter);

    // Forward data from adapter to all handlers
    adapter.onData((data) => {
      this.dataHandlers.forEach(handler => handler(data));
    });

    logger.info('[ProtocolManager] Registered adapter', { adapter: adapter.name });
  }

  /**
   * Start all registered protocols
   */
  startAll() {
    this.adapters.forEach(adapter => {
      try {
        adapter.connect();
      } catch (err) {
        logger.warn('[ProtocolManager] Failed to start adapter', { adapter: adapter.name, error: err.message });
      }
    });
  }

  /**
   * Stop all protocols
   */
  stopAll() {
    this.adapters.forEach(adapter => {
      adapter.disconnect();
    });
  }

  /**
   * Send command to a device (tries all protocols)
   */
  sendCommand(deviceId, command) {
    const results = [];
    
    this.adapters.forEach(adapter => {
      try {
        const result = adapter.sendCommand(deviceId, command);
        results.push({ protocol: adapter.name, ...result });
      } catch (err) {
        results.push({ protocol: adapter.name, success: false, error: err.message });
      }
    });

    return results;
  }

  /**
   * Subscribe to incoming data from any protocol
   */
  onData(callback) {
    this.dataHandlers.push(callback);
  }

  /**
   * Get status of all protocols
   */
  getStatus() {
    const adapters = [];
    this.adapters.forEach((adapter, name) => {
      adapters.push({ name, connected: adapter.isConnected });
    });
    return adapters;
  }
}

// Singleton instance
const protocolManager = new ProtocolManager();

// Register default protocols
// NOTE: MQTT is handled directly by server.js to avoid double-ingestion.
// Only register non-MQTT adapters here.
const httpAdapter = new HttpAdapter(3002);
const wsAdapter = new WebSocketAdapter(8080);
// const coapAdapter = new CoapAdapter(5683);
// const lorawanAdapter = new LoraWanAdapter();

protocolManager.register(httpAdapter);
protocolManager.register(wsAdapter);

// Future protocols (uncomment when needed):
// protocolManager.register(coapAdapter);
// protocolManager.register(lorawanAdapter);

module.exports = protocolManager;