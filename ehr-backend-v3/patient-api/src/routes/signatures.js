'use strict';

/**
 * signatures.js — Per-visit and per-EHR cryptographic transaction signatures
 *
 * GET /signatures              — ehr object + visits array, each with interactions + aggregateHash
 * GET /signatures/verify/ehr   — recompute EHR aggregate; compare against ?hash=
 * GET /signatures/verify/visit/:visitId — recompute visit aggregate; compare against ?hash=
 */

const router = require('express').Router();
const crypto = require('crypto');

const { authenticate }      = require('../middleware/auth');
const { fabricContext }     = require('../middleware/fabricContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const secured = [authenticate, fabricContext];

// ── helpers ───────────────────────────────────────────────────────────────────

function computeAggregate(ids) {
  const real = ids.filter(id => id);
  if (!real.length) return null;
  return crypto.createHash('sha256').update([...real].sort().join('')).digest('hex');
}

// EHR uses CIDs (content-hash pointers) as the per-entry signature,
// since GetEHRCIDHistory returns embedded log entries without blockchain txIds.
function computeEhrAggregate(entries) {
  const cids = entries.map(e => e.cid).filter(Boolean);
  return computeAggregate(cids);
}

function inferAction(value, prevValue) {
  if (!value)     return 'Deleted';
  if (!prevValue) return 'Created';
  const s = value.status;
  if (s === 'VISIT_OPENED')     return 'Visit opened';
  if (s === 'DOCTOR_ASSIGNED')  return 'Doctor assigned';
  if (s === 'NURSE_ASSIGNED')   return 'Nurse assigned';
  if (s === 'VISIT_FINALIZED')  return 'Visit finalized';
  if (s === 'RECORD_SUBMITTED') return 'Record submitted';
  if (s === 'CLAIM_SUBMITTED')  return 'Claim submitted';
  if (s === 'CLAIM_APPROVED')   return 'Claim approved';
  if (s === 'CLAIM_REJECTED')   return 'Claim rejected';
  if (s === 'RECORD_FINALIZED') return 'Record finalized';
  if (s === 'DISCHARGED')       return 'Patient discharged';
  if ((value.cidHistory?.length || 0) > (prevValue?.cidHistory?.length || 0)) {
    return value.cidHistory.at(-1)?.reason || 'EHR CID updated';
  }
  if ((value.forwardingLog?.length || 0) > (prevValue?.forwardingLog?.length || 0)) {
    return value.forwardingLog.at(-1)?.action || 'Record forwarded';
  }
  return 'Updated';
}

function inferActor(value) {
  if (value?.forwardingLog?.length) {
    const last = value.forwardingLog.at(-1);
    return { actor: last.from || last.to || 'unknown', role: last.fromRole || last.role || 'staff' };
  }
  if (value?.cidHistory?.length) {
    const last = value.cidHistory.at(-1);
    return { actor: last.updatedBy || 'unknown', role: last.role || 'staff' };
  }
  if (value?.assignedDoctor) return { actor: value.assignedDoctor, role: 'doctor' };
  if (value?.createdBy)      return { actor: value.createdBy,      role: 'receptionist' };
  return { actor: 'system', role: 'system' };
}

function dedupeAndSort(interactions) {
  const seen = new Set();
  return interactions
    .filter(i => { if (seen.has(i.txId)) return false; seen.add(i.txId); return true; })
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// ── GET /signatures ───────────────────────────────────────────────────────────
router.get('/', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  // 1. All visits
  const visitsRaw = await req.contract.evaluateTransaction(
    'VisitContract:GetPatientVisitsFull', patientId
  );
  const visitsList = parseResult(visitsRaw) || [];

  // 2. Per-visit interaction lists
  const visits = [];
  for (const v of visitsList) {
    let history = [];
    try {
      const raw = await req.contract.evaluateTransaction(
        'VisitContract:GetVisitHistory', v.visitId
      );
      history = parseResult(raw) || [];
    } catch { /* skip */ }

    const interactions = dedupeAndSort(
      history
        .filter(e => e.txId)
        .map((entry, idx) => ({
          txId:      entry.txId,
          timestamp: entry.timestamp,
          action:    inferAction(entry.value, history[idx - 1]?.value),
          ...inferActor(entry.value),
        }))
    );

    visits.push({
      visitId:       v.visitId,
      status:        v.status,
      interactions,
      aggregateHash: computeAggregate(interactions.map(i => i.txId)),
      txCount:       interactions.length,
    });
  }

  // 3. EHR interaction list
  let ehrInteractions = [];
  let ehrRawEntries   = [];
  try {
    const raw = await req.contract.evaluateTransaction(
      'EhrContract:GetEHRCIDHistory', patientId
    );
    ehrRawEntries  = parseResult(raw) || [];
    ehrInteractions = ehrRawEntries
      .filter(e => e.cid || e.updatedAt)
      .map(entry => ({
        txId:      entry.txId || null,
        cid:       entry.cid  || null,
        timestamp: entry.updatedAt || entry.timestamp,
        action:    entry.reason || 'EHR updated',
        actor:     entry.updatedBy || 'unknown',
        role:      entry.role || 'staff',
        section:   entry.section || null,
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } catch { /* optional */ }

  const ehr = {
    interactions:  ehrInteractions,
    aggregateHash: computeEhrAggregate(ehrRawEntries),
    txCount:       ehrInteractions.length,
  };

  logger.info('Patient fetched signatures', {
    patientId,
    ehrTxCount:   ehr.txCount,
    visitCount:   visits.length,
  });

  return res.json({
    success: true,
    data: { ehr, visits, computedAt: new Date().toISOString() },
  });
}));

// ── GET /signatures/verify/ehr ────────────────────────────────────────────────
router.get('/verify/ehr', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;
  const { hash }      = req.query;

  let entries = [];
  try {
    const raw = await req.contract.evaluateTransaction(
      'EhrContract:GetEHRCIDHistory', patientId
    );
    entries = parseResult(raw) || [];
  } catch { /* */ }

  const aggregateHash = computeEhrAggregate(entries);
  const valid         = hash ? hash === aggregateHash : aggregateHash !== null;

  logger.info('Patient verified EHR signatures', { patientId, valid });
  return res.json({
    success: true,
    data: { valid, aggregateHash, txCount: entries.length, computedAt: new Date().toISOString() },
  });
}));

// ── GET /signatures/verify/visit/:visitId ─────────────────────────────────────
router.get('/verify/visit/:visitId', ...secured, wrap(async (req, res) => {
  const { patientId }  = req.patient;
  const { visitId }    = req.params;
  const { hash }       = req.query;

  // Ownership check
  const visitRaw = await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId);
  const visit    = parseResult(visitRaw);
  if (!visit) return res.status(404).json({ success: false, error: `Visit not found: ${visitId}` });
  if (visit.patientId !== patientId) return res.status(403).json({ success: false, error: 'Not your visit' });

  let txIds = [];
  try {
    const raw     = await req.contract.evaluateTransaction('VisitContract:GetVisitHistory', visitId);
    const history = parseResult(raw) || [];
    txIds         = history.filter(e => e.txId).map(e => e.txId);
  } catch { /* */ }

  const aggregateHash = computeAggregate(txIds);
  const valid         = hash ? hash === aggregateHash : aggregateHash !== null;

  logger.info('Patient verified visit signatures', { patientId, visitId, valid });
  return res.json({
    success: true,
    data: { valid, aggregateHash, txCount: txIds.length, computedAt: new Date().toISOString() },
  });
}));

module.exports = router;
