'use strict';

/**
 * access.js — Patient access control routes
 *
 * POST   /access/grant       — grant a staff member access to EHR/visits
 * DELETE /access/revoke/:id  — revoke an active grant
 * GET    /access             — list all grants (active + revoked)
 * GET    /access/active      — list only active grants
 * GET    /access/log         — full audit log (every GRANT, REVOKE, READ)
 * GET    /access/check/:id   — check if a specific identity has access
 *
 * These call AccessContract on blockchain, signed by patientService identity.
 * patient-api verifies the patient's JWT BEFORE calling chaincode —
 * that's the security guarantee: only the authenticated patient can grant/revoke.
 */

const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');

const { authenticate }      = require('../middleware/auth');
const { fabricContext }     = require('../middleware/fabricContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const secured = [authenticate, fabricContext];

const VALID_SECTIONS = ['ehr', 'visits', 'prescriptions', 'labResults', 'all'];

// ── POST /access/grant ────────────────────────────────────────────────────────
// Patient grants a staff member (or anyone) access to sections of their records.
//
// Body:
//   granteeId    — Fabric userId of the person to grant (e.g. "doctor")
//   granteeRole  — their role label (e.g. "doctor") — for display only
//   sections     — array: ["ehr", "visits"] or ["all"]
//   expiresAt    — ISO date string or "" for no expiry
//
// Example: patient grants Dr. Smith access to EHR and visits for 30 days
//   { granteeId: "doctor", granteeRole: "doctor",
//     sections: ["ehr", "visits"], expiresAt: "2026-06-01T00:00:00.000Z" }
router.post('/grant',
  ...secured,
  [
    body('granteeId').trim().notEmpty().withMessage('granteeId required'),
    body('granteeRole').trim().notEmpty().withMessage('granteeRole required'),
    body('sections').isArray({ min: 1 }).withMessage('sections must be a non-empty array'),
    body('sections.*').isIn(VALID_SECTIONS).withMessage(`sections must be one of: ${VALID_SECTIONS.join(', ')}`),
    body('expiresAt').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId } = req.patient;
    const { granteeId, granteeRole, sections, expiresAt = '' } = req.body;

    // Validate expiresAt if provided
    if (expiresAt && expiresAt !== '') {
      if (isNaN(Date.parse(expiresAt))) {
        return res.status(400).json({ success: false, error: 'expiresAt must be a valid ISO date string' });
      }
      if (new Date(expiresAt) <= new Date()) {
        return res.status(400).json({ success: false, error: 'expiresAt must be in the future' });
      }
    }

    // Call blockchain — patientService account signs, but we pass patientId
    // so chaincode records this as a grant BY the patient
    const result = await req.contract.submitTransaction(
      'AccessContract:GrantAccess',
      patientId,
      granteeId,
      granteeRole,
      JSON.stringify(sections),
      expiresAt
    );

    const grant = parseResult(result);
    logger.info('Patient granted access', { patientId, granteeId, sections, expiresAt });
    return res.status(201).json({ success: true, data: grant });
  })
);

// ── DELETE /access/revoke/:granteeId ─────────────────────────────────────────
// Patient revokes access for a specific grantee.
// Body: { reason: "optional reason string" }
router.delete('/revoke/:granteeId',
  ...secured,
  [param('granteeId').trim().notEmpty()],
  wrap(async (req, res) => {
    const { patientId } = req.patient;
    const { granteeId } = req.params;
    const reason = req.body?.reason || 'Revoked by patient';

    await req.contract.submitTransaction(
      'AccessContract:RevokeAccess',
      patientId, granteeId, reason
    );

    logger.info('Patient revoked access', { patientId, granteeId, reason });
    return res.json({ success: true, data: { patientId, granteeId, revoked: true } });
  })
);

// ── GET /access ───────────────────────────────────────────────────────────────
// Returns all grants (active + revoked) with full audit log.
router.get('/', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  const result = await req.contract.evaluateTransaction(
    'AccessContract:GetAccessList', patientId
  );
  const data = parseResult(result) || { grants: [], auditLog: [] };

  return res.json({ success: true, data });
}));

// ── GET /access/active ────────────────────────────────────────────────────────
// Returns only currently active (non-revoked, non-expired) grants.
// Used by patient dashboard to show "who can see my records right now".
router.get('/active', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  const result = await req.contract.evaluateTransaction(
    'AccessContract:GetActiveGrants', patientId
  );
  const grants = parseResult(result) || [];

  return res.json({ success: true, data: grants });
}));

// ── GET /access/log ───────────────────────────────────────────────────────────
// Returns the full audit log — every GRANT, REVOKE, and READ event.
// Shows patient exactly who accessed their records and when.
router.get('/log', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;

  const result = await req.contract.evaluateTransaction(
    'AccessContract:GetAuditLog', patientId
  );
  const log = parseResult(result) || [];

  return res.json({ success: true, data: log });
}));

// ── GET /access/check/:granteeId ──────────────────────────────────────────────
// Patient checks if a specific person currently has access to their records.
// Query param: ?section=ehr (default: all)
router.get('/check/:granteeId',
  ...secured,
  wrap(async (req, res) => {
    const { patientId } = req.patient;
    const { granteeId } = req.params;
    const section = req.query.section || 'all';

    const result = await req.contract.evaluateTransaction(
      'AccessContract:HasAccess',
      patientId, granteeId, section
    );
    const data = parseResult(result);

    return res.json({ success: true, data });
  })
);

// ── GET /access/requests ──────────────────────────────────────────────────────
// Returns all access requests for this patient (all statuses).
router.get('/requests', ...secured, wrap(async (req, res) => {
  const { patientId } = req.patient;
  const result = await req.contract.evaluateTransaction(
    'AccessContract:GetAccessRequests', patientId
  );
  return res.json({ success: true, data: parseResult(result) || [] });
}));

// ── POST /access/requests/:requestId/approve ──────────────────────────────────
// Patient approves a pending access request — creates a grant on-chain.
// Body: { expiresAt: "" }  (optional expiry)
router.post('/requests/:requestId/approve',
  ...secured,
  [
    param('requestId').trim().notEmpty(),
    body('expiresAt').optional().isString(),
  ],
  wrap(async (req, res) => {
    const { patientId } = req.patient;
    const { requestId } = req.params;
    const expiresAt = req.body?.expiresAt || '';

    const result = await req.contract.submitTransaction(
      'AccessContract:ApproveAccessRequest',
      patientId, requestId, expiresAt
    );
    const data = parseResult(result);
    logger.info('Patient approved access request', { patientId, requestId });
    return res.json({ success: true, data });
  })
);

// ── POST /access/requests/:requestId/reject ───────────────────────────────────
// Patient rejects a pending access request.
// Body: { reason: "optional reason" }
router.post('/requests/:requestId/reject',
  ...secured,
  [param('requestId').trim().notEmpty()],
  wrap(async (req, res) => {
    const { patientId } = req.patient;
    const { requestId } = req.params;
    const reason = req.body?.reason || 'Rejected by patient';

    const result = await req.contract.submitTransaction(
      'AccessContract:RejectAccessRequest',
      patientId, requestId, reason
    );
    const data = parseResult(result);
    logger.info('Patient rejected access request', { patientId, requestId });
    return res.json({ success: true, data });
  })
);

module.exports = router;
