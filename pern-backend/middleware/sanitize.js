/**
 * Input Sanitization Middleware
 */

const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?<\/script\s*>/gi,
  /<iframe[\s\S]*?<\/iframe\s*>/gi,
  /<object[\s\S]*?<\/object\s*>/gi,
  /<embed[\s\S]*?>/gi,
  /<link[\s\S]*?>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /on\w+\s*=\s*\S+/gi,
  /data\s*:\s*text\/html/gi,
];

const ENCODE_MAP = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  let clean = str;
  for (const pattern of DANGEROUS_PATTERNS) {
    clean = clean.replace(pattern, '');
  }
  return clean.replace(/[<>'"]/g, (ch) => ENCODE_MAP[ch] || ch);
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeInput(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
}

module.exports = { sanitizeInput, sanitizeString, sanitizeObject };
