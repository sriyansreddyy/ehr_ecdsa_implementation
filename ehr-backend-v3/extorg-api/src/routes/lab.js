'use strict';

const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const { getOrCreateActorKeys, logSignatureLocally, signDocument } = require('../utils/cryptoUtils');

const LAB_ROLES = ['labreceptionist', 'labtechnician', 'radiologist', 'labsupervisor', 'labadmin'];

async function getVisitJson(contract, visitId) {
  const onChain = parseResult(await contract.evaluateTransaction('VisitContract:GetVisit', visitId));
  if (!onChain) throw new Error(`Visit not found: ${visitId}`);
  const clinical = onChain.visitCID ? await fetchByCID(onChain.visitCID) : {};
  return { onChain, clinical };
}

// ── GET /lab/visits/:id ───────────────────────────────────────
router.get('/visits/:id',
  authenticate, requireRole(...LAB_ROLES), peerContext,
  wrap(async (req, res) => {
    const { onChain, clinical } = await getVisitJson(req.contract, req.params.id);
    return res.json({ success: true, data: { ...onChain, clinical } });
  })
);

// ── GET /lab/visits/:id/request/:reqId ───────────────────────
router.get('/visits/:id/request/:reqId',
  authenticate, requireRole(...LAB_ROLES), peerContext,
  wrap(async (req, res) => {
    const { clinical } = await getVisitJson(req.contract, req.params.id);
    const labReq = (clinical.labRequests || []).find(r => r.labRequestId === req.params.reqId);
    if (!labReq) return res.status(404).json({ success: false, error: `Lab request not found: ${req.params.reqId}` });
    return res.json({ success: true, data: labReq });
  })
);

// ── PUT /lab/visits/:id/request/:reqId/acknowledge ───────────
router.put('/visits/:id/request/:reqId/acknowledge',
  authenticate, requireRole('labreceptionist', 'labadmin'), peerContext,
  [param('id').trim().notEmpty(), param('reqId').trim().notEmpty()],
  wrap(async (req, res) => {
    const { id: visitId, reqId: labRequestId } = req.params;
    logger.info('AcknowledgeLabRequest', { visitId, labRequestId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitJson(req.contract, visitId);
    const idx = (clinical.labRequests || []).findIndex(r => r.labRequestId === labRequestId);
    if (idx === -1) return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });

    clinical.labRequests[idx].status         = 'ACKNOWLEDGED';
    clinical.labRequests[idx].acknowledgedBy = req.user.userId;
    clinical.labRequests[idx].acknowledgedAt = new Date().toISOString();
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'LAB_REQUEST_ACKNOWLEDGED', from: req.user.userId, fromRole: 'labreceptionist',
      to: '', toRole: '', notes: `Acknowledged: ${clinical.labRequests[idx].tests.join(', ')}`,
      labRequestId, timestamp: new Date().toISOString(),
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
    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-ack.json`);

    const result = await req.contract.submitTransaction(
      'LabContract:AcknowledgeLabRequest', visitId, labRequestId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
    */
  })
);

// ── PUT /lab/visits/:id/request/:reqId/submit ─────────────────
router.put('/visits/:id/request/:reqId/submit',
  authenticate, requireRole('labtechnician', 'radiologist', 'labadmin'), peerContext,
  [
    param('id').trim().notEmpty(),
    param('reqId').trim().notEmpty(),
    body('results').isObject().withMessage('results must be a JSON object'),
    body('resultsHash').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { id: visitId, reqId: labRequestId } = req.params;
    const { results, resultsHash = '' } = req.body;
    logger.info('SubmitLabResult', { visitId, labRequestId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitJson(req.contract, visitId);
    const idx = (clinical.labRequests || []).findIndex(r => r.labRequestId === labRequestId);
    if (idx === -1) return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });

    clinical.labRequests[idx].status      = 'COMPLETED';
    clinical.labRequests[idx].results     = results;
    clinical.labRequests[idx].resultsHash = resultsHash;
    clinical.labRequests[idx].submittedBy = req.user.userId;
    clinical.labRequests[idx].submittedAt = new Date().toISOString();
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'LAB_RESULT_SUBMITTED', from: req.user.userId, fromRole: 'labtechnician',
      to: '', toRole: '', notes: `Results submitted for ${clinical.labRequests[idx].tests.join(', ')}`,
      labRequestId, timestamp: new Date().toISOString(),
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
    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-results.json`);

    const result = await req.contract.submitTransaction(
      'LabContract:SubmitLabResult', visitId, labRequestId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
    */
  })
);

// ── PUT /lab/visits/:id/request/:reqId/approve ───────────────
router.put('/visits/:id/request/:reqId/approve',
  authenticate, requireRole('labsupervisor', 'labadmin'), peerContext,
  [param('id').trim().notEmpty(), param('reqId').trim().notEmpty()],
  wrap(async (req, res) => {
    const { id: visitId, reqId: labRequestId } = req.params;
    logger.info('ApproveLabResult', { visitId, labRequestId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitJson(req.contract, visitId);
    const idx = (clinical.labRequests || []).findIndex(r => r.labRequestId === labRequestId);
    if (idx === -1) return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });

    clinical.labRequests[idx].status     = 'APPROVED';
    clinical.labRequests[idx].approvedBy = req.user.userId;
    clinical.labRequests[idx].approvedAt = new Date().toISOString();
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'LAB_RESULT_APPROVED', from: req.user.userId, fromRole: 'labsupervisor',
      to: onChain.assignedDoctor, toRole: 'doctor',
      notes: `Approved results for ${clinical.labRequests[idx].tests.join(', ')}`,
      labRequestId, timestamp: new Date().toISOString(),
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
    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-approved.json`);

    const result = await req.contract.submitTransaction(
      'LabContract:ApproveLabResult', visitId, labRequestId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
    */
  })
);

// ── PUT /lab/visits/:id/request/:reqId/return ────────────────
router.put('/visits/:id/request/:reqId/return',
  authenticate, requireRole('labsupervisor', 'labadmin'), peerContext,
  [param('id').trim().notEmpty(), param('reqId').trim().notEmpty()],
  wrap(async (req, res) => {
    const { id: visitId, reqId: labRequestId } = req.params;
    logger.info('LabResultsBackToDoctor', { visitId, labRequestId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitJson(req.contract, visitId);
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'LAB_RESULTS_RETURNED', from: 'lab', fromRole: 'lab',
      to: onChain.assignedDoctor, toRole: 'doctor',
      notes: `Lab results ready for request ${labRequestId}`,
      labRequestId, timestamp: new Date().toISOString(),
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
    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-return.json`);

    const result = await req.contract.submitTransaction(
      'ForwardContract:LabResultsBackToDoctor', visitId, labRequestId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
    */
  })
);

module.exports = router;