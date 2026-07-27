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
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) {
      return res.status(400).json({ error: `Invalid value for sensor: ${key}` });
    }
    
    // Reasonable range check
    if (key === 'pm25' && (num < 0 || num > 1000)) {
      return res.status(400).json({ error: 'PM2.5 value out of reasonable range' });
    }
    if (key === 'ph' && (num < 0 || num > 14)) {
      return res.status(400).json({ error: 'pH value out of valid range' });
    }

    sensors[key] = num;
  }

  next();
}

function validateAutomationRule(req, res, next) {
  const { name, sensor, operator, threshold, action } = req.body;

  if (!name || !sensor || !operator || threshold === undefined || !action) {
    return res.status(400).json({ error: 'Missing required rule fields' });
  }

  const validOperators = ['>', '<', '>=', '<=', '==', '!=', 'between', 'outside'];
  if (!validOperators.includes(operator)) {
    return res.status(400).json({ error: 'Invalid operator' });
  }

  next();
}

module.exports = {
  validateSensorData,
  validateAutomationRule
};