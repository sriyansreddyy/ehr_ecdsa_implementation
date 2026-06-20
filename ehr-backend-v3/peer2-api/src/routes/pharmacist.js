'use strict';

const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const { getOrCreateActorKeys, logSignatureLocally, signDocument } = require('../utils/cryptoUtils');

const asPharmacist = [authenticate, requireRole('pharmacist'), peerContext];

// ── GET /pharmacist/visits — finalized visits ready to dispense
const DISPENSE_STATUSES = ['VISIT_FINALIZED', 'RECORD_FINALIZED', 'CLAIM_SUBMITTED',
  'CLAIM_UNDER_AUDIT', 'CLAIM_APPROVED', 'CLAIM_REJECTED'];
router.get('/visits', ...asPharmacist, wrap(async (req, res) => {
  const result = await req.contract.evaluateTransaction('VisitContract:ListAllVisits');
  const all = parseResult(result) || [];
  return res.json({ success: true, data: all.filter(v => DISPENSE_STATUSES.includes(v.status)) });
}));

// ── GET /pharmacist/visits/:id ────────────────────────────────
router.get('/visits/:id', ...asPharmacist, wrap(async (req, res) => {
  const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', req.params.id));
  const clinical = onChain?.visitCID ? await fetchByCID(onChain.visitCID) : null;
  return res.json({ success: true, data: { ...onChain, clinical } });
}));

// ── GET /pharmacist/visits/:id/prescription ───────────────────
router.get('/visits/:id/prescription', ...asPharmacist, wrap(async (req, res) => {
  const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', req.params.id));
  const clinical = onChain?.visitCID ? await fetchByCID(onChain.visitCID) : null;
  const p = clinical?.prescriptions || [];
  return res.json({ success: true, data: p.length ? p[p.length - 1] : null });
}));

// ── PUT /pharmacist/visits/:id/dispense — DispenseMedication ─
router.put('/visits/:id/dispense',
  ...asPharmacist,
  [
    param('id').trim().notEmpty(),
    body('medicationDetails').trim().notEmpty().withMessage('medicationDetails required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    logger.info('DispenseMedication', { visitId, userId: req.user.userId });

    const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    const clinical = await fetchByCID(onChain.visitCID);
    clinical.medicationDetails     = req.body.medicationDetails;
    clinical.medicationDispensedBy = req.user.userId;
    clinical.medicationDispensedAt = new Date().toISOString();
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'MEDICATION_DISPENSED', from: req.user.userId, fromRole: 'pharmacist',
      to: '', toRole: '', notes: req.body.medicationDetails, timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();

    // ==========================================
    // THE CRYPTOGRAPHIC BLOCK
    // ==========================================
    const actorKeys = getOrCreateActorKeys(req.user.userId);
    const digitalSignature = signDocument(actorKeys.privateKey, clinical); 
    logSignatureLocally(req.user.userId, visitId, digitalSignature);
    
    clinical.securityProof = {
        signature: digitalSignature,
        signerPublicKey: actorKeys.publicKey,
        signedByUserId: req.user.userId,
        timestamp: new Date().toISOString()
    };
    // ==========================================

    // ==========================================
    // LOCAL BYPASS: STOP BEFORE IPFS
    // ==========================================
    return res.status(200).json({ 
        success: true, 
        message: "Local E2E Test: Crypto Engine Working", 
        proof: clinical.securityProof 
    });

    /* COMMENTED OUT FOR LOCAL TESTING
    const newCID = await pinJSON(clinical, `visit-${visitId}-dispense.json`);

    const result = await req.contract.submitTransaction(
      'ClinicalContract:DispenseMedication', visitId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
    */
  })
);

module.exports = router;