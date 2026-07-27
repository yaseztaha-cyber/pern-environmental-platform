/*
 * Arduino USB Serial -> MQTT Bridge
 * Reads JSON from Arduino serial port and publishes to MQTT broker.
 *
 * Usage: node bridge.js [serial-port] [baud-rate]
 *   node bridge.js                    (auto-detect, 115200)
 *   node bridge.js COM3               (specific port, 115200)
 *   node bridge.js COM3 9600          (specific port + baud)
 *
 * Prerequisites: npm install serialport mqtt
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const mqtt = require('mqtt');

// ============ CONFIGURATION ============
const MQTT_SERVER = 'mqtt://localhost:1883';
const DEFAULT_BAUD = 115200;
// ========================================

const PORT_ARG = process.argv[2];
const BAUD_ARG = parseInt(process.argv[3]) || DEFAULT_BAUD;

async function findArduinoPort() {
  const ports = await SerialPort.list();
  const arduinoKeywords = ['arduino', 'ch340', 'cp210', 'ftdi', 'usb-serial', 'usb serial', 'acm'];

  for (const port of ports) {
    const desc = (port.manufacturer || '' + port.pnpId || '' + port.path || '').toLowerCase();
    if (arduinoKeywords.some(kw => desc.includes(kw))) {
      return port.path;
    }
  }

  // If no match, show all ports
  console.log('\nAvailable serial ports:');
  ports.forEach(p => {
    console.log(`  ${p.path} - ${p.manufacturer || 'unknown'} (${p.pnpId || ''})`);
  });
  return null;
}

async function main() {
  console.log('========================================');
  console.log('  PERN IoT - USB Serial Bridge');
  console.log('========================================\n');

  // Find serial port
  let portPath = PORT_ARG;
  if (!portPath) {
    console.log('Auto-detecting Arduino...');
    portPath = await findArduinoPort();
    if (!portPath) {
      console.error('\nCould not auto-detect Arduino.');
      console.error('Run with: node bridge.js COM3');
      console.error('Check Device Manager for your COM port.');
      process.exit(1);
    }
    console.log(`Found: ${portPath}`);
  }

  console.log(`Baud: ${BAUD_ARG}`);
  console.log(`MQTT: ${MQTT_SERVER}\n`);

  // Connect MQTT
  console.log('Connecting to MQTT broker...');
  const mqttClient = mqtt.connect(MQTT_SERVER);

  mqttClient.on('connect', () => {
    console.log('MQTT connected!\n');
    console.log('Waiting for Arduino data...\n');

    // Open serial port
    const port = new SerialPort({ path: portPath, baudRate: BAUD_ARG });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    let msgCount = 0;

    parser.on('data', (line) => {
      line = line.trim();
      if (!line || !line.startsWith('{')) return;

      try {
        const payload = JSON.parse(line);

        // Ensure required fields
        if (!payload.device) {
          payload.device = 'Arduino-UNO-001';
        }
        if (!payload.timestamp) {
          payload.timestamp = Date.now();
        }

        const topic = `pern/sensors/${payload.device}/data`;
        mqttClient.publish(topic, JSON.stringify(payload));
        msgCount++;

        const s = payload.sensors || {};
        console.log(`#${msgCount} [${payload.device}] tmp=${s.tmp || '?'} hum=${s.hum || '?'} pm25=${s.pm25 || '?'} co2=${s.co2 || '?'}`);
      } catch (e) {
        // Not JSON, skip
      }
    });

    port.on('error', (err) => {
      console.error('Serial error:', err.message);
    });

    port.on('open', () => {
      console.log(`Serial ${portPath} opened.\n`);
    });

    port.on('close', () => {
      console.log('\nSerial port closed. Reconnecting in 3s...');
      setTimeout(() => port.open(), 3000);
    });
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err.message);
    console.error('Is the broker running? (launch.bat starts it)');
    process.exit(1);
  });
}

main().catch(console.error);
