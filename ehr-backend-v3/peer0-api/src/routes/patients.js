'use strict';

const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, requireRole, requireAnyKnownRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { initEHR }  = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const { signDocument, logSignatureLocally, verifyDocument } = require('../utils/cryptoUtils');
const { verifyPin } = require('./auth');
const { getPublicKey } = require('../../../shared/keyVault');

const canManage = [authenticate, requireRole('receptionist', 'admin'), peerContext];
const canRead   = [authenticate, requireAnyKnownRole, peerContext];

// ── GET /patients — ListAllPatients ──────────────────────────
router.get('/', ...canManage, wrap(async (req, res) => {
  const result = await req.contract.evaluateTransaction('PatientContract:ListAllPatients');
  return res.json({ success: true, data: parseResult(result) });
}));

// ── POST /patients — RegisterPatient + InitEHR ────────────────
router.post('/',
  authenticate, requireRole('receptionist', 'admin'), peerContext, verifyPin,
  [
    body('patientId').trim().notEmpty(),
    body('name').trim().notEmpty(),
    body('age').isInt({ min: 0, max: 150 }),
    body('gender').trim().notEmpty(),
    body('bloodGroup').trim().notEmpty(),
    body('contact').trim().notEmpty(),
    body('address').trim().notEmpty(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId, name, age, gender, bloodGroup, contact, address } = req.body;
    logger.info('RegisterPatient', { patientId, userId: req.user.userId });

    const demographics = { name, age, gender, bloodGroup, contact, address };

    // Private key is PKCS8 PEM from the vault — Node.js crypto accepts it directly.
    const rawKey = req.actorPrivateKey;

    const publicKey  = await getPublicKey(req.user.userId);
    const digitalSignature = signDocument(rawKey, demographics);
    logSignatureLocally(req.user.userId, patientId, digitalSignature);

    const isAuthentic = verifyDocument(publicKey, digitalSignature, demographics);

    if (!isAuthentic) {
        logger.error('SECURITY ALERT: Patient data failed ECDSA verification.');
        return res.status(403).json({ success: false, error: 'Data integrity check failed.' });
    }

    logger.info('ECDSA Verification Successful, signature generated.');

    demographics.securityProof = {
        signature:       digitalSignature,
        signerPublicKey: publicKey,
        signedByUserId:  req.user.userId
    };

    // --- SUBMISSION FLOW ---
    // 1. Initialize empty EHR in IPFS
    const { cid: ehrCID } = await initEHR(patientId, demographics);
    logger.info('EHR initialised in IPFS', { patientId, ehrCID });

    // 2. Register patient on blockchain
    const result = await req.contract.submitTransaction(
      'PatientContract:RegisterPatient',
      patientId, name, String(age), gender, bloodGroup, contact, address, ehrCID
    );
    const patient = parseResult(result);

    // 3. Store CID in EhrContract
    await req.contract.submitTransaction(
      'EhrContract:InitEHR', patientId, ehrCID
    );

    logger.info('RegisterPatient complete', { patientId, ehrCID });
    return res.status(201).json({ success: true, data: { ...patient, ehrCID } });
  })
);

// ── GET /patients/:id — GetPatient ───────────────────────────
router.get('/:id',
  ...canRead,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction(
      'PatientContract:GetPatient', req.params.id
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── GET /patients/:id/exists — PatientExists ─────────────────
router.get('/:id/exists',
  ...canRead,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction(
      'PatientContract:PatientExists', req.params.id
    );
    return res.json({ success: true, data: { patientId: req.params.id, exists: parseResult(result) } });
  })
);

// ── GET /patients/:id/visits — GetPatientVisits ──────────────
router.get('/:id/visits',
  ...canRead,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction(
      'PatientContract:GetPatientVisits', req.params.id
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── GET /patients/:id/visits/full — GetPatientVisitsFull ─────
router.get('/:id/visits/full',
  ...canRead,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction(
      'VisitContract:GetPatientVisitsFull', req.params.id
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── GET /patients/:id/history — GetPatientHistory ────────────
router.get('/:id/history',
  ...canRead,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction(
      'PatientContract:GetPatientHistory', req.params.id
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── PUT /patients/:id — UpdatePatientInfo ────────────────────
router.put('/:id',
  ...canManage,
  [
    param('id').trim().notEmpty(),
    body('contact').optional().isString(),
    body('address').optional().isString(),
  ],
  wrap(async (req, res) => {
    const { contact = '', address = '' } = req.body;
    logger.info('UpdatePatientInfo', { patientId: req.params.id, userId: req.user.userId });
    const result = await req.contract.submitTransaction(
      'PatientContract:UpdatePatientInfo', req.params.id, contact, address
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── GET /patients/:id/ehr/cid — GetCurrentEHR CID ────────────
// Staff can get the current IPFS CID for a patient's EHR
router.get('/:id/ehr/cid',
  ...canRead,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction(
      'EhrContract:GetCurrentCID', req.params.id
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── GET /patients/:id/ehr/history — EHR CID history ──────────
router.get('/:id/ehr/history',
  ...canRead,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction(
      'EhrContract:GetEHRCIDHistory', req.params.id
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

module.exports = router;