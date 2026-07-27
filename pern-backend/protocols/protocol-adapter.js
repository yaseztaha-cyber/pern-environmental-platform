/**
 * PERN Device Connection Abstraction Layer
 * 
 * This allows the system to support multiple IoT protocols:
 * - MQTT (primary)
 * - HTTP/REST
 * - CoAP (future)
 * - LoRaWAN / NB-IoT (future)
 */

class ProtocolAdapter {
  constructor(name) {
    this.name = name;
    this.isConnected = false;
  }

  connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  // Called when new sensor data arrives
  onData(callback) {
    this.dataCallback = callback;
  }

  // Send command to device
  sendCommand(deviceId, command) {
    throw new Error('sendCommand() must be implemented by subclass');
  }
}

module.exports = ProtocolAdapter;