'use strict';

const { Contract } = require('fabric-contract-api');
const {
  requireRole,
  now,
  getState,
  putState,
} = require('./accessControl');
const { visitKey, VISIT_STATUS } = require('./visitContract');

// ─────────────────────────────────────────────────────────────────────────────
// LabContract — manages lab request status transitions.
//
// All lab request data (tests, results, resultsHash, acknowledgedBy, etc.)
// lives in the IPFS visit JSON. The backend:
//   1. Fetches current visitCID
//   2. Fetches IPFS JSON
//   3. Finds the labRequest entry by labRequestId
//   4. Updates its status / results
//   5. Pins updated JSON → newCID
//   6. Calls the function here with newCID
// ─────────────────────────────────────────────────────────────────────────────

class LabContract extends Contract {
  constructor() {
    super('LabContract');
  }

  // ── AcknowledgeLabRequest ─────────────────────────────────────────────────
  // Lab receptionist acknowledges receipt of lab request.
  // visitCID: IPFS JSON updated with labRequest.status = 'ACKNOWLEDGED'.
  async AcknowledgeLabRequest(ctx, visitId, labRequestId, visitCID) {
    const { userId } = requireRole(ctx, 'labreceptionist', 'labadmin');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    if (!labRequestId) throw new Error('labRequestId is required');
    if (!visitCID)     throw new Error('visitCID is required');

    visit.cidHistory.push({
      cid: visitCID, updatedBy: userId, updatedAt: now(),
      reason: `LAB_ACKNOWLEDGED:${labRequestId}`,
    });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── SubmitLabResult ───────────────────────────────────────────────────────
  // Lab technician submits test results.
  // visitCID: IPFS JSON updated with results + resultsHash + status = 'COMPLETED'.
  async SubmitLabResult(ctx, visitId, labRequestId, visitCID) {
    const { userId } = requireRole(ctx, 'labtechnician', 'radiologist', 'labadmin');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    if (!labRequestId) throw new Error('labRequestId is required');
    if (!visitCID)     throw new Error('visitCID is required');

    visit.cidHistory.push({
      cid: visitCID, updatedBy: userId, updatedAt: now(),
      reason: `LAB_RESULT_SUBMITTED:${labRequestId}`,
    });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── ApproveLabResult ──────────────────────────────────────────────────────
  // Lab supervisor approves results. Visit status → WITH_DOCTOR.
  // visitCID: IPFS JSON updated with status = 'APPROVED' + approvedBy.
  async ApproveLabResult(ctx, visitId, labRequestId, visitCID) {
    const { userId } = requireRole(ctx, 'labsupervisor', 'labadmin');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    if (!labRequestId) throw new Error('labRequestId is required');
    if (!visitCID)     throw new Error('visitCID is required');

    // Move visit back to doctor for review
    visit.status = VISIT_STATUS.WITH_DOCTOR;
    visit.cidHistory.push({
      cid: visitCID, updatedBy: userId, updatedAt: now(),
      reason: `LAB_RESULT_APPROVED:${labRequestId}`,
    });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }
}

module.exports = { LabContract };
