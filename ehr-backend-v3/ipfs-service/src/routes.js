'use strict';

const router = require('express').Router();
const multer = require('multer');
const ipfs   = require('./ipfs');
const { emptyEHR, emptyVisit } = require('./templates');
const logger = require('./logger');

const upload = multer({ storage: multer.memoryStorage() });

// ── POST /pin ─────────────────────────────────────────────────────────────────
// Pin any JSON object to IPFS.
// Returns: { success: true, cid: "bafyrei..." }
//
// Body: { json: { ...any object... }, filename: "optional-label.json" }
//
// Used by:
//   - peer0-api  when registering patient (pin empty EHR)
//   - peer0-api  when opening visit     (pin empty visit JSON)
//   - peer1-api  when doctor updates    (pin updated visit JSON)
//   - peer2-api  when nurse updates     (pin updated visit JSON)
//   - extorg-api when lab updates       (pin updated visit JSON)
//   - patient-api when reading EHR      (not write, uses /fetch)

router.post('/pin', async (req, res, next) => {
  try {
    const { json, filename } = req.body;
    if (!json || typeof json !== 'object') {
      return res.status(400).json({ success: false, error: 'json body is required and must be an object' });
    }

    const cid = await ipfs.pinJSON(json, filename);
    logger.info('POST /pin', { cid, filename });
    return res.status(201).json({ success: true, cid });
  } catch (err) {
    next(err);
  }
});

// ── GET /fetch/:cid ───────────────────────────────────────────────────────────
// Fetch and return JSON stored at a CID.
// Returns: { success: true, cid: "...", data: { ...json... } }
//
// Used by all backends before modifying visit or EHR content.

router.get('/fetch/:cid', async (req, res, next) => {
  try {
    const { cid } = req.params;
    const data = await ipfs.fetchJSON(cid);
    logger.info('GET /fetch', { cid });
    return res.json({ success: true, cid, data });
  } catch (err) {
    next(err);
  }
});

// ── POST /ehr/init ────────────────────────────────────────────────────────────
// Convenience route — create and pin an empty EHR template.
// Returns: { success: true, cid: "...", ehr: { ...template... } }
//
// Body: { patientId: "PAT-001", demographics: { name, age, gender, ... } }
//
// Called by peer0-api immediately after RegisterPatient on blockchain.

router.post('/ehr/init', async (req, res, next) => {
  try {
    const { patientId, demographics } = req.body;
    if (!patientId) {
      return res.status(400).json({ success: false, error: 'patientId is required' });
    }

    const ehr = emptyEHR(patientId, demographics || {});
    const cid = await ipfs.pinJSON(ehr, `ehr-${patientId}-init.json`);
    logger.info('POST /ehr/init', { patientId, cid });
    return res.status(201).json({ success: true, cid, ehr });
  } catch (err) {
    next(err);
  }
});

// ── POST /visit/init ──────────────────────────────────────────────────────────
// Convenience route — create and pin an empty visit template.
// Returns: { success: true, cid: "...", visit: { ...template... } }
//
// Body: { visitId, patientId, chiefComplaint, openedBy }
//
// Called by peer0-api when OpenVisit is called.

router.post('/visit/init', async (req, res, next) => {
  try {
    const { visitId, patientId, chiefComplaint, openedBy } = req.body;
    if (!visitId || !patientId) {
      return res.status(400).json({ success: false, error: 'visitId and patientId are required' });
    }

    const visit = emptyVisit(visitId, patientId, chiefComplaint, openedBy || 'receptionist');
    const cid   = await ipfs.pinJSON(visit, `visit-${visitId}-init.json`);
    logger.info('POST /visit/init', { visitId, patientId, cid });
    return res.status(201).json({ success: true, cid, visit });
  } catch (err) {
    next(err);
  }
});

// ── POST /unpin ───────────────────────────────────────────────────────────────
// Unpin a CID from the local node.
// IMPORTANT: In EHR context, old visit CIDs should NOT be unpinned —
//            they form the immutable history. Use only for cleanup of test data.
// Body: { cid: "bafyrei..." }

router.post('/unpin', async (req, res, next) => {
  try {
    const { cid } = req.body;
    if (!cid) return res.status(400).json({ success: false, error: 'cid is required' });

    await ipfs.unpin(cid);
    logger.info('POST /unpin', { cid });
    return res.json({ success: true, cid });
  } catch (err) {
    next(err);
  }
});

// ── GET /pins ─────────────────────────────────────────────────────────────────
// List all pinned CIDs on the local node.
// Admin/debug use only.

router.get('/pins', async (req, res, next) => {
  try {
    const pins = await ipfs.listPins();
    return res.json({ success: true, count: pins.length, pins });
  } catch (err) {
    next(err);
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
// Returns IPFS node status.
// Does NOT require API key (called by monitoring tools).

router.get('/health', async (req, res, next) => {
  try {
    const info = await ipfs.checkHealth();
    return res.json({
      success: true,
      service: 'ipfs-service',
      port:    process.env.PORT || 3006,
      ipfs:    info,
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      service: 'ipfs-service',
      error:   'IPFS node unreachable',
      detail:  err.message,
    });
  }
});

// ── POST /upload ─────────────────────────────────────────────────────────────
// Upload any binary file (image, PDF, etc) to IPFS.
// Body (multipart/form-data): file="Binary Content"
// Returns: { success: true, cid: "bafyrei..." }

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'file is required' });
    }

    const cid = await ipfs.pinFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    logger.info('POST /upload', { cid, filename: req.file.originalname });
    return res.status(201).json({ success: true, cid });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
