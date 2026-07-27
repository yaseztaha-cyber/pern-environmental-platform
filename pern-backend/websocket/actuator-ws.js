/**
 * PERN WebSocket Server for Real Actuator Feedback
 *
 * Authenticates connections via JWT token in the upgrade request,
 * then broadcasts sensor readings, actuator status, alerts, and
 * notifications to all authorized clients.
 */

const WebSocket = require('ws');
const url = require('url');
const logger = require('../utils/logger');
const { verifyLogtoToken, ENFORCE_AUTH } = require('../auth');

let wss = null;
const clients = new Set();
let heartbeatInterval = null;

async function authenticateConnection(req) {
  // Extract token from query string or Authorization header
  const parsed = url.parse(req.url, true);
  const token = parsed.query.token
    || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    if (!ENFORCE_AUTH) return { sub: 'dev-ws-user', role: 'admin' };
    return null;
  }

  const result = await verifyLogtoToken(token);
  if (result.valid) return result.payload;
  if (!ENFORCE_AUTH) return { sub: 'dev-ws-user', role: 'admin' };
  return null;
}

function startActuatorWebSocket(port = 8081) {
  wss = new WebSocket.Server({ port, maxPayload: 64 * 1024 });

  wss.on('error', (err) => {
    logger.error('[ActuatorWS] Server error', { error: err.message });
  });

  wss.on('connection', (ws, req) => {
    // Authenticate asynchronously, then decide whether to keep the connection
    authenticateConnection(req).then(user => {
      if (!user) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      ws.user = user;
      ws.isAlive = true;
      clients.add(ws);
      logger.info('[ActuatorWS] Client connected', { user: user.sub, total: clients.size });

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('error', (err) => {
        if (err.message !== 'read ECONNRESET' && err.message !== 'write after end') {
          logger.warn('[ActuatorWS] Client error', { error: err.message });
        }
        clients.delete(ws);
      });

      ws.on('close', () => {
        clients.delete(ws);
        logger.debug('[ActuatorWS] Client disconnected', { user: user.sub, total: clients.size });
      });
    }).catch(err => {
      logger.error('[ActuatorWS] Auth error', { error: err.message });
      ws.close(4001, 'Unauthorized');
    });
  });

  // Setup 30-second ping/pong heartbeat check
  heartbeatInterval = setInterval(() => {
    clients.forEach((ws) => {
      if (ws.isAlive === false) {
        clients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  logger.info('[ActuatorWS] WebSocket server running', { port });
}

function stopActuatorWebSocket() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (!wss) return;
  clients.forEach((client) => {
    try { client.close(); } catch (e) { /* noop */ }
  });
  clients.clear();
  wss.close();
  wss = null;
}

function broadcastActuatorStatus(status) {
  const message = JSON.stringify({
    type: 'actuator-status',
    ...status,
    timestamp: Date.now()
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastNotification(title, message, severity) {
  const payload = JSON.stringify({
    type: 'notification',
    title,
    message,
    severity,
    timestamp: Date.now(),
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastSensorReading(reading) {
  const payload = JSON.stringify({
    type: 'sensor-reading',
    device: reading.device,
    sensors: reading.sensors,
    timestamp: reading.timestamp,
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastAlert(alert) {
  const payload = JSON.stringify({
    type: 'alert',
    ...alert,
    timestamp: Date.now(),
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function getClientCount() {
  return clients.size;
}

module.exports = {
  startActuatorWebSocket,
  stopActuatorWebSocket,
  broadcastActuatorStatus,
  broadcastNotification,
  broadcastSensorReading,
  broadcastAlert,
  getClientCount,
};
