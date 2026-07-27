/**
 * Role-Based Access Control Middleware
 */

const VALID_ROLES = ['admin', 'manager', 'member', 'viewer'];

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      if (process.env.ENFORCE_AUTH === 'true') {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return next();
    }
    const role = user.role || user.roles?.[0] || 'viewer';
    if (allowedRoles.length === 0 || allowedRoles.includes(role)) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

function requireOrg(req, res, next) {
  if (!req.orgId && process.env.ENFORCE_AUTH === 'true') {
    return res.status(403).json({ error: 'Organization context required' });
  }
  next();
}

function requireOwnership(getOwnerId) {
  return (req, res, next) => {
    if (req.user?.role === 'admin' || req.user?.role === 'manager') return next();
    const ownerId = typeof getOwnerId === 'function' ? getOwnerId(req) : (typeof getOwnerId === 'string' ? getOwnerId : req.params.id);
    if (ownerId && req.user?.id === ownerId) return next();
    return res.status(403).json({ error: 'Access denied: not resource owner' });
  };
}

module.exports = { requireRole, requireOrg, requireOwnership };
