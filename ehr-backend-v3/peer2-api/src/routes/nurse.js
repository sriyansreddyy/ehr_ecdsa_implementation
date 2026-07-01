'use strict';

const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const { signDocument, logSignatureLocally } = require('../utils/cryptoUtils');
const { verifyPin } = require('./auth');
const { getPublicKey } = require('../../../shared/keyVault');

const asNurse       = [authenticate, requireRole('nurse'), peerContext];
const asNurseSigned = [authenticate, requireRole('nurse'), peerContext, verifyPin];

async function getVisitJson(contract, visitId) {
  const onChain = parseResult(await contract.evaluateTransaction('VisitContract:GetVisit', visitId));
  if (!onChain) throw new Error(`Visit not found: ${visitId}`);
  const clinical = onChain.visitCID ? await fetchByCID(onChain.visitCID) : {};
  return { onChain, clinical };
}

// ── GET /nurse/visits — visits assigned to this nurse ─────────
router.get('/visits', ...asNurse, wrap(async (req, res) => {
  const result = await req.contract.evaluateTransaction('VisitContract:ListAllVisits');
  const all = parseResult(result) || [];
  return res.json({ success: true, data: all.filter(v => v.assignedNurse === req.user.userId) });
}));

// ── GET /nurse/visits/:id ─────────────────────────────────────
router.get('/visits/:id', ...asNurse, wrap(async (req, res) => {
  const { onChain, clinical } = await getVisitJson(req.contract, req.params.id);
  return res.json({ success: true, data: { ...onChain, clinical } });
}));

// ── GET /nurse/visits/:id/prescription ───────────────────────
router.get('/visits/:id/prescription', ...asNurse, wrap(async (req, res) => {
  const { clinical } = await getVisitJson(req.contract, req.params.id);
  const p = clinical?.prescriptions || [];
  return res.json({ success: true, data: p.length ? p[p.length - 1] : null });
}));

// ── PUT /nurse/visits/:id/vitals — RecordVitals ───────────────
router.put('/visits/:id/vitals',
  ...asNurseSigned,
  [
    param('id').trim().notEmpty(),
    body('vitals').isObject().withMessage('vitals must be a JSON object'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    logger.info('RecordVitals', { visitId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitJson(req.contract, visitId);
    clinical.vitals = {
      ...req.body.vitals,
      recordedBy: req.user.userId,
      recordedAt: new Date().toISOString(),
    };
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'VITALS_RECORDED', from: req.user.userId, fromRole: 'nurse',
      to: '', toRole: '', notes: `BP:${req.body.vitals.bloodPressure||'—'} Temp:${req.body.vitals.temperature||'—'}`,
      timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();

    // ==========================================
    // THE CRYPTOGRAPHIC BLOCK
    // ==========================================
    const privateKey = req.actorPrivateKey;
    const publicKey  = await getPublicKey(req.user.userId);
    const digitalSignature = signDocument(privateKey, clinical);
    logSignatureLocally(req.user.userId, visitId, digitalSignature);

    clinical.securityProof = {
        signature:       digitalSignature,
        signerPublicKey: publicKey,
        signedByUserId:  req.user.userId,
        timestamp:       new Date().toISOString()
    };
    // ==========================================

    const newCID = await pinJSON(clinical, `visit-${visitId}-vitals.json`);

    const result = await req.contract.submitTransaction(
      'ClinicalContract:RecordVitals', visitId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── POST /nurse/visits/:id/carenote — AddCareNote ────────────
router.post('/visits/:id/carenote',
  ...asNurseSigned,
  [
    param('id').trim().notEmpty(),
    body('note').trim().notEmpty().withMessage('note required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    logger.info('AddCareNote', { visitId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitJson(req.contract, visitId);
    clinical.careNotes = clinical.careNotes || [];
    clinical.careNotes.push({
      note: req.body.note, recordedBy: req.user.userId,
      recordedAt: new Date().toISOString(),
    });
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'CARE_NOTE_ADDED', from: req.user.userId, fromRole: 'nurse',
      to: '', toRole: '', notes: req.body.note, timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    
    // ==========================================
    // THE CRYPTOGRAPHIC BLOCK
    // ==========================================
    const privateKey = req.actorPrivateKey;
    const publicKey  = await getPublicKey(req.user.userId);
    const digitalSignature = signDocument(privateKey, clinical);
    logSignatureLocally(req.user.userId, visitId, digitalSignature);

    clinical.securityProof = {
        signature:       digitalSignature,
        signerPublicKey: publicKey,
        signedByUserId:  req.user.userId,
        timestamp:       new Date().toISOString()
    };
    // ==========================================

    const newCID = await pinJSON(clinical, `visit-${visitId}-carenote.json`);

    const result = await req.contract.submitTransaction(
      'ClinicalContract:AddCareNote', visitId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── PUT /nurse/visits/:id/forward/doctor ─────────────────────
router.put('/visits/:id/forward/doctor',
  ...asNurseSigned,
  [
    param('id').trim().notEmpty(),
    body('notes').optional().isString(),
  ],
  wrap(async (req, res) => {
    const visitId = req.params.id;
    const { notes = '' } = req.body;
    logger.info('ForwardToDoctor', { visitId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitJson(req.contract, visitId);
    clinical.forwardingLog = clinical.forwardingLog || [];
    clinical.forwardingLog.push({
      action: 'FORWARD_TO_DOCTOR', from: req.user.userId, fromRole: 'nurse',
      to: onChain.assignedDoctor, toRole: 'doctor', notes,
      timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    
    // ==========================================
    // THE CRYPTOGRAPHIC BLOCK
    // ==========================================
    const privateKey = req.actorPrivateKey;
    const publicKey  = await getPublicKey(req.user.userId);
    const digitalSignature = signDocument(privateKey, clinical);
    logSignatureLocally(req.user.userId, visitId, digitalSignature);

    clinical.securityProof = {
        signature:       digitalSignature,
        signerPublicKey: publicKey,
        signedByUserId:  req.user.userId,
        timestamp:       new Date().toISOString()
    };
    // ==========================================

    const newCID = await pinJSON(clinical, `visit-${visitId}-fwd-doctor.json`);

    const result = await req.contract.submitTransaction(
      'ForwardContract:ForwardToDoctor', visitId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── PUT /nurse/visits/:id/ehr — Nurse updates EHR section ────
// Nurse can update: allergies, chronicConditions, immunizations, lifestyle
router.put('/visits/:id/ehr',
  ...asNurseSigned,
  [
    param('id').trim().notEmpty(),
    body('section').trim().notEmpty(),
    body('data').exists(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { section, data } = req.body;
    const ALLOWED = ['allergies', 'chronicConditions', 'immunizations', 'lifestyle', 'emergencyContact', 'medicalHistory'];
    if (!ALLOWED.includes(section)) {
      return res.status(400).json({ success: false, error: `Nurse can update: ${ALLOWED.join(', ')}` });
    }

    const visitOnChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    const patientId = visitOnChain.patientId;

    const cidResult = parseResult(await req.contract.evaluateTransaction('EhrContract:GetCurrentCID', patientId));
    const ehr = await fetchByCID(cidResult.currentCID);
    ehr[section] = data;
    ehr.updatedAt = new Date().toISOString();
    ehr.updatedBy = `nurse:${req.user.userId}`;

    // ==========================================
    // THE CRYPTOGRAPHIC BLOCK
    // ==========================================
    const privateKey = req.actorPrivateKey;
    const publicKey  = await getPublicKey(req.user.userId);
    const digitalSignature = signDocument(privateKey, ehr);
    logSignatureLocally(req.user.userId, visitId, digitalSignature);

    ehr.securityProof = {
        signature:       digitalSignature,
        signerPublicKey: publicKey,
        signedByUserId:  req.user.userId,
        timestamp:       new Date().toISOString()
    };
    // ==========================================

    const newCID = await pinJSON(ehr, `ehr-${patientId}-${section}.json`);
    await req.contract.submitTransaction(
      'EhrContract:UpdateEHRCID', patientId, newCID, section, `Updated by nurse ${req.user.userId}`
    );

    logger.info('Nurse updated EHR', { visitId, patientId, section, newCID });
    return res.json({ success: true, data: { patientId, section, cid: newCID } });
  })
);

// ── POST /nurse/visits/:id/request-access ─────────────────────
// Nurse requests EHR access for the patient of a given visit.
// Body: { sections: ["ehr","visits"], reason: "..." }
router.post('/visits/:id/request-access',
  ...asNurse,
  [
    param('id').trim().notEmpty(),
    body('sections').isArray({ min: 1 }).withMessage('sections must be a non-empty array'),
    body('reason').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { sections, reason = '' } = req.body;

    const onChain = parseResult(
      await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId)
    );
    if (!onChain) return res.status(404).json({ success: false, error: 'Visit not found' });

    // No IPFS upload happens in this route, so no cryptographic block is needed.
    // The request goes directly to the Fabric AccessContract.

    const result = await req.contract.submitTransaction(
      'AccessContract:RequestAccess',
      onChain.patientId,
      JSON.stringify(sections),
      reason
    );

    const request = parseResult(result);
    logger.info('Nurse requested EHR access', { visitId, patientId: onChain.patientId, sections });
    return res.status(201).json({ success: true, data: request });
  })
);

module.exports = router;