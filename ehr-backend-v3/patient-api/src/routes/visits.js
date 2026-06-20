'use strict';

/**
 * visits.js — Patient visit history routes
 *
 * GET /visits          — list all visits (on-chain index + status, no IPFS content)
 * GET /visits/:id      — get full visit detail (on-chain + IPFS clinical content)
 * GET /visits/:id/history — blockchain tx history for this visit
 * GET /visits/:id/cids    — all IPFS CID versions of this visit
 */

const router = require('express').Router();

const { authenticate }      = require('../middleware/auth');
const { fabricContext }     = require('../middleware/fabricContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID }        = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const secured = [authenticate, fabricContext];

// ── GET /visits ───────────────────────────────────────────────────────────────
// Returns all on-chain visit records for this patient.
// Each record includes: visitId, status, assignedDoctor, assignedNurse,
//                       visitCID, claimId, claimAmount, claimStatus
// Does NOT fetch IPFS content (too many calls if many visits).
// Use GET /visits/:id for full clinical detail.
router.get('/', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  const result = await req.contract.evaluateTransaction(
    'VisitContract:GetPatientVisitsFull', patientId
  );
  const visits = parseResult(result) || [];

  // Log access
  await req.contract.submitTransaction(
    'AccessContract:LogAccess', patientId, 'visits'
  ).catch(() => {});

  logger.info('Patient listed visits', { patientId, count: visits.length });
  return res.json({ success: true, data: visits });
}));

// ── GET /visits/:id ───────────────────────────────────────────────────────────
// Returns the full visit — on-chain record MERGED with IPFS clinical content.
// This gives the patient a complete view of their visit:
//   - status, assignments (on-chain)
//   - diagnosis, vitals, prescriptions, lab results, care notes (IPFS)
router.get('/:id', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;
  const visitId = req.params.id;

  // 1. Get on-chain visit record (contains visitCID)
  const visitResult = await req.contract.evaluateTransaction(
    'VisitContract:GetVisit', visitId
  );
  const visit = parseResult(visitResult);
  if (!visit) return res.status(404).json({ success: false, error: `Visit not found: ${visitId}` });

  // Verify this visit belongs to the logged-in patient
  if (visit.patientId !== patientId) {
    return res.status(403).json({ success: false, error: 'This visit does not belong to your account' });
  }

  // 2. Fetch clinical content from IPFS
  let clinicalData = null;
  if (visit.visitCID) {
    try {
      clinicalData = await fetchByCID(visit.visitCID);
    } catch (err) {
      logger.warn('Failed to fetch visit IPFS content', { visitId, cid: visit.visitCID, error: err.message });
      // Return what we have from chain even if IPFS fetch fails
    }
  }

  // 3. Log access
  await req.contract.submitTransaction(
    'AccessContract:LogAccess', patientId, 'visits'
  ).catch(() => {});

  logger.info('Patient viewed visit', { patientId, visitId, cid: visit.visitCID });
  return res.json({
    success: true,
    data: {
      // On-chain: status, assignments, claim info, CID history
      ...visit,
      // IPFS: full clinical content (merged in)
      clinical: clinicalData,
    },
  });
}));

// ── GET /visits/:id/history ───────────────────────────────────────────────────
// Returns the blockchain transaction history for this visit's on-chain record.
// Shows every status transition with txId and timestamp.
router.get('/:id/history', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;
  const visitId = req.params.id;

  // Verify ownership first
  const visitResult = await req.contract.evaluateTransaction(
    'VisitContract:GetVisit', visitId
  );
  const visit = parseResult(visitResult);
  if (!visit) return res.status(404).json({ success: false, error: `Visit not found: ${visitId}` });
  if (visit.patientId !== patientId) {
    return res.status(403).json({ success: false, error: 'Not your visit' });
  }

  const histResult = await req.contract.evaluateTransaction(
    'VisitContract:GetVisitHistory', visitId
  );
  const history = parseResult(histResult) || [];

  return res.json({ success: true, data: history });
}));

// ── GET /visits/:id/cids ──────────────────────────────────────────────────────
// Returns all IPFS CID versions this visit has ever had.
// Useful for patients who want to audit every change made to their visit data.
// Each entry: { cid, updatedBy, updatedAt, reason }
router.get('/:id/cids', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;
  const visitId = req.params.id;

  // Verify ownership
  const visitResult = await req.contract.evaluateTransaction(
    'VisitContract:GetVisit', visitId
  );
  const visit = parseResult(visitResult);
  if (!visit) return res.status(404).json({ success: false, error: `Visit not found: ${visitId}` });
  if (visit.patientId !== patientId) {
    return res.status(403).json({ success: false, error: 'Not your visit' });
  }

  const cidResult = await req.contract.evaluateTransaction(
    'VisitContract:GetCIDHistory', visitId
  );
  const cids = parseResult(cidResult) || [];

  return res.json({ success: true, data: cids });
}));

module.exports = router;
