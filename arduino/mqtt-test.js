/*
 * PERN IoT - Quick MQTT Test
 * Run this from the arduino/ folder: node mqtt-test.js
 *
 * Prerequisites: npm install mqtt
 */

const mqtt = require('mqtt');

const BROKER   = 'mqtt://localhost:1883';
const DEVICE_ID = 'Test-Device-001';

console.log('Connecting to', BROKER, '...');

const client = mqtt.connect(BROKER);

client.on('connect', () => {
  console.log('Connected!\n');

  // Send 5 test readings
  let count = 0;
  const interval = setInterval(() => {
    count++;
    const payload = {
      device: DEVICE_ID,
      timestamp: Date.now(),
      lat: 30.0444,
      lng: 31.2357,
      region: 'Test',
      sensors: {
        tmp:  25 + Math.random() * 5,
        hum:  40 + Math.random() * 20,
        pm25: 10 + Math.random() * 30,
        co2:  400 + Math.random() * 100,
        mq:   Math.random() * 0.8,
      }
    };

    const topic = `pern/sensors/${DEVICE_ID}/data`;
    client.publish(topic, JSON.stringify(payload));
    console.log(`#${count} sent to ${topic}`);
    console.log('  ', JSON.stringify(payload.sensors));

    if (count >= 5) {
      clearInterval(interval);
      setTimeout(() => {
        client.end();
        console.log('\nDone! Check your platform dashboard.');
      }, 500);
    }
  }, 2000);
});

client.on('error', (err) => {
  console.error('MQTT error:', err.message);
  process.exit(1);
});
