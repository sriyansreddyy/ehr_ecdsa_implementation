'use strict';

/**
 * profile.js — Patient's view of their own blockchain record
 *
 * GET /profile        — fetch on-chain patient demographics
 * GET /profile/history — blockchain tx history of patient record
 */

const router = require('express').Router();

const { authenticate }      = require('../middleware/auth');
const { fabricContext }     = require('../middleware/fabricContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const secured = [authenticate, fabricContext];

// ── GET /profile ──────────────────────────────────────────────────────────────
// Returns the patient's on-chain demographic record:
//   patientId, name, age, gender, bloodGroup, contact, address,
//   visitIds[], visitCount, ehrCID, registeredBy, createdAt
router.get('/', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  const result = await req.contract.evaluateTransaction(
    'PatientContract:GetPatient', patientId
  );
  const patient = parseResult(result);
  if (!patient) return res.status(404).json({ success: false, error: 'Patient not found on blockchain' });

  logger.info('Patient viewed profile', { patientId });
  return res.json({ success: true, data: patient });
}));

// ── GET /profile/history ──────────────────────────────────────────────────────
// Returns blockchain tx history of the patient master record.
router.get('/history', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  const result = await req.contract.evaluateTransaction(
    'PatientContract:GetPatientHistory', patientId
  );
  const history = parseResult(result) || [];

  return res.json({ success: true, data: history });
}));

module.exports = router;
