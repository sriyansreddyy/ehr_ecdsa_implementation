'use strict';

const logger = require('../config/logger');

function parseFabricError(err) {
  if (err.details && Array.isArray(err.details)) {
    for (const d of err.details) {
      if (d.message) {
        const msg = d.message.replace(/^chaincode response \d+,\s*/i, '').trim();
        if (msg) {
        if (msg.includes('already exists'))  return { status: 409, message: msg };
        if (msg.includes('Access denied'))   return { status: 403, message: msg };
        if (msg.includes('not found'))       return { status: 404, message: msg };
        return { status: 400, message: msg };
      }
      }
    }
  }
  if (err.message) {
    if (err.message.includes('Access denied'))    return { status: 403, message: err.message };
    if (err.message.includes('not found'))        return { status: 404, message: err.message };
    if (err.message.includes('already exists'))   return { status: 409, message: err.message };
    if (err.message.includes('UNAVAILABLE'))      return { status: 503, message: 'Peer unavailable' };
    if (err.message.includes('DeadlineExceeded')) return { status: 504, message: 'Request timed out' };
  }
  return { status: 500, message: err.message || 'Internal error' };
}

function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    path:      req.path,
    method:    req.method,
    patientId: req.patient?.patientId,
    error:     err.message,
  });
  const { status, message } = parseFabricError(err);
  return res.status(status).json({
    success: false,
    error:   message,
    ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
  });
}

function parseResult(resultBytes) {
  if (!resultBytes || resultBytes.length === 0) return null;
  const str = Buffer.from(resultBytes).toString('utf8').replace(/^\0+/, '').trim();
  if (!str || str === 'null') return null;
  try { return JSON.parse(str); } catch (_) { return { value: str }; }
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, parseResult, wrap };
