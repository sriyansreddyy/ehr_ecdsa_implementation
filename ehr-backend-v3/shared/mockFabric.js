'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'mock-fabric-state.json');
const USERS_FILE = path.join(__dirname, 'users.json');

function defaultState() {
  return {
    patients: {},
    visits: {},
    ehrHistory: {},
    ipfs: {},
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    let mutated = false;
    const defaultDoctor = getDefaultDoctor();

    for (const visit of Object.values(state.visits || {})) {
      if (visit && visit.status === 'OPEN' && !visit.assignedDoctor) {
        visit.assignedDoctor = defaultDoctor;
        visit.forwardingLog = Array.isArray(visit.forwardingLog) ? visit.forwardingLog : [];
        visit.forwardingLog.push({
          action: 'AUTO_FORWARD_TO_DOCTOR',
          from: 'receptionist',
          fromRole: 'receptionist',
          to: defaultDoctor,
          toRole: 'doctor',
          notes: 'Mock auto-forward for dashboard visibility',
          timestamp: now(),
        });
        mutated = true;
      }
    }

    if (mutated) saveState(state);
    return state;
  } catch (_) {
    return defaultState();
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function now() {
  return new Date().toISOString();
}

function makeCid(prefix, payload) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex').slice(0, 16);
  return `mock-${prefix}-${hash}`;
}

function getDefaultDoctor() {
  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (users.doctor?.role === 'doctor') return 'doctor';
    const doctorEntry = Object.entries(users).find(([, entry]) => entry?.role === 'doctor');
    return doctorEntry ? doctorEntry[0] : 'doctor';
  } catch (_) {
    return 'doctor';
  }
}

function toBytes(value) {
  return Buffer.from(JSON.stringify(value ?? null));
}

function rememberIpfs(state, cid, value) {
  state.ipfs[cid] = clone(value);
  return cid;
}

function fetchByCID(cid) {
  const state = loadState();
  return clone(state.ipfs[cid] ?? null);
}

function pinJSON(json, filename) {
  const state = loadState();
  const cid = makeCid('json', { filename: filename || '', json });
  rememberIpfs(state, cid, json);
  saveState(state);
  return cid;
}

function initEHR(patientId, demographics) {
  const state = loadState();
  const ehr = {
    patientId,
    demographics: clone(demographics),
    medicalHistory: [],
    createdAt: now(),
    updatedAt: now(),
  };
  const cid = makeCid('ehr', { patientId, demographics: ehr.demographics });
  rememberIpfs(state, cid, ehr);
  const patient = state.patients[patientId] || {
    patientId,
    visitCount: 0,
    visitIds: [],
    history: [],
  };
  patient.ehrCID = cid;
  patient.updatedAt = now();
  patient.history = Array.isArray(patient.history) ? patient.history : [];
  patient.history.push({ action: 'INIT_EHR', ehrCID: cid, timestamp: now() });
  state.patients[patientId] = patient;
  state.ehrHistory[patientId] = state.ehrHistory[patientId] || [];
  state.ehrHistory[patientId].push({ cid, reason: 'INITIAL_EHR', updatedBy: patientId, updatedAt: now() });
  saveState(state);
  return { cid, ehr: clone(ehr) };
}

function initVisit(visitId, patientId, chiefComplaint, openedBy) {
  const state = loadState();
  const visit = {
    visitId,
    patientId,
    chiefComplaint: chiefComplaint || '',
    openedBy: openedBy || 'mock-receptionist',
    status: 'OPEN',
    assignedDoctor: '',
    assignedNurse: '',
    diagnosis: '',
    prescription: null,
    vitals: null,
    careNotes: [],
    labRequests: [],
    claims: [],
    forwardingLog: [],
    cidHistory: [],
    history: [{ action: 'OPEN_VISIT', timestamp: now() }],
    createdAt: now(),
    updatedAt: now(),
  };
  const cid = makeCid('visit', { visitId, patientId, chiefComplaint, openedBy });
  rememberIpfs(state, cid, visit);
  state.visits[visitId] = { ...visit, visitCID: cid };
  const patient = state.patients[patientId] || {
    patientId,
    visitCount: 0,
    visitIds: [],
    history: [],
  };
  patient.visitCount = (patient.visitCount || 0) + 1;
  patient.visitIds = Array.from(new Set([...(patient.visitIds || []), visitId]));
  patient.updatedAt = now();
  patient.history = Array.isArray(patient.history) ? patient.history : [];
  patient.history.push({ action: 'OPEN_VISIT', visitId, visitCID: cid, timestamp: now() });
  state.patients[patientId] = patient;
  saveState(state);
  return { cid, visit: clone({ ...visit, visitCID: cid }) };
}

function uploadFile(buffer, filename) {
  const state = loadState();
  const cid = makeCid('file', { filename: filename || '', size: buffer?.length || 0 });
  rememberIpfs(state, cid, { filename: filename || 'file', size: buffer?.length || 0 });
  saveState(state);
  return { cid };
}

function getPatient(state, patientId) {
  return state.patients[patientId] || null;
}

function getVisit(state, visitId) {
  return state.visits[visitId] || null;
}

function updateVisit(state, visitId, mutator) {
  const visit = getVisit(state, visitId);
  if (!visit) return null;
  mutator(visit);
  visit.updatedAt = now();
  state.visits[visitId] = visit;
  return visit;
}

function pushVisitCid(visit, cid, reason, updatedBy) {
  if (!cid) return;
  visit.visitCID = cid;
  visit.cidHistory = Array.isArray(visit.cidHistory) ? visit.cidHistory : [];
  visit.cidHistory.push({ cid, reason, updatedBy, updatedAt: now() });
}

function getLabRequest(visit, labRequestId) {
  visit.labRequests = Array.isArray(visit.labRequests) ? visit.labRequests : [];
  return visit.labRequests.find(r => r.labRequestId === labRequestId) || null;
}

function evaluateTransaction(name, ...args) {
  const state = loadState();
  switch (name) {
    case 'PatientContract:ListAllPatients':
      return toBytes(Object.values(state.patients).map(clone));
    case 'PatientContract:GetPatient':
      return toBytes(clone(getPatient(state, args[0])));
    case 'PatientContract:PatientExists':
      return toBytes(Boolean(getPatient(state, args[0])));
    case 'PatientContract:GetPatientVisits': {
      const patient = getPatient(state, args[0]);
      return toBytes(clone(patient ? patient.visitIds || [] : []));
    }
    case 'VisitContract:GetPatientVisitsFull': {
      const patient = getPatient(state, args[0]);
      const visits = patient ? (patient.visitIds || []).map(id => clone(getVisit(state, id))).filter(Boolean) : [];
      return toBytes(visits);
    }
    case 'PatientContract:GetPatientHistory': {
      const patient = getPatient(state, args[0]);
      return toBytes(clone(patient ? patient.history || [] : []));
    }
    case 'EhrContract:GetCurrentCID': {
      const patient = getPatient(state, args[0]);
      return toBytes(patient ? { currentCID: patient.ehrCID || null } : { currentCID: null });
    }
    case 'EhrContract:GetEHRCIDHistory':
      return toBytes(clone(state.ehrHistory[args[0]] || []));
    case 'VisitContract:ListAllVisits':
      return toBytes(Object.values(state.visits).map(clone));
    case 'VisitContract:GetVisit':
      return toBytes(clone(getVisit(state, args[0])));
    case 'VisitContract:GetVisitHistory': {
      const visit = getVisit(state, args[0]);
      return toBytes(clone(visit ? visit.history || [] : []));
    }
    case 'VisitContract:GetCIDHistory': {
      const visit = getVisit(state, args[0]);
      return toBytes(clone(visit ? visit.cidHistory || [] : []));
    }
    default:
      return toBytes({ tx: name, args: clone(args) });
  }
}

function submitTransaction(name, ...args) {
  const state = loadState();
  let result = null;

  switch (name) {
    case 'PatientContract:RegisterPatient': {
      const [patientId, nameValue, age, gender, bloodGroup, contact, address, ehrCID] = args;
      const patient = {
        patientId,
        name: nameValue,
        age: Number(age),
        gender,
        bloodGroup,
        contact,
        address,
        ehrCID: ehrCID || null,
        visitCount: 0,
        visitIds: [],
        history: [{ action: 'REGISTER_PATIENT', timestamp: now(), ehrCID: ehrCID || null }],
        createdAt: now(),
        updatedAt: now(),
      };
      state.patients[patientId] = patient;
      if (ehrCID) {
        state.ehrHistory[patientId] = state.ehrHistory[patientId] || [];
        state.ehrHistory[patientId].push({ cid: ehrCID, reason: 'REGISTER_PATIENT', updatedBy: 'receptionist', updatedAt: now() });
      }
      result = patient;
      break;
    }
    case 'EhrContract:InitEHR': {
      const [patientId, ehrCID] = args;
      const patient = getPatient(state, patientId) || {
        patientId,
        visitCount: 0,
        visitIds: [],
        history: [],
        createdAt: now(),
      };
      patient.ehrCID = ehrCID || null;
      patient.updatedAt = now();
      patient.history = Array.isArray(patient.history) ? patient.history : [];
      patient.history.push({ action: 'INIT_EHR', ehrCID: ehrCID || null, timestamp: now() });
      state.patients[patientId] = patient;
      state.ehrHistory[patientId] = state.ehrHistory[patientId] || [];
      state.ehrHistory[patientId].push({ cid: ehrCID, reason: 'INIT_EHR', updatedBy: 'receptionist', updatedAt: now() });
      result = { patientId, ehrCID: ehrCID || null };
      break;
    }
    case 'PatientContract:UpdatePatientInfo': {
      const [patientId, contact, address] = args;
      const patient = getPatient(state, patientId);
      if (patient) {
        if (contact) patient.contact = contact;
        if (address) patient.address = address;
        patient.updatedAt = now();
        patient.history = Array.isArray(patient.history) ? patient.history : [];
        patient.history.push({ action: 'UPDATE_PATIENT_INFO', timestamp: now(), contact: contact || '', address: address || '' });
        state.patients[patientId] = patient;
      }
      result = patient;
      break;
    }
    case 'VisitContract:OpenVisit': {
      const [patientId, chiefComplaint, visitCID] = args;
      const patient = getPatient(state, patientId) || {
        patientId,
        visitCount: 0,
        visitIds: [],
        history: [],
        createdAt: now(),
      };
      const visitNumber = (patient.visitCount || 0) + 1;
      const visitId = `${patientId}-V${visitNumber}`;
      const assignedDoctor = getDefaultDoctor();
      const visit = {
        visitId,
        patientId,
        chiefComplaint: chiefComplaint || '',
        openedBy: 'receptionist',
        status: 'OPEN',
        assignedDoctor,
        assignedNurse: '',
        diagnosis: '',
        prescription: null,
        vitals: null,
        careNotes: [],
        labRequests: [],
        claims: [],
        forwardingLog: [{ action: 'VISIT_OPENED', from: 'receptionist', fromRole: 'receptionist', to: assignedDoctor, toRole: 'doctor', notes: '', timestamp: now() }],
        cidHistory: visitCID ? [{ cid: visitCID, reason: 'OPEN_VISIT', updatedBy: 'receptionist', updatedAt: now() }] : [],
        history: [{ action: 'OPEN_VISIT', timestamp: now(), visitCID: visitCID || null }],
        createdAt: now(),
        updatedAt: now(),
        visitCID: visitCID || null,
      };
      state.visits[visitId] = visit;
      patient.visitCount = visitNumber;
      patient.visitIds = Array.from(new Set([...(patient.visitIds || []), visitId]));
      patient.updatedAt = now();
      patient.history = Array.isArray(patient.history) ? patient.history : [];
      patient.history.push({ action: 'OPEN_VISIT', visitId, visitCID: visitCID || null, timestamp: now() });
      state.patients[patientId] = patient;
      if (visitCID) rememberIpfs(state, visitCID, visit);
      result = visit;
      break;
    }
    case 'VisitContract:AssignDoctor': {
      const [visitId, doctorId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.assignedDoctor = doctorId;
        current.status = 'WITH_DOCTOR';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'DOCTOR_ASSIGNED', from: 'receptionist', fromRole: 'receptionist', to: doctorId, toRole: 'doctor', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'ASSIGN_DOCTOR', 'receptionist');
      });
      result = visit;
      break;
    }
    case 'VisitContract:AssignNurse': {
      const [visitId, nurseId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.assignedNurse = nurseId;
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'NURSE_ASSIGNED', from: 'receptionist', fromRole: 'receptionist', to: nurseId, toRole: 'nurse', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'ASSIGN_NURSE', 'receptionist');
      });
      result = visit;
      break;
    }
    case 'VisitContract:DischargePatient': {
      const [visitId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.status = 'DISCHARGED';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'PATIENT_DISCHARGED', from: 'admin', fromRole: 'admin', to: '', toRole: '', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'DISCHARGE', 'admin');
      });
      result = visit;
      break;
    }
    case 'VisitContract:FinalizeVisit': {
      const [visitId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.status = 'VISIT_FINALIZED';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'VISIT_FINALIZED', from: 'doctor', fromRole: 'doctor', to: '', toRole: '', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'FINALIZE_VISIT', 'doctor');
      });
      result = visit;
      break;
    }
    case 'VisitContract:FinalizeRecord': {
      const [visitId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.status = 'RECORD_FINALIZED';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'RECORD_FINALIZED', from: 'medrecordofficer', fromRole: 'medrecordofficer', to: '', toRole: '', notes: 'Official record finalised. Ready for insurance claim.', timestamp: now() });
        pushVisitCid(current, newCID, 'RECORD_FINALIZED', 'medrecordofficer');
      });
      result = visit;
      break;
    }
    case 'ClinicalContract:RecordVitals': {
      const [visitId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.vitals = { updatedAt: now(), updatedBy: 'nurse' };
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'VITALS_RECORDED', from: 'nurse', fromRole: 'nurse', to: '', toRole: '', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'RECORD_VITALS', 'nurse');
      });
      result = visit;
      break;
    }
    case 'ClinicalContract:AddCareNote': {
      const [visitId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.careNotes = Array.isArray(current.careNotes) ? current.careNotes : [];
        current.careNotes.push({ note: 'Care note recorded', recordedBy: 'nurse', recordedAt: now() });
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'CARE_NOTE_ADDED', from: 'nurse', fromRole: 'nurse', to: '', toRole: '', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'ADD_CARE_NOTE', 'nurse');
      });
      result = visit;
      break;
    }
    case 'ClinicalContract:DispenseMedication': {
      const [visitId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.prescription = current.prescription || { medicationDetails: {} };
        current.prescription.dispensed = true;
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'MEDICATION_DISPENSED', from: 'pharmacist', fromRole: 'pharmacist', to: '', toRole: '', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'DISPENSE_MEDICATION', 'pharmacist');
      });
      result = visit;
      break;
    }
    case 'LabContract:AcknowledgeLabRequest': {
      const [visitId, labRequestId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        const req = getLabRequest(current, labRequestId);
        if (req) {
          req.status = 'ACKNOWLEDGED';
          req.acknowledgedBy = 'labreceptionist';
          req.acknowledgedAt = now();
        }
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'LAB_REQUEST_ACKNOWLEDGED', from: 'labreceptionist', fromRole: 'labreceptionist', to: '', toRole: '', notes: '', timestamp: now(), labRequestId });
        pushVisitCid(current, newCID, 'LAB_ACKNOWLEDGED', 'labreceptionist');
      });
      result = visit;
      break;
    }
    case 'LabContract:SubmitLabResult': {
      const [visitId, labRequestId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        const req = getLabRequest(current, labRequestId);
        if (req) {
          req.status = 'COMPLETED';
          req.submittedBy = 'labtechnician';
          req.submittedAt = now();
        }
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'LAB_RESULT_SUBMITTED', from: 'labtechnician', fromRole: 'labtechnician', to: '', toRole: '', notes: '', timestamp: now(), labRequestId });
        pushVisitCid(current, newCID, 'LAB_RESULT_SUBMITTED', 'labtechnician');
      });
      result = visit;
      break;
    }
    case 'LabContract:ApproveLabResult': {
      const [visitId, labRequestId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        const req = getLabRequest(current, labRequestId);
        if (req) {
          req.status = 'APPROVED';
          req.approvedBy = 'labsupervisor';
          req.approvedAt = now();
        }
        current.status = 'WITH_DOCTOR';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'LAB_RESULT_APPROVED', from: 'labsupervisor', fromRole: 'labsupervisor', to: current.assignedDoctor || '', toRole: 'doctor', notes: '', timestamp: now(), labRequestId });
        pushVisitCid(current, newCID, 'LAB_RESULT_APPROVED', 'labsupervisor');
      });
      result = visit;
      break;
    }
    case 'ClaimsContract:SubmitClaim': {
      const [visitId, claimId, claimAmount, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.claimId = claimId;
        current.claimAmount = Number(claimAmount);
        current.claimSubmittedBy = 'billingofficer';
        current.claimStatus = 'SUBMITTED';
        current.status = 'CLAIM_SUBMITTED';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'CLAIM_SUBMITTED', from: 'billingofficer', fromRole: 'billingofficer', to: '', toRole: '', notes: `Claim ${claimId} submitted`, timestamp: now() });
        pushVisitCid(current, newCID, 'CLAIM_SUBMITTED', 'billingofficer');
      });
      result = visit;
      break;
    }
    case 'ClaimsContract:AuditClaim': {
      const [visitId, auditNotes, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.auditedBy = 'claimsauditor';
        current.auditNotes = auditNotes;
        current.claimStatus = 'UNDER_AUDIT';
        current.status = 'CLAIM_UNDER_AUDIT';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'CLAIM_AUDITED', from: 'claimsauditor', fromRole: 'claimsauditor', to: '', toRole: '', notes: auditNotes, timestamp: now() });
        pushVisitCid(current, newCID, 'CLAIM_AUDITED', 'claimsauditor');
      });
      result = visit;
      break;
    }
    case 'ClaimsContract:ProcessClaim': {
      const [visitId, decision, reason, newCID] = args;
      const dec = String(decision || '').toUpperCase();
      const visit = updateVisit(state, visitId, current => {
        current.processedBy = 'insuranceofficer';
        current.claimReason = reason || '';
        current.claimStatus = dec;
        current.status = dec === 'APPROVED' ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: `CLAIM_${dec}`, from: 'insuranceofficer', fromRole: 'insuranceofficer', to: '', toRole: '', notes: reason || `Claim ${dec.toLowerCase()}`, timestamp: now() });
        pushVisitCid(current, newCID, `CLAIM_${dec}`, 'insuranceofficer');
      });
      result = visit;
      break;
    }
    case 'EhrContract:UpdateEHRCID': {
      const [patientId, newCID, section] = args;
      const patient = getPatient(state, patientId) || {
        patientId,
        visitCount: 0,
        visitIds: [],
        history: [],
        createdAt: now(),
      };
      patient.ehrCID = newCID || patient.ehrCID || null;
      patient.updatedAt = now();
      patient.history = Array.isArray(patient.history) ? patient.history : [];
      patient.history.push({ action: 'UPDATE_EHR_CID', section: section || '', ehrCID: patient.ehrCID, timestamp: now() });
      state.patients[patientId] = patient;
      state.ehrHistory[patientId] = state.ehrHistory[patientId] || [];
      state.ehrHistory[patientId].push({ cid: patient.ehrCID, reason: section || 'UPDATE_EHR', updatedBy: 'staff', updatedAt: now() });
      result = { patientId, currentCID: patient.ehrCID || null, section: section || '' };
      break;
    }
    case 'AccessContract:RequestAccess': {
      const [patientId, sections, reason] = args;
      result = {
        requestId: makeCid('access', { patientId, sections, reason }),
        patientId,
        sections,
        reason: reason || '',
        status: 'REQUESTED',
        requestedAt: now(),
      };
      break;
    }
    case 'ForwardContract:ForwardToNurse': {
      const [visitId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.status = 'WITH_NURSE';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'FORWARD_TO_NURSE', from: 'doctor', fromRole: 'doctor', to: current.assignedNurse || '', toRole: 'nurse', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'FORWARD_TO_NURSE', 'doctor');
      });
      result = visit;
      break;
    }
    case 'ForwardContract:ForwardToLab': {
      const [visitId, labRequestId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.status = 'WITH_LAB';
        current.labRequests = Array.isArray(current.labRequests) ? current.labRequests : [];
        current.labRequests.push({ labRequestId, status: 'REQUESTED', requestedAt: now() });
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'FORWARD_TO_LAB', from: 'doctor', fromRole: 'doctor', to: '', toRole: 'lab', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'FORWARD_TO_LAB', 'doctor');
      });
      result = visit;
      break;
    }
    case 'ForwardContract:LabResultsBackToDoctor': {
      const [visitId, newCID] = args;
      const visit = updateVisit(state, visitId, current => {
        current.status = 'WITH_DOCTOR';
        current.forwardingLog = Array.isArray(current.forwardingLog) ? current.forwardingLog : [];
        current.forwardingLog.push({ action: 'LAB_RESULTS_BACK_TO_DOCTOR', from: 'lab', fromRole: 'labadmin', to: current.assignedDoctor || '', toRole: 'doctor', notes: '', timestamp: now() });
        pushVisitCid(current, newCID, 'LAB_RESULTS_BACK_TO_DOCTOR', 'labadmin');
      });
      result = visit;
      break;
    }
    default: {
      result = { tx: name, args: clone(args), ok: true };
      break;
    }
  }

  saveState(state);
  return toBytes(clone(result));
}

const mockContract = {
  evaluateTransaction,
  submitTransaction,
};

const mockNetwork = {
  getContract() {
    return mockContract;
  },
};

function init() {
  if (!fs.existsSync(STATE_FILE)) {
    saveState(defaultState());
  }
}

function getContract() {
  return mockContract;
}

function getNetwork() {
  return mockNetwork;
}

function reconnect() {
  return undefined;
}

function close() {
  return undefined;
}

module.exports = {
  init,
  getContract,
  getNetwork,
  reconnect,
  close,
  fetchByCID,
  pinJSON,
  initEHR,
  initVisit,
  uploadFile,
};
