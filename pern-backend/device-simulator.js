/**
 * Device Simulator — publishes fake sensor data for demo devices via MQTT.
 */

const mqtt = require('mqtt');
const logger = require('./utils/logger');

let mqttClient = null;
let intervalId = null;

const DEVICES = [
  {
    id: 'ESP32-Cairo-001',
    name: 'ESP32 Cairo Lab',
    type: 'ESP32',
    sensors: {
      pm25: () => 20 + Math.random() * 30,
      ph: () => 6.8 + Math.random() * 1.2,
      tds: () => 150 + Math.random() * 200,
      wT: () => 22 + Math.random() * 6,
      dO: () => 6 + Math.random() * 4,
      mq: () => Math.random() * 0.8,
      tmp: () => 24 + Math.random() * 8,
      hum: () => 40 + Math.random() * 30,
      co2: () => 350 + Math.random() * 400,
      voc: () => 50 + Math.random() * 300,
      sm: () => 25 + Math.random() * 35,
    },
  },
  {
    id: 'NodeMCU-Delta-02',
    name: 'NodeMCU Delta Station',
    type: 'NodeMCU',
    sensors: {
      pm25: () => 15 + Math.random() * 20,
      ph: () => 7.0 + Math.random() * 0.8,
      tds: () => 100 + Math.random() * 150,
      tmp: () => 25 + Math.random() * 5,
      hum: () => 45 + Math.random() * 25,
      co2: () => 400 + Math.random() * 300,
    },
  },
];

function round(v, d = 2) { return Math.round(v * 10 ** d) / 10 ** d; }

function start() {
  if (intervalId) return;

  const broker = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
  mqttClient = mqtt.connect(broker, { clientId: `sim-${Date.now()}` });

  mqttClient.on('connect', () => {
    logger.info('[Simulator] Connected to MQTT broker');
    intervalId = setInterval(() => {
      for (const device of DEVICES) {
        const sensors = {};
        for (const [key, gen] of Object.entries(device.sensors)) {
          sensors[key] = round(gen());
        }
        const payload = {
          device: device.id,
          timestamp: Date.now(),
          sensors,
        };
        mqttClient.publish(`pern/sensors/${device.id}/data`, JSON.stringify(payload));
      }
    }, 4500);
  });

  mqttClient.on('error', (err) => {
    logger.error('[Simulator] MQTT error', { error: err.message });
  });
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (mqttClient) {
    mqttClient.end(true);
    mqttClient = null;
  }
  logger.info('[Simulator] Stopped');
}

module.exports = { start, stop };
