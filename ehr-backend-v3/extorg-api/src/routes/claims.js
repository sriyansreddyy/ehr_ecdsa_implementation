'use strict';

const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const { getOrCreateActorKeys, logSignatureLocally, signDocument } = require('../utils/cryptoUtils');

const PROVIDER_ROLES = ['billingofficer', 'claimsauditor', 'insuranceofficer', 'provideradmin'];

// ── GET /claims/visits/:id ────────────────────────────────────
router.get('/visits/:id',
  authenticate, requireRole(...PROVIDER_ROLES), peerContext,
  wrap(async (req, res) => {
    const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', req.params.id));
    const clinical = onChain?.visitCID ? await fetchByCID(onChain.visitCID) : null;
    return res.json({ success: true, data: { ...onChain, clinical } });
  })
);

// ── GET /claims/visits/:id/history ───────────────────────────
router.get('/visits/:id/history',
  authenticate, requireRole(...PROVIDER_ROLES), peerContext,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction('VisitContract:GetVisitHistory', req.params.id);
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── POST /claims/visits/:id/submit — SubmitClaim ─────────────
router.post('/visits/:id/submit',
  authenticate, requireRole('billingofficer'), peerContext,
  [
    param('id').trim().notEmpty(),
    body('claimId').trim().notEmpty().withMessage('claimId required'),
    body('claimAmount').isFloat({ gt: 0 }).withMessage('claimAmount must be positive number'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { claimId, claimAmount } = req.body;
    logger.info('SubmitClaim', { visitId, claimId, claimAmount, userId: req.user.userId });

    const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    const clinical = await fetchByCID(onChain.visitCID);
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'CLAIM_SUBMITTED', from: req.user.userId, fromRole: 'billingofficer',
      to: '', toRole: '', notes: `Claim ${claimId} submitted for ₹${claimAmount}`,
      timestamp: new Date().toISOString(),
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
    const newCID = await pinJSON(clinical, `visit-${visitId}-claim.json`);

    const result = await req.contract.submitTransaction(
      'ClaimsContract:SubmitClaim', visitId, claimId, String(claimAmount), newCID
    );
    return res.status(201).json({ success: true, data: parseResult(result) });
    */
  })
);

// ── PUT /claims/visits/:id/audit — AuditClaim ────────────────
router.put('/visits/:id/audit',
  authenticate, requireRole('claimsauditor'), peerContext,
  [
    param('id').trim().notEmpty(),
    body('auditNotes').trim().notEmpty().withMessage('auditNotes required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    logger.info('AuditClaim', { visitId, userId: req.user.userId });

    const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    const clinical = await fetchByCID(onChain.visitCID);
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'CLAIM_AUDITED', from: req.user.userId, fromRole: 'claimsauditor',
      to: '', toRole: '', notes: req.body.auditNotes, timestamp: new Date().toISOString(),
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
    const newCID = await pinJSON(clinical, `visit-${visitId}-audit.json`);

    const result = await req.contract.submitTransaction(
      'ClaimsContract:AuditClaim', visitId, req.body.auditNotes, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
    */
  })
);

// ── PUT /claims/visits/:id/process — ProcessClaim ────────────
router.put('/visits/:id/process',
  authenticate, requireRole('insuranceofficer'), peerContext,
  [
    param('id').trim().notEmpty(),
    body('decision').trim().toUpperCase().isIn(['APPROVED', 'REJECTED'])
      .withMessage('decision must be APPROVED or REJECTED'),
    body('reason').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { decision, reason = '' } = req.body;
    logger.info('ProcessClaim', { visitId, decision, userId: req.user.userId });

    const onChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    const clinical = await fetchByCID(onChain.visitCID);
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: `CLAIM_${decision}`, from: req.user.userId, fromRole: 'insuranceofficer',
      to: '', toRole: '', notes: reason || `Claim ${decision.toLowerCase()}`,
      timestamp: new Date().toISOString(),
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
    const newCID = await pinJSON(clinical, `visit-${visitId}-claim-${decision.toLowerCase()}.json`);

    const result = await req.contract.submitTransaction(
      'ClaimsContract:ProcessClaim', visitId, decision, reason, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
    */
  })
);

module.exports = router;