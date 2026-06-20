'use strict';

const jwt    = require('jsonwebtoken');
const logger = require('../config/logger');
const { knownRoles } = require('../fabric/peerRouter');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  throw new Error('JWT_SECRET is required');
}

function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ success: false, error: msg });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!allowed.includes(req.user.role)) {
      logger.warn('Access denied', { userId: req.user.userId, role: req.user.role, required: allowed });
      return res.status(403).json({ success: false, error: `Role '${req.user.role}' not permitted` });
    }
    next();
  };
}

function requireAnyKnownRole(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  if (!knownRoles().includes(req.user.role)) {
    return res.status(403).json({ success: false, error: `Unknown role: '${req.user.role}'` });
  }
  next();
}

module.exports = { authenticate, requireRole, requireAnyKnownRole };
