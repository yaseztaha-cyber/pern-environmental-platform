/**
 * Simple Input Validation Middleware
 */

function validateSensorData(req, res, next) {
  const { device, sensors } = req.body;

  if (!device || typeof device !== 'string' || device.length < 3) {
    return res.status(400).json({ error: 'Invalid or missing device ID' });
  }

  if (!sensors || typeof sensors !== 'object' || Object.keys(sensors).length === 0) {
    return res.status(400).json({ error: 'Invalid or missing sensor data' });
  }

  // Basic sensor value validation
  for (const [key, value] of Object.entries(sensors)) {
    if (typeof value !== 'number' || isNaN(value)) {
      return res.status(400).json({ error: `Invalid value for sensor: ${key}` });
    }
    
    // Reasonable range check
    if (key === 'pm25' && (value < 0 || value > 1000)) {
      return res.status(400).json({ error: 'PM2.5 value out of reasonable range' });
    }
    if (key === 'ph' && (value < 0 || value > 14)) {
      return res.status(400).json({ error: 'pH value out of valid range' });
    }
  }

  next();
}

function validateAutomationRule(req, res, next) {
  const { name, sensor, operator, threshold, action } = req.body;

  if (!name || !sensor || !operator || threshold === undefined || !action) {
    return res.status(400).json({ error: 'Missing required rule fields' });
  }

  const validOperators = ['>', '<', '>=', '<=', '=='];
  if (!validOperators.includes(operator)) {
    return res.status(400).json({ error: 'Invalid operator' });
  }

  next();
}

module.exports = {
  validateSensorData,
  validateAutomationRule
};