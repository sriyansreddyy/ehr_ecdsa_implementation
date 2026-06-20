'use strict';

const { Contract } = require('fabric-contract-api');
const {
  requireRole,
  getCallerIdentity,
  accessKey,
  now,
  getState,
  putState,
} = require('./accessControl');

// Valid sections a patient can grant access to
const VALID_SECTIONS = ['ehr', 'visits', 'prescriptions', 'labResults', 'all'];

class AccessContract extends Contract {
  constructor() {
    super('AccessContract');
  }

  // ── GrantAccess ───────────────────────────────────────────────────────────
  // Patient grants a specific identity access to their records.
  //
  // Who can call this:
  //   'patientService' — the single service account used by patient-api.
  //                      patient-api verifies the patient's identity via
  //                      SQLite + JWT before calling this function.
  //   'admin'          — emergency override (e.g. legal/compliance team)
  //
  // Args:
  //   patientId    - the patient granting access
  //   granteeId    - userId of the person being granted access (e.g. "doctor")
  //   granteeRole  - role of grantee for display (e.g. "doctor")
  //   sectionsJson - JSON array: ["ehr", "visits"] or ["all"]
  //   expiresAt    - ISO date string or "" for no expiry
  async GrantAccess(ctx, patientId, granteeId, granteeRole, sectionsJson, expiresAt) {
    // patientService = patient-api's service account (verified patient JWT before calling)
    // admin          = emergency/compliance override
    const { userId } = requireRole(ctx, 'patientService', 'admin');

    if (!patientId) {
      throw new Error('patientId is required');
    }

    if (!granteeId || !granteeRole) {
      throw new Error('granteeId and granteeRole are required');
    }

    let sections;
    try {
      sections = JSON.parse(sectionsJson);
    } catch (e) {
      throw new Error('sectionsJson must be a valid JSON array');
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      throw new Error('At least one section must be specified');
    }

    const invalid = sections.filter(s => !VALID_SECTIONS.includes(s));
    if (invalid.length > 0) {
      throw new Error(
        `Invalid sections: ${invalid.join(', ')}. ` +
        `Valid: ${VALID_SECTIONS.join(', ')}`
      );
    }

    // Validate expiresAt format if provided
    if (expiresAt && expiresAt !== '') {
      if (isNaN(Date.parse(expiresAt))) {
        throw new Error('expiresAt must be a valid ISO date string or empty string');
      }
      if (expiresAt <= now()) {
        throw new Error('expiresAt must be in the future');
      }
    }

    // Load or initialise access record
    let accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) {
      accessRecord = {
        patientId,
        grants:   [],
        auditLog: [],
        createdAt: now(),
        updatedAt: now(),
      };
    }

    // If grantee already has an active grant, revoke it first (replace)
    accessRecord.grants = accessRecord.grants.map(g => {
      if (g.granteeId === granteeId && !g.revoked) {
        return { ...g, revoked: true, revokedAt: now(), revokedBy: userId, revokedReason: 'REPLACED_BY_NEW_GRANT' };
      }
      return g;
    });

    // Add new grant
    const grant = {
      grantId:     `${patientId}-G${accessRecord.grants.length + 1}`,
      granteeId,
      granteeRole,
      sections,
      grantedBy:   userId,   // always the patient
      grantedAt:   now(),
      expiresAt:   expiresAt || '',
      revoked:     false,
      revokedAt:   '',
      revokedBy:   '',
      revokedReason: '',
    };

    accessRecord.grants.push(grant);

    // Audit log entry
    accessRecord.auditLog.push({
      action:    'GRANT',
      granteeId,
      granteeRole,
      sections,
      expiresAt: expiresAt || '',
      by:        userId,
      at:        now(),
    });

    await putState(ctx, accessKey(patientId), accessRecord);
    return JSON.stringify(grant);
  }

  // ── RevokeAccess ──────────────────────────────────────────────────────────
  // Patient revokes a previously granted access.
  //
  // Who can call this:
  //   'patientService' — patient-api verified the patient's identity before calling
  //   'admin'          — emergency override
  //
  // Args:
  //   patientId  - the patient whose grant is being revoked
  //   granteeId  - who loses access
  //   reason     - optional reason string
  async RevokeAccess(ctx, patientId, granteeId, reason) {
    const { role, userId } = requireRole(ctx, 'patientService', 'admin');

    if (!patientId) throw new Error('patientId is required');
    if (!granteeId) throw new Error('granteeId is required');

    const accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) {
      throw new Error(`No access record found for patient: ${patientId}`);
    }

    let revoked = false;
    accessRecord.grants = accessRecord.grants.map(g => {
      if (g.granteeId === granteeId && !g.revoked) {
        revoked = true;
        return {
          ...g,
          revoked:       true,
          revokedAt:     now(),
          revokedBy:     userId,
          revokedReason: reason || 'REVOKED_BY_PATIENT',
        };
      }
      return g;
    });

    if (!revoked) {
      throw new Error(
        `No active grant found for '${granteeId}' on patient '${patientId}'`
      );
    }

    accessRecord.auditLog.push({
      action:    'REVOKE',
      granteeId,
      reason:    reason || '',
      by:        userId,
      at:        now(),
    });

    await putState(ctx, accessKey(patientId), accessRecord);
    return JSON.stringify({ success: true, granteeId, patientId });
  }

  // ── HasAccess ─────────────────────────────────────────────────────────────
  // Check if a specific identity currently has access to a section.
  // Used by backends before fetching IPFS content.
  // Returns JSON { hasAccess: bool, grant: {...} | null }
  //
  // Args:
  //   patientId  - patient to check
  //   granteeId  - identity to check
  //   section    - 'ehr' | 'visits' | 'prescriptions' | 'labResults' | 'all'
  async HasAccess(ctx, patientId, granteeId, section) {
    // Any staff or patientService can query access status
    const { role } = getCallerIdentity(ctx);
    const allowed = [
      'patientService', 'admin', 'doctor', 'nurse',
      'receptionist', 'medrecordofficer', 'pharmacist',
    ];
    if (!allowed.includes(role)) {
      throw new Error('Access denied: cannot query access status');
    }

    const accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord || !accessRecord.grants) {
      return JSON.stringify({ hasAccess: false, grant: null });
    }

    const nowIso = new Date().toISOString();
    const sec    = section || 'all';
    const grant  = accessRecord.grants.find(g =>
      g.granteeId === granteeId &&
      !g.revoked  &&
      (g.expiresAt === '' || g.expiresAt > nowIso) &&
      (g.sections.includes('all') || g.sections.includes(sec))
    );

    return JSON.stringify({ hasAccess: !!grant, grant: grant || null });
  }

  // ── GetAccessList ─────────────────────────────────────────────────────────
  // Returns all grants (active and revoked) for a patient.
  // Callable by: patientService (patient-api, verified patient JWT)
  //              admin (any patient)
  //              any staff role (read-only visibility for clinical context)
  async GetAccessList(ctx, patientId) {
    const { role } = getCallerIdentity(ctx);

    // patientService, admin, or any known staff can view
    const allowed = [
      'patientService', 'admin', 'doctor', 'nurse', 'receptionist',
      'medrecordofficer', 'pharmacist',
    ];
    if (!allowed.includes(role)) {
      throw new Error('Access denied: not permitted to view access list');
    }

    const accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) {
      return JSON.stringify({ patientId, grants: [], auditLog: [] });
    }
    return JSON.stringify(accessRecord);
  }

  // ── GetActiveGrants ───────────────────────────────────────────────────────
  // Returns only active (non-revoked, non-expired) grants for a patient.
  // Used by patient-api to show patient their current grants dashboard.
  async GetActiveGrants(ctx, patientId) {
    const { role } = getCallerIdentity(ctx);
    const allowed = [
      'patientService', 'admin', 'doctor', 'nurse',
      'receptionist', 'medrecordofficer',
    ];
    if (!allowed.includes(role)) {
      throw new Error('Access denied: not permitted to view grants');
    }

    const accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) return JSON.stringify([]);

    const nowIso = new Date().toISOString();
    const active = (accessRecord.grants || []).filter(g =>
      !g.revoked &&
      (g.expiresAt === '' || g.expiresAt > nowIso)
    );
    return JSON.stringify(active);
  }

  // ── LogAccess ─────────────────────────────────────────────────────────────
  // Backend calls this AFTER successfully fetching IPFS data for an authorized user.
  // Creates an on-chain access audit trail — who accessed what and when.
  // Note: this is called by staff/patient backends, not by other contracts.
  //
  // Args:
  //   patientId  - whose data was accessed
  //   section    - which section was accessed
  async LogAccess(ctx, patientId, section) {
    // Any authenticated caller (staff or patient) can log their own access
    const { role, userId } = getCallerIdentity(ctx);

    // Load or init access record — log even if no grants (staff access)
    let accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) {
      accessRecord = {
        patientId,
        grants:    [],
        auditLog:  [],
        createdAt: now(),
        updatedAt: now(),
      };
    }

    if (!accessRecord.auditLog) accessRecord.auditLog = [];

    accessRecord.auditLog.push({
      action:  'READ',
      by:      userId,
      role,
      section: section || 'unspecified',
      at:      now(),
    });

    await putState(ctx, accessKey(patientId), accessRecord);
    return JSON.stringify({ success: true });
  }

  // ── RequestAccess ─────────────────────────────────────────────────────────
  // Doctor or nurse requests access to a patient's EHR.
  // Creates a PENDING request inside the patient's ACCESS record.
  // The patient then approves or rejects it from their portal.
  //
  // Args:
  //   patientId    - patient whose records are being requested
  //   sectionsJson - JSON array of sections requested, e.g. ["ehr","visits"]
  //   reason       - why access is needed (shown to patient)
  async RequestAccess(ctx, patientId, sectionsJson, reason) {
    const { userId, role } = getCallerIdentity(ctx);
    const allowed = ['doctor', 'nurse', 'admin'];
    if (!allowed.includes(role)) {
      throw new Error(`Access denied: role '${role}' cannot request EHR access`);
    }

    if (!patientId) throw new Error('patientId is required');

    let sections;
    try { sections = JSON.parse(sectionsJson); } catch {
      throw new Error('sectionsJson must be a valid JSON array');
    }
    if (!Array.isArray(sections) || sections.length === 0) {
      throw new Error('At least one section must be specified');
    }
    const invalid = sections.filter(s => !VALID_SECTIONS.includes(s));
    if (invalid.length > 0) throw new Error(`Invalid sections: ${invalid.join(', ')}`);

    let accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) {
      accessRecord = { patientId, grants: [], requests: [], auditLog: [], createdAt: now(), updatedAt: now() };
    }
    if (!accessRecord.requests) accessRecord.requests = [];

    // Only one PENDING request per role at a time
    const existingPending = accessRecord.requests.find(
      r => r.requesterId === userId && r.status === 'PENDING'
    );
    if (existingPending) {
      throw new Error(`A pending request from '${userId}' already exists (id: ${existingPending.requestId})`);
    }

    const request = {
      requestId:     `${patientId}-REQ${accessRecord.requests.length + 1}`,
      requesterId:   userId,
      requesterRole: role,
      sections,
      reason:        reason || '',
      status:        'PENDING',
      requestedAt:   now(),
      respondedAt:   '',
      respondedBy:   '',
      rejectReason:  '',
    };

    accessRecord.requests.push(request);
    accessRecord.auditLog.push({
      action:        'REQUEST',
      requestId:     request.requestId,
      requesterId:   userId,
      requesterRole: role,
      sections,
      at:            now(),
    });
    accessRecord.updatedAt = now();

    await putState(ctx, accessKey(patientId), accessRecord);
    return JSON.stringify(request);
  }

  // ── ApproveAccessRequest ──────────────────────────────────────────────────
  // Patient approves a pending access request.
  // Marks the request APPROVED and creates a real grant.
  //
  // Args:
  //   patientId  - the patient approving
  //   requestId  - which request to approve
  //   expiresAt  - optional ISO date for grant expiry (or "")
  async ApproveAccessRequest(ctx, patientId, requestId, expiresAt) {
    const { userId } = requireRole(ctx, 'patientService', 'admin');

    const accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) throw new Error(`No access record for patient: ${patientId}`);

    const req = (accessRecord.requests || []).find(r => r.requestId === requestId);
    if (!req) throw new Error(`Request not found: ${requestId}`);
    if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}`);

    // Revoke any existing active grant from same requester (replace)
    accessRecord.grants = (accessRecord.grants || []).map(g => {
      if (g.granteeId === req.requesterId && !g.revoked) {
        return { ...g, revoked: true, revokedAt: now(), revokedBy: userId, revokedReason: 'REPLACED_BY_REQUEST_APPROVAL' };
      }
      return g;
    });

    // Create new grant
    const grant = {
      grantId:     `${patientId}-G${accessRecord.grants.length + 1}`,
      granteeId:   req.requesterId,
      granteeRole: req.requesterRole,
      sections:    req.sections,
      grantedBy:   userId,
      grantedAt:   now(),
      expiresAt:   expiresAt || '',
      revoked:     false,
      revokedAt:   '',
      revokedBy:   '',
      revokedReason: '',
      fromRequestId: requestId,
    };
    accessRecord.grants.push(grant);

    // Update request status
    req.status       = 'APPROVED';
    req.respondedAt  = now();
    req.respondedBy  = userId;

    accessRecord.auditLog.push({
      action:    'GRANT',
      granteeId: req.requesterId,
      granteeRole: req.requesterRole,
      sections:  req.sections,
      expiresAt: expiresAt || '',
      by:        userId,
      at:        now(),
      fromRequestId: requestId,
    });
    accessRecord.updatedAt = now();

    await putState(ctx, accessKey(patientId), accessRecord);
    return JSON.stringify({ request: req, grant });
  }

  // ── RejectAccessRequest ───────────────────────────────────────────────────
  // Patient rejects a pending access request.
  //
  // Args:
  //   patientId    - the patient rejecting
  //   requestId    - which request to reject
  //   rejectReason - optional reason shown to requester
  async RejectAccessRequest(ctx, patientId, requestId, rejectReason) {
    const { userId } = requireRole(ctx, 'patientService', 'admin');

    const accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) throw new Error(`No access record for patient: ${patientId}`);

    const req = (accessRecord.requests || []).find(r => r.requestId === requestId);
    if (!req) throw new Error(`Request not found: ${requestId}`);
    if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}`);

    req.status       = 'REJECTED';
    req.respondedAt  = now();
    req.respondedBy  = userId;
    req.rejectReason = rejectReason || '';

    accessRecord.auditLog.push({
      action:       'REJECT_REQUEST',
      requestId,
      requesterId:  req.requesterId,
      rejectReason: rejectReason || '',
      by:           userId,
      at:           now(),
    });
    accessRecord.updatedAt = now();

    await putState(ctx, accessKey(patientId), accessRecord);
    return JSON.stringify(req);
  }

  // ── GetAccessRequests ─────────────────────────────────────────────────────
  // Returns all access requests for a patient (all statuses).
  // patientService and admin can call this.
  async GetAccessRequests(ctx, patientId) {
    const { role } = getCallerIdentity(ctx);
    const allowed = ['patientService', 'admin'];
    if (!allowed.includes(role)) {
      throw new Error('Access denied: only patientService or admin can view requests');
    }

    const accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) return JSON.stringify([]);
    return JSON.stringify(accessRecord.requests || []);
  }

  // ── GetAuditLog ───────────────────────────────────────────────────────────
  // Returns the full audit log — every GRANT, REVOKE, READ event.
  // patientService (patient-api) and admin can view any patient's log.
  async GetAuditLog(ctx, patientId) {
    const { role } = getCallerIdentity(ctx);
    const allowed = ['patientService', 'admin', 'medrecordofficer'];
    if (!allowed.includes(role)) {
      throw new Error('Access denied: only patientService or admin can view audit log');
    }

    const accessRecord = await getState(ctx, accessKey(patientId));
    if (!accessRecord) return JSON.stringify([]);
    return JSON.stringify(accessRecord.auditLog || []);
  }
}

module.exports = { AccessContract };
