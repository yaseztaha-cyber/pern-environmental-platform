/**
 * Query Parameter Validation Middleware
 * Protects against NoSQL injection, prototype pollution, and type confusion
 * in query string parameters.
 */

const BLOCKED_KEYS = ['__proto__', 'constructor', 'prototype'];
const MAX_QUERY_LENGTH = 200;
const MAX_QUERY_PARAMS = 30;
const MAX_ARRAY_ELEMENTS = 100;

function validateQueryParams(req, res, next) {
  const query = req.query;
  const errors = [];

  if (Object.keys(query).length > MAX_QUERY_PARAMS) {
    return res.status(400).json({ error: 'Too many query parameters' });
  }

  function validateValue(value, path) {
    if (typeof value === 'string') {
      if (value.length > MAX_QUERY_LENGTH) {
        errors.push(`${path} exceeds maximum length`);
        return;
      }
      if (/[\0\n\r]/.test(value)) {
        errors.push(`${path} contains control characters`);
        return;
      }
      if (/^\$/.test(value)) {
        errors.push(`${path} starts with reserved character`);
        return;
      }
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_ELEMENTS) {
        errors.push(`${path} array too large`);
        return;
      }
      value.forEach((v, i) => validateValue(v, `${path}[${i}]`));
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (BLOCKED_KEYS.includes(key)) {
          errors.push(`${path}.${key} is blocked`);
          return;
        }
        validateValue(value[key], `${path}.${key}`);
      }
    }
  }

  for (const [key, value] of Object.entries(query)) {
    if (BLOCKED_KEYS.includes(key)) {
      return res.status(400).json({ error: 'Invalid query parameter' });
    }
    validateValue(value, key);
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid query parameters', details: errors });
  }

  next();
}

module.exports = { validateQueryParams };
