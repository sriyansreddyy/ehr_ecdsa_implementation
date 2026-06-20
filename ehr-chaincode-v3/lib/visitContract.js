'use strict';

const { Contract } = require('fabric-contract-api');
const {
  requireRole,
  assertReadAccess,
  getCallerIdentity,
  makeVisitId,
  now,
  getState,
  putState,
  getHistory,
} = require('./accessControl');
const { patientKey } = require('./patientContract');

const VISIT_PREFIX = 'VISIT';
const visitKey = id => `${VISIT_PREFIX}:${id}`;

// ── Visit status constants ────────────────────────────────────────────────────
const VISIT_STATUS = {
  OPEN:              'OPEN',
  WITH_DOCTOR:       'WITH_DOCTOR',
  WITH_NURSE:        'WITH_NURSE',
  WITH_LAB:          'WITH_LAB',
  VISIT_FINALIZED:   'VISIT_FINALIZED',
  RECORD_FINALIZED:  'RECORD_FINALIZED',
  CLAIM_SUBMITTED:   'CLAIM_SUBMITTED',
  CLAIM_UNDER_AUDIT: 'CLAIM_UNDER_AUDIT',
  CLAIM_APPROVED:    'CLAIM_APPROVED',
  CLAIM_REJECTED:    'CLAIM_REJECTED',
  DISCHARGED:        'DISCHARGED',
};

// Statuses where clinical work is still active
const ACTIVE_STATUSES = [
  VISIT_STATUS.OPEN,
  VISIT_STATUS.WITH_DOCTOR,
  VISIT_STATUS.WITH_NURSE,
  VISIT_STATUS.WITH_LAB,
];

class VisitContract extends Contract {
  constructor() {
    super('VisitContract');
  }

  // ── OpenVisit ─────────────────────────────────────────────────────────────
  // Receptionist opens a new visit.
  // visitCID: IPFS CID of the initial (empty) visit JSON — backend pins it first.
  //
  // What's ON-CHAIN:  visitId, patientId, status, assigned staff, visitCID
  // What's IN IPFS:   chiefComplaint, diagnosis, vitals, prescriptions,
  //                   careNotes, labRequests, forwardingLog, discharge info
  async OpenVisit(ctx, patientId, chiefComplaint, visitCID) {
    const { userId } = requireRole(ctx, 'receptionist', 'admin');

    const patientBytes = await ctx.stub.getState(patientKey(patientId));
    if (!patientBytes || patientBytes.length === 0) {
      throw new Error(`Patient not found: ${patientId}`);
    }
    const patient = JSON.parse(patientBytes.toString('utf8'));

    const visitNumber = (patient.visitCount || 0) + 1;
    const visitId     = makeVisitId(patientId, visitNumber);

    const existing = await getState(ctx, visitKey(visitId));
    if (existing) throw new Error(`Visit already exists: ${visitId}`);

    if (!visitCID) throw new Error('visitCID is required — backend must pin initial visit JSON to IPFS first');

    const visit = {
      visitId,
      patientId,
      visitNumber,
      status:         VISIT_STATUS.OPEN,

      // Staff assignments (needed for routing logic in chaincode)
      assignedDoctor: '',
      assignedNurse:  '',

      // IPFS reference — all clinical content lives here
      visitCID,
      cidHistory: [
        {
          cid:       visitCID,
          updatedBy: userId,
          updatedAt: now(),
          reason:    'VISIT_OPENED',
        },
      ],

      // Claims (stay on-chain for auditing — small fields)
      claimId:          '',
      claimAmount:      0,
      claimSubmittedBy: '',
      auditedBy:        '',
      processedBy:      '',
      claimStatus:      '',
      claimReason:      '',

      createdAt: now(),
      updatedAt: now(),
    };

    await putState(ctx, visitKey(visitId), visit);

    // Update patient record
    patient.visitIds.push(visitId);
    patient.visitCount = visitNumber;
    patient.updatedAt  = now();
    await ctx.stub.putState(patientKey(patientId), Buffer.from(JSON.stringify(patient)));

    return JSON.stringify(visit);
  }

  // ── UpdateVisitCID ────────────────────────────────────────────────────────
  // Central function called by ALL backends after modifying visit data in IPFS.
  // Backend flow:
  //   1. Get current visitCID from chain
  //   2. Fetch visit JSON from IPFS
  //   3. Modify the JSON (add diagnosis, vitals, prescription, etc.)
  //   4. Pin updated JSON to IPFS → newCID
  //   5. Call UpdateVisitCID(visitId, newCID, reason)
  //
  // Role check: any active clinical staff role
  async UpdateVisitCID(ctx, visitId, newCID, reason) {
    const { role, userId } = getCallerIdentity(ctx);

    // All clinical and lab staff can update visit CID
    const allowed = [
      'doctor', 'nurse', 'pharmacist', 'medrecordofficer', 'admin',
      'labreceptionist', 'labtechnician', 'labsupervisor', 'radiologist', 'labadmin',
      'billingofficer', 'claimsauditor', 'insuranceofficer',
    ];
    if (!allowed.includes(role)) {
      throw new Error(`Role '${role}' cannot update visit CID`);
    }

    if (!newCID) throw new Error('newCID is required');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    visit.cidHistory.push({
      cid:       newCID,
      updatedBy: userId,
      updatedAt: now(),
      reason:    reason || '',
    });
    visit.visitCID = newCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── GetVisitCID ───────────────────────────────────────────────────────────
  // Returns current visitCID so backend can fetch JSON from IPFS.
  async GetVisitCID(ctx, visitId) {
    const { role, patientIdAttr } = getCallerIdentity(ctx);
    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    // Access check
    await assertReadAccess(ctx, visit.patientId, 'visits');
    return JSON.stringify({ visitId, visitCID: visit.visitCID });
  }

  // ── AssignDoctor ──────────────────────────────────────────────────────────
  async AssignDoctor(ctx, visitId, doctorId, visitCID) {
    const { userId } = requireRole(ctx, 'receptionist', 'admin');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    if (visit.status === VISIT_STATUS.DISCHARGED) {
      throw new Error('Cannot modify a discharged visit');
    }

    visit.assignedDoctor = doctorId;
    visit.status         = VISIT_STATUS.WITH_DOCTOR;

    // Update CID if backend passed updated visit JSON (with forwardingLog entry)
    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'DOCTOR_ASSIGNED' });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── AssignNurse ───────────────────────────────────────────────────────────
  async AssignNurse(ctx, visitId, nurseId, visitCID) {
    const { userId, role } = requireRole(ctx, 'receptionist', 'doctor', 'admin');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    if (visit.status === VISIT_STATUS.DISCHARGED) {
      throw new Error('Cannot modify a discharged visit');
    }

    visit.assignedNurse = nurseId;

    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'NURSE_ASSIGNED' });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── FinalizeVisit ─────────────────────────────────────────────────────────
  // Doctor closes the clinical portion.
  // visitCID must include finalDiagnosis in the IPFS JSON.
  async FinalizeVisit(ctx, visitId, visitCID) {
    const { userId } = requireRole(ctx, 'doctor');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (!ACTIVE_STATUSES.includes(visit.status)) {
      throw new Error(`Cannot finalize visit in status '${visit.status}'`);
    }
    if (!visitCID) throw new Error('visitCID is required — must include finalDiagnosis in IPFS JSON');

    visit.status      = VISIT_STATUS.VISIT_FINALIZED;
    visit.finalizedBy = userId;
    visit.finalizedAt = now();
    visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'VISIT_FINALIZED' });
    visit.visitCID = visitCID;

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── FinalizeRecord ────────────────────────────────────────────────────────
  // Medical records officer finalizes the official record.
  async FinalizeRecord(ctx, visitId, visitCID) {
    const { userId } = requireRole(ctx, 'medrecordofficer');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (visit.status !== VISIT_STATUS.VISIT_FINALIZED) {
      throw new Error(`Visit must be VISIT_FINALIZED. Current: '${visit.status}'`);
    }

    visit.status            = VISIT_STATUS.RECORD_FINALIZED;
    visit.recordFinalizedBy = userId;

    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'RECORD_FINALIZED' });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── DischargePatient ──────────────────────────────────────────────────────
  async DischargePatient(ctx, visitId, visitCID) {
    const { userId } = requireRole(ctx, 'admin');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    const allowed = [
      VISIT_STATUS.CLAIM_APPROVED,
      VISIT_STATUS.CLAIM_REJECTED,
      VISIT_STATUS.RECORD_FINALIZED,
    ];
    if (!allowed.includes(visit.status)) {
      throw new Error(`Cannot discharge from status '${visit.status}'`);
    }

    visit.status       = VISIT_STATUS.DISCHARGED;
    visit.dischargedBy = userId;

    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'PATIENT_DISCHARGED' });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── GetVisit ──────────────────────────────────────────────────────────────
  // Returns on-chain visit record (visitCID + status + assignments).
  // Backend uses visitCID to fetch full clinical content from IPFS.
  async GetVisit(ctx, visitId) {
    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    await assertReadAccess(ctx, visit.patientId, 'visits');
    return JSON.stringify(visit);
  }

  // ── GetVisitHistory ───────────────────────────────────────────────────────
  // Full blockchain tx history of the on-chain visit record.
  async GetVisitHistory(ctx, visitId) {
    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    await assertReadAccess(ctx, visit.patientId, 'visits');
    const history = await getHistory(ctx, visitKey(visitId));
    return JSON.stringify(history);
  }

  // ── GetCIDHistory ─────────────────────────────────────────────────────────
  // Returns the cidHistory array — every IPFS CID this visit has ever had.
  async GetCIDHistory(ctx, visitId) {
    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    await assertReadAccess(ctx, visit.patientId, 'visits');
    return JSON.stringify(visit.cidHistory);
  }

  // ── ListAllVisits ─────────────────────────────────────────────────────────
  // Returns all visit records. Used by backends to list and filter by role.
  async ListAllVisits(ctx) {
    getCallerIdentity(ctx);
    const iterator = await ctx.stub.getStateByRange(`${VISIT_PREFIX}:`, `${VISIT_PREFIX};`);
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

  // ── GetPatientVisitsFull ──────────────────────────────────────────────────
  // Returns all on-chain visit records for a patient.
  // (Caller fetches IPFS content separately using each visitCID.)
  async GetPatientVisitsFull(ctx, patientId) {
    await assertReadAccess(ctx, patientId, 'visits');
    const patientBytes = await ctx.stub.getState(patientKey(patientId));
    if (!patientBytes || patientBytes.length === 0) {
      throw new Error(`Patient not found: ${patientId}`);
    }
    const patient = JSON.parse(patientBytes.toString('utf8'));
    const visits = [];
    for (const vid of patient.visitIds) {
      const v = await getState(ctx, visitKey(vid));
      if (v) visits.push(v);
    }
    return JSON.stringify(visits);
  }
}

module.exports = { VisitContract, visitKey, VISIT_STATUS, ACTIVE_STATUSES };
