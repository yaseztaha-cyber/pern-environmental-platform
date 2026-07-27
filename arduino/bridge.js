/*
 * PERN IoT — Bidirectional USB Serial ↔ MQTT Bridge
 * ===================================================
 * Reads JSON from Arduino/ESP32 serial → publishes to MQTT
 * Subscribes to MQTT actuator commands → writes to serial
 *
 * Usage: node bridge.js [serial-port] [baud-rate] [device-id]
 *   node bridge.js                     (auto-detect, 115200)
 *   node bridge.js COM3                (specific port, 115200)
 *   node bridge.js COM3 115200 ESP32-001  (port + baud + device ID)
 *
 * Prerequisites: npm install serialport mqtt
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const mqtt = require('mqtt');

// ============ CONFIGURATION ============
const MQTT_SERVER   = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const DEFAULT_BAUD  = 115200;
const HEARTBEAT_MS  = 30000;
const RECONNECT_MS  = 3000;
// ========================================

const PORT_ARG  = process.argv[2];
const BAUD_ARG  = parseInt(process.argv[3]) || DEFAULT_BAUD;
const DEV_ID_ARG = process.argv[4];

let deviceCount = 0;

async function findArduinoPort() {
  const ports = await SerialPort.list();
  const arduinoKeywords = ['arduino', 'ch340', 'cp210', 'ftdi', 'usb-serial', 'usb serial', 'acm', 'silicon labs'];

  for (const port of ports) {
    const desc = ((port.manufacturer || '') + (port.pnpId || '') + (port.path || '')).toLowerCase();
    if (arduinoKeywords.some(kw => desc.includes(kw))) {
      return port.path;
    }
  }

  console.log('\nAvailable serial ports:');
  ports.forEach(p => {
    console.log(`  ${p.path} - ${p.manufacturer || 'unknown'} (${p.pnpId || ''})`);
  });
  return null;
}

function createBridge(portPath) {
  console.log('========================================');
  console.log('  PERN IoT — Bidirectional Serial Bridge');
  console.log('========================================\n');
  console.log(`Serial:  ${portPath} @ ${BAUD_ARG} baud`);
  console.log(`MQTT:    ${MQTT_SERVER}\n`);

  // Connect MQTT
  console.log('Connecting to MQTT broker...');
  const mqttClient = mqtt.connect(MQTT_SERVER, {
    clientId: `pern-bridge-${Date.now()}`,
    clean: true,
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected!\n');
    deviceCount++;

    // Open serial port
    const port = new SerialPort({ path: portPath, baudRate: BAUD_ARG });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    let msgCount = 0;
    let deviceId = DEV_ID_ARG || 'Arduino-USB-001';
    let receivedCommand = false;

    // === SERIAL → MQTT: Publish sensor data ===
    parser.on('data', (line) => {
      line = line.trim();
      if (!line || !line.startsWith('{')) return;

      try {
        const payload = JSON.parse(line);

        // Auto-detect device ID from payload
        if (payload.device) {
          deviceId = payload.device;
        } else {
          payload.device = deviceId;
        }
        if (!payload.timestamp) {
          payload.timestamp = Date.now();
        }

        // Publish sensor data
        const sensorTopic = `pern/sensors/${payload.device}/data`;
        mqttClient.publish(sensorTopic, JSON.stringify(payload));
        msgCount++;

        const s = payload.sensors || {};
        const sensorStr = Object.entries(s).map(([k, v]) => `${k}=${v}`).join(' ');
        console.log(`[TX] #${msgCount} [${payload.device}] ${sensorStr}`);

        // Auto-subscribe to device's actuator commands on first data
        if (!receivedCommand) {
          const cmdTopic = `pern/actuators/${payload.device}/command`;
          mqttClient.subscribe(cmdTopic);
          console.log(`[MQTT] Subscribed to: ${cmdTopic}`);

          // Also subscribe to config updates
          const cfgTopic = `pern/devices/${payload.device}/config`;
          mqttClient.subscribe(cfgTopic);
          console.log(`[MQTT] Subscribed to: ${cfgTopic}`);

          receivedCommand = true;
        }
      } catch (e) {
        // Not JSON, skip
      }
    });

    // === MQTT → SERIAL: Forward actuator commands ===
    mqttClient.on('message', (topic, message) => {
      try {
        // Check if this is an actuator command for our device
        if (topic.includes('/actuators/') && topic.includes('/command')) {
          const cmd = JSON.parse(message.toString());
          // Forward command to serial device
          const serialCmd = JSON.stringify(cmd) + '\n';
          port.write(serialCmd, (err) => {
            if (err) {
              console.error('[TX-CMD] Write error:', err.message);
            } else {
              console.log(`[TX-CMD] → ${cmd.actuator}: ${cmd.action}`);
            }
          });
        }

        // Check if this is a config update
        if (topic.includes('/config')) {
          const cfg = JSON.parse(message.toString());
          const cfgCmd = JSON.stringify({ type: 'config', ...cfg }) + '\n';
          port.write(cfgCmd, (err) => {
            if (err) {
              console.error('[TX-CFG] Write error:', err.message);
            } else {
              console.log('[TX-CFG] Config forwarded to device');
            }
          });
        }
      } catch (e) {
        // Not JSON, skip
      }
    });

    // === Serial port events ===
    port.on('error', (err) => {
      console.error('[Serial] Error:', err.message);
    });

    port.on('open', () => {
      console.log(`[Serial] ${portPath} opened.\n`);
      console.log('Waiting for device data...\n');
    });

    port.on('close', () => {
      console.log('\n[Serial] Port closed. Reconnecting in 3s...');
      setTimeout(() => {
        try { port.open(); } catch {}
      }, RECONNECT_MS);
    });

    // === Bridge heartbeat ===
    const heartbeatTimer = setInterval(() => {
      if (mqttClient.connected) {
        const hb = {
          device: deviceId,
          type: 'bridge-heartbeat',
          timestamp: Date.now(),
          messagesRelayed: msgCount,
          uptime: process.uptime(),
          platform: process.platform,
        };
        mqttClient.publish(`pern/devices/${deviceId}/bridge-status`, JSON.stringify(hb));
      }
    }, HEARTBEAT_MS);

    // Cleanup on exit
    process.on('SIGINT', () => {
      console.log('\n[BRIDGE] Shutting down...');
      clearInterval(heartbeatTimer);
      try { port.close(); } catch {}
      mqttClient.end();
      process.exit(0);
    });
  });

  mqttClient.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
    console.error('Is the broker running? (launch.bat starts it)');
    process.exit(1);
  });

  mqttClient.on('close', () => {
    console.log('[MQTT] Connection lost. Reconnecting...');
  });
}

async function main() {
  let portPath = PORT_ARG;
  if (!portPath) {
    console.log('Auto-detecting Arduino/ESP32...');
    portPath = await findArduinoPort();
    if (!portPath) {
      console.error('\nCould not auto-detect device.');
      console.error('Run with: node bridge.js COM3');
      console.error('Check Device Manager for your COM port.\n');
      process.exit(1);
    }
    console.log(`Found: ${portPath}`);
  }

  createBridge(portPath);
}

main().catch(console.error);
