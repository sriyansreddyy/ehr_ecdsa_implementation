'use strict';

/**
 * fabricContext.js — Attaches the patientService contract to req
 *
 * All patient-api routes use the single patientService gateway.
 * req.contract is set here so route handlers can call chaincode directly.
 */

const { getContract, reconnect } = require('../fabric/gatewayManager');
const logger = require('../config/logger');

async function fabricContext(req, res, next) {
  try {
    req.contract = getContract('patientService');
    next();
  } catch (err) {
    logger.warn('Gateway unavailable, reconnecting...');
    try {
      await reconnect('patientService');
      req.contract = getContract('patientService');
      next();
    } catch (e) {
      logger.error('Reconnect failed', { error: e.message });
      return res.status(503).json({ success: false, error: 'Fabric network unavailable' });
    }
  }
}

module.exports = { fabricContext };
