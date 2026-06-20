'use strict';

const router = require('express').Router();
const { param } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const asMRO = [authenticate, requireRole('medrecordofficer'), peerContext];

// ── GET /records/visits — visits ready to finalize ────────────
router.get('/visits', ...asMRO, wrap(async (req, res) => {
  const result = await req.contract.evaluateTransaction('VisitContract:ListAllVisits');
  const all = parseResult(result) || [];
  return res.json({ success: true, data: all.filter(v => v.status === 'VISIT_FINALIZED') });
}));

// ── GET /records/visits/:id ───────────────────────────────────
router.get('/visits/:id', ...asMRO, wrap(async (req, res) => {
  const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', req.params.id));
  const clinical = onChain?.visitCID ? await fetchByCID(onChain.visitCID) : null;
  return res.json({ success: true, data: { ...onChain, clinical } });
}));

// ── GET /records/visits/:id/history ──────────────────────────
router.get('/visits/:id/history', ...asMRO, wrap(async (req, res) => {
  const result = await req.contract.evaluateTransaction('VisitContract:GetVisitHistory', req.params.id);
  return res.json({ success: true, data: parseResult(result) });
}));

// ── PUT /records/visits/:id/finalize — FinalizeRecord ────────
router.put('/visits/:id/finalize',
  ...asMRO,
  [param('id').trim().notEmpty()],
  wrap(async (req, res) => {
    const visitId = req.params.id;
    logger.info('FinalizeRecord', { visitId, userId: req.user.userId });

    const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    const clinical = await fetchByCID(onChain.visitCID);
    clinical.recordFinalizedBy = req.user.userId;
    clinical.recordFinalizedAt = new Date().toISOString();
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'RECORD_FINALIZED', from: req.user.userId, fromRole: 'medrecordofficer',
      to: '', toRole: '', notes: 'Official record finalised. Ready for insurance claim.',
      timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    const newCID = await pinJSON(clinical, `visit-${visitId}-record-final.json`);

    const result = await req.contract.submitTransaction(
      'VisitContract:FinalizeRecord', visitId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

module.exports = router;
