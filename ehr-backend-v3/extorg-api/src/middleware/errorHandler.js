'use strict';

const logger = require('../config/logger');

function parseFabricError(err) {
  // Extract chaincode error message from gRPC details
  if (err.details && Array.isArray(err.details)) {
    for (const d of err.details) {
      if (d.message) {
        const msg = d.message.replace(/^chaincode response \d+,\s*/i, '').trim();
        if (!msg) continue;
        // Check semantic meaning BEFORE returning generic 400
        if (msg.includes('already exists'))  return { status: 409, message: msg };
        if (msg.includes('Access denied'))   return { status: 403, message: msg };
        if (msg.includes('not found'))       return { status: 404, message: msg };
        return { status: 400, message: msg };
      }
    }
  }
  if (err.message) {
    if (err.message.includes('Access denied'))      return { status: 403, message: err.message };
    if (err.message.includes('not found'))          return { status: 404, message: err.message };
    if (err.message.includes('already exists'))     return { status: 409, message: err.message };
    if (err.message.includes('UNAVAILABLE'))        return { status: 503, message: 'Peer unavailable' };
    if (err.message.includes('DeadlineExceeded'))   return { status: 504, message: 'Request timed out' };
    // Generic chaincode errors
    if (err.message.includes('ABORTED') || err.message.includes('endorse')) {
      return { status: 400, message: err.message };
    }
  }
  return { status: 500, message: 'Internal error' };
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error('Unhandled error', {
    path: req.path, method: req.method,
    userId: req.user?.userId, role: req.user?.role,
    error: err.message,
  });
  const { status, message } = parseFabricError(err);
  return res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
  });
}

// Safely parse chaincode response bytes
function parseResult(resultBytes) {
  if (!resultBytes || resultBytes.length === 0) return null;
  const str = Buffer.from(resultBytes).toString('utf8').replace(/^\0+/, '').trim();
  if (!str || str === 'null') return null;
  try {
    return JSON.parse(str);
  } catch (_) {
    return { value: str };
  }
}

// Wrap async route handlers to forward errors to errorHandler
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, parseFabricError, parseResult, wrap };
