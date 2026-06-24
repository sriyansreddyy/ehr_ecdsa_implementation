'use strict';

/**
 * ehr.js — Patient EHR template routes
 *
 * GET  /ehr          — fetch patient's current EHR JSON from IPFS
 * GET  /ehr/history  — list all CID versions of the EHR (on-chain metadata)
 * PUT  /ehr/contact  — patient updates their own contact info (emergency contact)
 *
 * How it works:
 * 1. GET current CID from blockchain (EhrContract:GetCurrentCID)
 * 2. Fetch JSON from IPFS via ipfs-service (/fetch/:cid)
 * 3. Return JSON to patient
 * 4. Call AccessContract:LogAccess for audit trail
 */

const router = require('express').Router();
const { body, validationResult } = require('express-validator');

const { authenticate }    = require('../middleware/auth');
const { fabricContext }   = require('../middleware/fabricContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const logger = require('../config/logger');

const { signDocument, logSignatureLocally } = require('../utils/cryptoUtils');
const { verifyPin } = require('./auth');
const { getPublicKey } = require('../../../shared/keyVault');

const secured = [authenticate, fabricContext];

// ── GET /ehr ──────────────────────────────────────────────────────────────────
// Returns the patient's full EHR JSON fetched from IPFS.
// On-chain: reads EHR:PAT-001 → currentCID
// Off-chain: fetches JSON from ipfs-service
router.get('/', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  // 1. Get current CID from blockchain
  const cidResult = await req.contract.evaluateTransaction(
    'EhrContract:GetCurrentCID', patientId
  );
  const { currentCID } = parseResult(cidResult);

  if (!currentCID) {
    return res.status(404).json({ success: false, error: 'EHR not initialised for this patient' });
  }

  // 2. Fetch actual EHR JSON from IPFS
  const ehr = await fetchByCID(currentCID);

  // 3. Log access on-chain (audit trail)
  await req.contract.submitTransaction(
    'AccessContract:LogAccess', patientId, 'ehr'
  ).catch(() => {}); // non-fatal — don't fail the request if log fails

  logger.info('Patient viewed EHR', { patientId, cid: currentCID });
  return res.json({ success: true, data: { cid: currentCID, ehr } });
}));

// ── GET /ehr/history ──────────────────────────────────────────────────────────
// Returns the full CID history — every version of the EHR ever saved.
// Each entry: { cid, updatedBy, updatedAt, section, reason }
router.get('/history', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  const result = await req.contract.evaluateTransaction(
    'EhrContract:GetEHRCIDHistory', patientId
  );
  const history = parseResult(result);

  logger.info('Patient viewed EHR history', { patientId });
  return res.json({ success: true, data: history });
}));

// ── PUT /ehr/contact ──────────────────────────────────────────────────────────
// Patient updates their own emergency contact info in the EHR.
// This is the ONE section patients can write — all clinical sections
// (allergies, conditions, medications) are updated by doctors/nurses only.
//
// Flow:
//   1. Get current CID → fetch EHR JSON from IPFS
//   2. Update ehr.emergencyContact and ehr.demographics.contact/phone
//   3. Pin updated JSON → newCID
//   4. Call EhrContract:UpdateEHRCID on chain
router.put('/contact',
  ...secured, verifyPin,
  [
    body('emergencyContact').optional().isObject(),
    body('emergencyContact.name').optional().isString(),
    body('emergencyContact.relation').optional().isString(),
    body('emergencyContact.phone').optional().isString(),
    body('contact').optional().isString(),
    body('address').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId } = req.patient;
    const { emergencyContact, contact, address } = req.body;

    // 1. Get current EHR CID and fetch JSON
    const cidResult = await req.contract.evaluateTransaction(
      'EhrContract:GetCurrentCID', patientId
    );
    const { currentCID } = parseResult(cidResult);
    if (!currentCID) {
      return res.status(404).json({ success: false, error: 'EHR not initialised' });
    }

    const ehr = await fetchByCID(currentCID);

    // 2. Apply patient-allowed updates only
    if (emergencyContact) {
      ehr.emergencyContact = {
        ...ehr.emergencyContact,
        ...emergencyContact,
      };
    }
    if (contact)  ehr.demographics.contact = contact;
    if (address)  ehr.demographics.address = address;
    ehr.updatedAt = new Date().toISOString();
    ehr.updatedBy = `patient:${patientId}`;

    // ==========================================
    // THE CRYPTOGRAPHIC BLOCK
    // ==========================================
    const privateKey = req.actorPrivateKey;
    const publicKey  = await getPublicKey(patientId);
    const digitalSignature = signDocument(privateKey, ehr);
    logSignatureLocally(patientId, 'ehr-contact', digitalSignature);

    ehr.securityProof = {
        signature:       digitalSignature,
        signerPublicKey: publicKey,
        signedByUserId:  patientId,
        timestamp:       new Date().toISOString()
    };
    // ==========================================

    // ==========================================
    // LOCAL BYPASS: STOP BEFORE IPFS
    // ==========================================
    return res.status(200).json({ 
        success: true, 
        message: "Local E2E Test: Patient Crypto Working", 
        proof: ehr.securityProof 
    });

    /* COMMENTED OUT FOR LOCAL TESTING
    // 3. Pin updated EHR to IPFS
    const newCID = await pinJSON(ehr, `ehr-${patientId}-contact.json`);

    // 4. Store new CID on blockchain
    await req.contract.submitTransaction(
      'EhrContract:UpdateEHRCID',
      patientId, newCID, 'emergencyContact', 'Updated by patient'
    );

    logger.info('Patient updated contact info', { patientId, newCID });
    return res.json({ success: true, data: { cid: newCID, ehr } });
    */
  })
);

// ── POST /ehr/medical-history ──────────────────────────────────────────────────
// Patient appends a new entry to their medical history (from OCR or manual).
router.post('/medical-history',
  ...secured, verifyPin,
  [
    body('text').trim().notEmpty(),
    body('sourceType').optional().isString(), // 'ocr' | 'manual'
    body('sourceCid').optional().isString(),  // IPFS CID of source doc
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId } = req.patient;
    const { text, sourceType = 'manual', sourceCid = '', attributes = null } = req.body;

    // 1. Get current EHR CID and fetch JSON
    const cidResult = await req.contract.evaluateTransaction(
      'EhrContract:GetCurrentCID', patientId
    );
    const { currentCID } = parseResult(cidResult);
    if (!currentCID) {
      return res.status(404).json({ success: false, error: 'EHR not initialised' });
    }

    const ehr = await fetchByCID(currentCID);

    // 2. Append new history entry
    if (!ehr.medicalHistory) ehr.medicalHistory = [];
    ehr.medicalHistory.push({
      text,
      sourceType,
      sourceCid,
      attributes,
      addedBy: `patient:${patientId}`,
      addedAt: new Date().toISOString(),
    });

    ehr.updatedAt = new Date().toISOString();
    ehr.updatedBy = `patient:${patientId}`;

    // ==========================================
    // THE CRYPTOGRAPHIC BLOCK
    // ==========================================
    const privateKey = req.actorPrivateKey;
    const publicKey  = await getPublicKey(patientId);
    const digitalSignature = signDocument(privateKey, ehr);
    logSignatureLocally(patientId, 'ehr-history', digitalSignature);

    ehr.securityProof = {
        signature:       digitalSignature,
        signerPublicKey: publicKey,
        signedByUserId:  patientId,
        timestamp:       new Date().toISOString()
    };
    // ==========================================

    // ==========================================
    // LOCAL BYPASS: STOP BEFORE IPFS
    // ==========================================
    return res.status(200).json({ 
        success: true, 
        message: "Local E2E Test: Patient Crypto Working", 
        proof: ehr.securityProof 
    });

    /* COMMENTED OUT FOR LOCAL TESTING
    // 3. Pin updated EHR to IPFS
    const newCID = await pinJSON(ehr, `ehr-${patientId}-history.json`);

    // 4. Store new CID on blockchain
    await req.contract.submitTransaction(
      'EhrContract:UpdateEHRCID',
      patientId, newCID, 'medicalHistory', 'New medical history entry'
    );

    logger.info('Patient added medical history entry', { patientId, newCID });
    return res.json({ success: true, data: { cid: newCID, ehr } });
    */
  })
);

module.exports = router;