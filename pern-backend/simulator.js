/**
 * PERN Device Simulator
 * Publishes realistic sensor data to the local MQTT broker
 * 
 * Usage: node simulator.js
 */

const mqtt = require('mqtt');
const logger = require('./utils/logger');

const client = mqtt.connect('mqtt://localhost:1883');

const devices = [
  { id: 'ESP32-Cairo-001', region: 'Giza' },
  { id: 'NodeMCU-Delta-02', region: 'Cairo' },
];

client.on('connect', () => {
  logger.info('[Simulator] Connected to MQTT broker');
  
  setInterval(() => {
    devices.forEach(device => {
      const data = {
        device: device.id,
        timestamp: Date.now(),
        sensors: {
          ph: +(7.1 + (Math.random() - 0.5) * 0.6).toFixed(2),
          tds: Math.floor(165 + Math.random() * 45),
          wT: +(23.5 + (Math.random() - 0.5) * 3).toFixed(1),
          dO: +(8.3 + (Math.random() - 0.5) * 1.4).toFixed(1),
          pm25: Math.floor(14 + Math.random() * 38),
          mq: +(0.35 + Math.random() * 0.65).toFixed(2),
          tmp: +(27.8 + (Math.random() - 0.5) * 4).toFixed(1),
          hum: Math.floor(48 + Math.random() * 22),
          co2: Math.floor(410 + Math.random() * 95),
          voc: Math.floor(120 + Math.random() * 95),
          sm: Math.floor(32 + Math.random() * 22),
        }
      };

      client.publish(`pern/sensors/${device.id}/data`, JSON.stringify(data));
      logger.debug('[Simulator] Published data', { deviceId: device.id });
    });
  }, 4500);
});