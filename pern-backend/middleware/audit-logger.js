/**
 * Enhanced Audit Logger Middleware
 * Logs all state-changing operations with request ID tracking.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const db = require('../db');

function generateRequestId() {
  return `req_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Middleware that stamps an explicit audit label on a request. `auditLogger`
 * honours these labels so routes keep meaningful action names (e.g.
 * 'sensors.ingest') instead of the raw `METHOD /path`.
 */
function withAuditLabel(action, resourceType) {
  return (req, res, next) => {
    req.auditAction = action;
    req.auditResource = resourceType;
    next();
  };
}

function auditLogger(req, res, next) {
  const requestId = generateRequestId();
  req.requestId = requestId;

  res.setHeader('X-Request-Id', requestId);

  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const originalJson = res.json.bind(res);
    const startTime = Date.now();

    res.json = function (body) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      if (statusCode >= 200 && statusCode < 300) {
        const logEntry = {
          request_id: requestId,
          user_id: req.userId || req.user?.sub || req.user?.id || 'anonymous',
          organization_id: req.orgId || null,
          action: req.auditAction || `${req.method} ${req.path}`,
          resource_type: req.auditResource || req.path.split('/')[3] || 'unknown',
          resource_id: req.params?.id || body?.id || req.body?.id || null,
          details: {
            method: req.method,
            path: req.path,
            query: req.query,
            status: statusCode,
            duration_ms: duration,
          },
          ip_address: req.ip || req.connection?.remoteAddress || '',
          user_agent: req.get('user-agent') || '',
        };

        logger.info('[Audit]', logEntry);

        db.logAuditEvent({
          user_id: logEntry.user_id,
          action: logEntry.action,
          resource_type: logEntry.resource_type,
          resource_id: String(logEntry.resource_id || ''),
          details: logEntry.details,
          ip_address: logEntry.ip_address,
          user_agent: logEntry.user_agent,
          organization_id: logEntry.organization_id,
        }).catch(() => {});
      }

      return originalJson(body);
    };
  }

  next();
}

module.exports = { auditLogger, withAuditLabel, generateRequestId };
