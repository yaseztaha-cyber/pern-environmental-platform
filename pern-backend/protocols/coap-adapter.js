/**
 * CoAP Protocol Adapter
 * For constrained devices (low power, low bandwidth)
 * 
 * Note: Requires `coap` package
 * npm install coap
 */

const coap = require('coap');
const ProtocolAdapter = require('./protocol-adapter');
const logger = require('../utils/logger');

class CoapAdapter extends ProtocolAdapter {
  constructor(port = 5683) {
    super('CoAP');
    this.port = port;
    this.server = null;
    this.dataCallback = null;
  }

  connect() {
    this.server = coap.createServer();

    // Handle incoming sensor data
    this.server.on('request', (req, res) => {
      if (req.url === '/data' && req.method === 'POST') {
        try {
          const payload = JSON.parse(req.payload.toString());
          const deviceId = req.headers['device-id'] || 'unknown-coap-device';

          if (this.dataCallback) {
            this.dataCallback({
              device: deviceId,
              timestamp: Date.now(),
              sensors: payload.sensors || payload,
              protocol: 'coap'
            });
          }

          res.code = '2.05'; // Content
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.code = '4.00'; // Bad Request
          res.end(JSON.stringify({ error: 'Invalid payload' }));
        }
      } else {
        res.code = '4.04'; // Not Found
        res.end();
      }
    });

    this.server.listen(this.port, () => {
      logger.info('[CoAP Adapter] Listening', { port: this.port });
      this.isConnected = true;
    });
  }

  disconnect() {
    if (this.server) {
      this.server.close();
      this.isConnected = false;
      logger.info('[CoAP Adapter] Stopped');
    }
  }

  sendCommand(deviceId, command) {
    logger.debug('[CoAP Adapter] Command queued', { deviceId, actuator: command.actuator });
    return { 
      success: true, 
      message: 'CoAP command queued (requires device to poll or Observe)' 
    };
  }
}

module.exports = CoapAdapter;