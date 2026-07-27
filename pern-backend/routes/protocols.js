/**
 * Protocol Status API
 */

const express = require('express');
const router = express.Router();
const protocolManager = require('../protocols/protocol-manager');
const db = require('../db');
const logger = require('../utils/logger');

// Get status of all protocols
router.get('/status', (req, res) => {
  const status = protocolManager.getStatus();
  // MQTT is managed by server.js directly — expose it via protocolManager.mqttClient
  if (protocolManager.mqttClient) {
    const hasMQTT = status.some(p => p.name === 'MQTT');
    if (!hasMQTT) {
      status.push({ name: 'MQTT', connected: protocolManager.mqttClient.connected });
    }
  }
  res.json({
    protocols: status,
    timestamp: new Date().toISOString()
  });
});

// Get connected devices per protocol
router.get('/devices', async (req, res) => {
  try {
    const devices = await db.getDevices();
    const protocols = protocolManager.getStatus();

    const devicesByProtocol = {};
    for (const proto of protocols) {
      devicesByProtocol[proto.name] = {
        connected: proto.connected,
        deviceCount: devices.filter(d => {
          if (proto.name === 'MQTT') return d.type === 'mqtt' || d.type === 'esp32' || d.type === 'nodemcu';
          if (proto.name === 'HTTP') return d.type === 'http' || d.type === 'http-device';
          if (proto.name === 'WebSocket') return d.type === 'websocket' || d.type === 'ws-device';
          return false;
        }).length,
      };
    }

    res.json({
      protocols: devicesByProtocol,
      totalDevices: devices.length,
      devices: devices.slice(0, 50),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('[Protocols] Failed to list devices', { error: err.message });
    res.json({ protocols: {}, totalDevices: 0, devices: [], timestamp: new Date().toISOString() });
  }
});

module.exports = router;