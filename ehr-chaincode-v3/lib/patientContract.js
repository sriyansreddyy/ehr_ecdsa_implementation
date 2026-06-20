'use strict';

const { Contract } = require('fabric-contract-api');
const {
  requireRole,
  assertReadAccess,
  getCallerIdentity,
  now,
  getState,
  putState,
  getHistory,
} = require('./accessControl');

const PATIENT_PREFIX = 'PATIENT';
const patientKey = id => `${PATIENT_PREFIX}:${id}`;

class PatientContract extends Contract {
  constructor() {
    super('PatientContract');
  }

  // ── RegisterPatient ───────────────────────────────────────────────────────
  // Receptionist/admin creates the patient master record.
  // initialEhrCID is optional — passed by backend after pinning empty EHR to IPFS.
  // If omitted (e.g. legacy call) it can be set later via EhrContract:InitEHR.
  async RegisterPatient(ctx, patientId, name, age, gender, bloodGroup, contact, address, initialEhrCID) {
    const { userId } = requireRole(ctx, 'receptionist', 'admin');

    if (!patientId || !name || !age || !gender || !bloodGroup || !contact || !address) {
      throw new Error('All fields are required: patientId, name, age, gender, bloodGroup, contact, address');
    }

    const existing = await getState(ctx, patientKey(patientId));
    if (existing) throw new Error(`Patient already exists: ${patientId}`);

    const patient = {
      patientId,
      name,
      age:          parseInt(age, 10),
      gender,
      bloodGroup,
      contact,
      address,
      visitIds:     [],
      visitCount:   0,
      // IPFS EHR reference — set by backend after pinning, or via InitEHR
      ehrCID:       initialEhrCID || '',
      registeredBy: userId,
      createdAt:    now(),
      updatedAt:    now(),
    };

    await putState(ctx, patientKey(patientId), patient);
    return JSON.stringify(patient);
  }

  // ── GetPatient ────────────────────────────────────────────────────────────
  // Returns patient demographics + visitIds + ehrCID.
  // Access control: staff always allowed, patients own record, others need grant.
  async GetPatient(ctx, patientId) {
    await assertReadAccess(ctx, patientId, 'all');
    const patient = await getState(ctx, patientKey(patientId));
    if (!patient) throw new Error(`Patient not found: ${patientId}`);
    return JSON.stringify(patient);
  }

  // ── PatientExists ─────────────────────────────────────────────────────────
  async PatientExists(ctx, patientId) {
    getCallerIdentity(ctx);
    const patient = await getState(ctx, patientKey(patientId));
    return JSON.stringify(!!patient);
  }

  // ── GetPatientVisits ──────────────────────────────────────────────────────
  // Returns array of visitIds only (not full visit objects).
  async GetPatientVisits(ctx, patientId) {
    await assertReadAccess(ctx, patientId, 'visits');
    const patient = await getState(ctx, patientKey(patientId));
    if (!patient) throw new Error(`Patient not found: ${patientId}`);
    return JSON.stringify(patient.visitIds);
  }

  // ── GetPatientHistory ─────────────────────────────────────────────────────
  // Full blockchain tx history of the patient master record.
  async GetPatientHistory(ctx, patientId) {
    await assertReadAccess(ctx, patientId, 'all');
    const history = await getHistory(ctx, patientKey(patientId));
    return JSON.stringify(history);
  }

  // ── UpdatePatientInfo ─────────────────────────────────────────────────────
  // Admin/receptionist can update contact/address (non-clinical).
  async UpdatePatientInfo(ctx, patientId, contact, address) {
    requireRole(ctx, 'admin', 'receptionist');
    const patient = await getState(ctx, patientKey(patientId));
    if (!patient) throw new Error(`Patient not found: ${patientId}`);
    if (contact) patient.contact = contact;
    if (address) patient.address = address;
    await putState(ctx, patientKey(patientId), patient);
    return JSON.stringify(patient);
  }

  // ── SetPatientEhrCID ──────────────────────────────────────────────────────
  // Called by backend after InitEHR if ehrCID was not set at registration.
  // Also used if EHR was re-pinned (e.g. migration).
  async SetPatientEhrCID(ctx, patientId, ehrCID) {
    requireRole(ctx, 'admin', 'receptionist');
    const patient = await getState(ctx, patientKey(patientId));
    if (!patient) throw new Error(`Patient not found: ${patientId}`);
    patient.ehrCID = ehrCID;
    await putState(ctx, patientKey(patientId), patient);
    return JSON.stringify(patient);
  }

  // ── ListAllPatients ───────────────────────────────────────────────────────
  // Returns all patient records. Restricted to receptionist/admin.
  async ListAllPatients(ctx) {
    requireRole(ctx, 'receptionist', 'admin');
    const iterator = await ctx.stub.getStateByRange(`${PATIENT_PREFIX}:`, `${PATIENT_PREFIX};`);
    const results = [];
    while (true) {
      const res = await iterator.next();
      if (res.done) break;
      if (res.value?.value?.length > 0) {
        results.push(JSON.parse(res.value.value.toString('utf8')));
      }
    }
    await iterator.close();
    return JSON.stringify(results);
  }

  // ── Internal: _addVisitToPatient ──────────────────────────────────────────
  // Called by VisitContract.OpenVisit. Not exposed to external callers.
  async _addVisitToPatient(ctx, patientId, visitId) {
    const patient = await getState(ctx, patientKey(patientId));
    if (!patient) throw new Error(`Patient not found: ${patientId}`);
    patient.visitIds.push(visitId);
    patient.visitCount = patient.visitIds.length;
    await putState(ctx, patientKey(patientId), patient);
  }
}

module.exports = { PatientContract, patientKey };
