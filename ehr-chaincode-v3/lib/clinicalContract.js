'use strict';

const { Contract } = require('fabric-contract-api');
const {
  requireRole,
  getCallerIdentity,
  now,
  getState,
  putState,
} = require('./accessControl');
const { visitKey, VISIT_STATUS, ACTIVE_STATUSES } = require('./visitContract');

// ─────────────────────────────────────────────────────────────────────────────
// ClinicalContract — manages status transitions for clinical updates.
//
// In the IPFS architecture, the CONTENT of diagnosis notes, vitals, prescriptions
// and care notes all live in the IPFS JSON. The backend:
//   1. Fetches current visitCID from chain
//   2. Fetches JSON from IPFS
//   3. Modifies the relevant section
//   4. Pins updated JSON to IPFS → newCID
//   5. Calls the appropriate function here, passing newCID
//
// This contract only validates role/status and stores the new CID.
// ─────────────────────────────────────────────────────────────────────────────

class ClinicalContract extends Contract {
  constructor() {
    super('ClinicalContract');
  }

  // ── UpdateDiagnosisNotes ──────────────────────────────────────────────────
  // Doctor updates working diagnosis notes in IPFS JSON.
  // visitCID: updated IPFS JSON with new diagnosisNotes value.
  async UpdateDiagnosisNotes(ctx, visitId, visitCID) {
    const { userId } = requireRole(ctx, 'doctor');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (!ACTIVE_STATUSES.includes(visit.status)) {
      throw new Error(`Cannot update diagnosis in status '${visit.status}'`);
    }
    if (!visitCID) throw new Error('visitCID is required');

    visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'DIAGNOSIS_NOTES_UPDATED' });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── RecordVitals ──────────────────────────────────────────────────────────
  // Nurse records vitals. IPFS JSON updated by backend with vitals object.
  async RecordVitals(ctx, visitId, visitCID) {
    const { userId } = requireRole(ctx, 'nurse');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (!ACTIVE_STATUSES.includes(visit.status)) {
      throw new Error(`Cannot record vitals in status '${visit.status}'`);
    }
    if (!visitCID) throw new Error('visitCID is required');

    visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'VITALS_RECORDED' });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── AddCareNote ───────────────────────────────────────────────────────────
  // Nurse appends a care note. IPFS JSON updated by backend.
  async AddCareNote(ctx, visitId, visitCID) {
    const { userId } = requireRole(ctx, 'nurse');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (!ACTIVE_STATUSES.includes(visit.status)) {
      throw new Error(`Cannot add care note in status '${visit.status}'`);
    }
    if (!visitCID) throw new Error('visitCID is required');

    visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'CARE_NOTE_ADDED' });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── UpdatePrescription ────────────────────────────────────────────────────
  // Doctor adds a new prescription version. IPFS JSON updated by backend.
  async UpdatePrescription(ctx, visitId, visitCID) {
    const { userId } = requireRole(ctx, 'doctor');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (!ACTIVE_STATUSES.includes(visit.status)) {
      throw new Error(`Cannot update prescription in status '${visit.status}'`);
    }
    if (!visitCID) throw new Error('visitCID is required');

    visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'PRESCRIPTION_UPDATED' });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── DispenseMedication ────────────────────────────────────────────────────
  // Pharmacist confirms dispense. IPFS JSON updated by backend.
  async DispenseMedication(ctx, visitId, visitCID) {
    const { userId } = requireRole(ctx, 'pharmacist');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (visit.status !== VISIT_STATUS.VISIT_FINALIZED) {
      throw new Error(`Visit must be VISIT_FINALIZED for medication dispensing. Current: '${visit.status}'`);
    }
    if (!visitCID) throw new Error('visitCID is required');

    visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'MEDICATION_DISPENSED' });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }
}

module.exports = { ClinicalContract };
