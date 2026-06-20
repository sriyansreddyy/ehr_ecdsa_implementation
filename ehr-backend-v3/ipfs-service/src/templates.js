'use strict';

/**
 * templates.js — Default JSON structures for EHR and Visit documents.
 *
 * When a patient is registered, an empty EHR template is pinned to IPFS.
 * When a visit is opened, an empty visit template is pinned to IPFS.
 * All subsequent updates fetch the current JSON, modify it, and repin.
 */

// ── EHR Template ─────────────────────────────────────────────────────────────
// Patient's persistent medical history — lives across all visits.
// Updated by doctors and nurses, controlled by patient access grants.

function emptyEHR(patientId, demographics) {
  return {
    _type:      'EHR',
    _version:   1,
    patientId,
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    updatedBy:  'system',

    // Demographics — mirrors what's on-chain, kept here for convenience
    demographics: {
      name:       demographics.name       || '',
      age:        demographics.age        || '',
      gender:     demographics.gender     || '',
      bloodGroup: demographics.bloodGroup || '',
      contact:    demographics.contact    || '',
      address:    demographics.address    || '',
      dob:        demographics.dob        || '',
    },

    // ── Clinical sections — updated by doctor/nurse ───────────────────────
    allergies: [],
    // each entry: { substance, reaction, severity, addedBy, addedAt }

    chronicConditions: [],
    // each entry: { condition, diagnosedAt, status, notes, addedBy, addedAt }

    ongoingMedications: [],
    // each entry: { name, dose, frequency, since, prescribedBy, addedAt }

    surgicalHistory: [],
    // each entry: { procedure, date, hospital, surgeon, notes, addedBy, addedAt }

    familyHistory: [],
    // each entry: { relation, condition, notes, addedBy, addedAt }

    immunizations: [],
    // each entry: { vaccine, date, dose, administeredBy, addedAt }

    emergencyContact: {
      name:     '',
      relation: '',
      phone:    '',
      address:  '',
    },

    medicalHistory: [],
    // each entry: { text, sourceType, sourceCid, addedBy, addedAt }

    // Lifestyle (optional, filled by doctor during consultation)
    lifestyle: {
      smoking:  '',   // 'never' | 'former' | 'current'
      alcohol:  '',   // 'none' | 'occasional' | 'regular'
      exercise: '',   // 'sedentary' | 'light' | 'moderate' | 'active'
      diet:     '',
    },
  };
}

// ── Visit Template ────────────────────────────────────────────────────────────
// Per-visit clinical data — created when receptionist opens a visit.
// Status transitions are tracked on-chain; content lives here in IPFS.

function emptyVisit(visitId, patientId, chiefComplaint, openedBy) {
  return {
    _type:    'VISIT',
    _version: 1,
    visitId,
    patientId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // Chief complaint (set at open, stored here in IPFS)
    chiefComplaint: chiefComplaint || '',

    // Forwarding log — append-only audit trail of who handled the visit
    forwardingLog: [
      {
        action:      'VISIT_OPENED',
        from:        openedBy,
        fromRole:    'receptionist',
        to:          '',
        toRole:      '',
        notes:       chiefComplaint || '',
        timestamp:   new Date().toISOString(),
      },
    ],

    // ── Doctor section ────────────────────────────────────────────────────
    assignedDoctor:  '',
    diagnosisNotes:  '',   // working notes, updated multiple times
    finalDiagnosis:  '',   // set when doctor finalizes visit
    finalizedBy:     '',
    finalizedAt:     '',

    // Prescriptions — array of versions (each UpdatePrescription appends)
    prescriptions: [],
    // each entry: {
    //   version, medications: [], instructions, prescribedBy, prescribedAt
    // }

    // ── Nurse section ─────────────────────────────────────────────────────
    assignedNurse: '',

    vitals: null,
    // { bloodPressure, temperature, pulse, weight, height, oxygenSat,
    //   recordedBy, recordedAt }

    careNotes: [],
    // each entry: { note, recordedBy, recordedAt }

    // ── Lab section ───────────────────────────────────────────────────────
    labRequests: [],
    // each entry: {
    //   labRequestId, tests: [], instructions, requestedBy, requestedAt,
    //   status: REQUESTED|ACKNOWLEDGED|COMPLETED|APPROVED,
    //   acknowledgedBy, acknowledgedAt,
    //   results: {}, resultsHash, submittedBy, submittedAt,
    //   approvedBy, approvedAt
    // }

    // ── Pharmacy section ──────────────────────────────────────────────────
    medicationDetails:     '',
    medicationDispensedBy: '',
    medicationDispensedAt: '',

    // ── Medical records section ───────────────────────────────────────────
    recordFinalizedBy: '',
    recordFinalizedAt: '',

    // ── Discharge section ─────────────────────────────────────────────────
    dischargeNotes: '',
    dischargedBy:   '',
    dischargedAt:   '',
  };
}

module.exports = { emptyEHR, emptyVisit };
