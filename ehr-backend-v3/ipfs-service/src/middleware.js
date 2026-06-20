'use strict';

const logger = require('./logger');

// ── API key auth ──────────────────────────────────────────────────────────────
// All requests to ipfs-service must carry X-IPFS-Key header.
// This prevents other services on the network from calling ipfs-service directly.

function requireApiKey(req, res, next) {
  const key = req.headers['x-ipfs-key'];
  if (!key || key !== process.env.IPFS_SERVICE_KEY) {
    logger.warn('Unauthorized ipfs-service request', {
      ip:   req.ip,
      path: req.path,
    });
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

// ── Error handler ─────────────────────────────────────────────────────────────

function errorHandler(err, req, res, next) {
  logger.error('ipfs-service error', {
    message: err.message,
    path:    req.path,
    method:  req.method,
  });

  // Axios errors from Kubo API
  if (err.response) {
    return res.status(502).json({
      success: false,
      error:   'IPFS node error',
      detail:  err.response.data || err.message,
    });
  }

  // Timeout or connection refused
  if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
    return res.status(503).json({
      success: false,
      error:   'IPFS node unavailable — is Kubo running?',
    });
  }

  return res.status(500).json({
    success: false,
    error:   err.message || 'Internal error',
  });
}

module.exports = { requireApiKey, errorHandler };
