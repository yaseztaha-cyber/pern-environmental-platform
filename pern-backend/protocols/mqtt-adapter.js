/**
 * MQTT Protocol Adapter (Main Protocol)
 * Uses the shared MQTT client from server.js to avoid duplicate connections.
 */

const ProtocolAdapter = require('./protocol-adapter');
const logger = require('../utils/logger');

class MqttAdapter extends ProtocolAdapter {
  constructor(brokerUrl = 'mqtt://localhost:1883') {
    super('MQTT');
    this.brokerUrl = brokerUrl;
    this.client = null;
    this.dataCallback = null;
  }

  setClient(sharedClient) {
    this.client = sharedClient;
    this.isConnected = sharedClient.connected;

    sharedClient.on('connect', () => {
      this.isConnected = true;
    });

    sharedClient.on('close', () => {
      this.isConnected = false;
    });
  }

  connect() {
    if (this.client) return;
    // Fallback: create own client only if no shared client is set
    const mqtt = require('mqtt');
    this.client = mqtt.connect(this.brokerUrl);

    this.client.on('connect', () => {
      logger.info('[MQTT Adapter] Connected', { brokerUrl: this.brokerUrl });
      this.isConnected = true;
      this.client.subscribe('pern/sensors/+/data');
    });

    this.client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (topic.includes('/sensors/') && payload.sensors && this.dataCallback) {
          const device = topic.split('/')[2];
          this.dataCallback({
            device: device || payload.device || 'unknown',
            timestamp: payload.timestamp || Date.now(),
            sensors: payload.sensors,
            protocol: 'mqtt'
          });
        }
      } catch (err) {
        logger.error('[MQTT Adapter] Parse error', { error: err.message });
      }
    });
  }

  disconnect() {
    this.isConnected = false;
    logger.info('[MQTT Adapter] Disconnected');
  }

  sendCommand(deviceId, command) {
    if (!this.client || !this.isConnected) {
      return { success: false, message: 'MQTT not connected' };
    }

    const topic = `pern/devices/${deviceId}/actuators/${command.actuator || 'relay'}/command`;
    this.client.publish(topic, JSON.stringify(command));
    
    return { success: true };
  }
}

module.exports = MqttAdapter;
