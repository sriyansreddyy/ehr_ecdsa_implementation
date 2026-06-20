# EHR System — Complete Functionality Reference

## System Overview

A blockchain-based Electronic Health Record system built on Hyperledger Fabric 2.5.
Three organizations share an immutable, tamper-proof ledger on a single channel (`ehrchannel`).
Every action is role-restricted, cryptographically signed, and permanently recorded.

---

## Organizations & Peers

| Org | MSP ID | Peers | Roles |
|-----|--------|-------|-------|
| Hospital | HospitalMSP | peer0 :7051, peer1 :9051, peer2 :10051 | receptionist, admin, doctor, nurse, pharmacist, medrecordofficer |
| Diagnostics | DiagnosticsMSP | peer0.diagnostic :8051 | labreceptionist, labtechnician, radiologist, labsupervisor, labadmin |
| Provider | ProviderMSP | peer0.provider :11051 | billingofficer, claimsauditor, insuranceofficer, provideradmin |

---

## Data Model

### Patient Record (`PATIENT:<patientId>`)
Permanent master record. Never deleted. Linked to visits.

| Field | Type | Set by |
|-------|------|--------|
| patientId | string | registration |
| name, age, gender, bloodGroup | string/int | registration |
| contact, address | string | registration / updatable |
| visitIds | string[] | auto-appended on each OpenVisit |
| visitCount | int | auto-incremented |
| registeredBy | string | registration |
| createdAt, updatedAt | ISO timestamp | system |

---

### Visit Record (`VISIT:<visitId>`)
One record per visit. visitId format: `PAT-001-V1`, `PAT-001-V2`, ...
A patient can have unlimited visits.

| Field | Type | Set by |
|-------|------|--------|
| visitId, patientId, visitNumber | string/int | OpenVisit |
| status | enum (11 values) | each step |
| chiefComplaint | string | OpenVisit |
| assignedDoctor, assignedNurse | string | AssignDoctor / AssignNurse |
| forwardingLog | object[] | every forward/assign action |
| diagnosisNotes | string | UpdateDiagnosisNotes (overwrite) |
| finalDiagnosis | string | FinalizeVisit |
| vitals | object | RecordVitals (overwrite) |
| prescriptions | object[] | UpdatePrescription (append-versioned) |
| labRequests | object[] | ForwardToLab (append, multiple) |
| labRequestCount | int | auto-incremented |
| careNotes | object[] | AddCareNote (append) |
| medicationDetails, medicationDispensedBy | string | DispenseMedication |
| recordFinalizedBy | string | FinalizeRecord |
| dischargeNotes, dischargedBy | string | DischargePatient |
| finalizedBy, finalizedAt | string | FinalizeVisit |
| claimId, claimAmount | string/float | SubmitClaim |
| claimStatus | string | SubmitClaim → AuditClaim → ProcessClaim |
| claimSubmittedBy, auditedBy, processedBy | string | each claim step |
| auditNotes, claimReason | string | AuditClaim / ProcessClaim |
| createdAt, updatedAt | ISO timestamp | system |

---

### Lab Request (embedded in visit.labRequests[])
ID format: `PAT-001-V1-L1`, `PAT-001-V1-L2`, ...
Multiple lab requests per visit supported.

| Field | Type | Set by |
|-------|------|--------|
| labRequestId | string | ForwardToLab |
| tests | string[] | ForwardToLab |
| instructions | string | ForwardToLab |
| requestedBy, requestedAt | string | ForwardToLab |
| status | REQUESTED → ACKNOWLEDGED → COMPLETED → APPROVED | each step |
| acknowledgedBy, acknowledgedAt | string | AcknowledgeLabRequest |
| submittedBy, submittedAt | string | SubmitLabResult |
| results | object (key-value) | SubmitLabResult |
| resultsHash | string | SubmitLabResult |
| approvedBy, approvedAt | string | ApproveLabResult |

---

### Prescription (embedded in visit.prescriptions[], versioned)

| Field | Set by |
|-------|--------|
| version (1, 2, 3...) | auto-incremented |
| medications (string[]) | UpdatePrescription |
| instructions | UpdatePrescription |
| prescribedBy, prescribedAt | UpdatePrescription |

---

### Visit Status Lifecycle

```
OPEN
 └─ WITH_DOCTOR          (AssignDoctor)
     ├─ WITH_NURSE        (ForwardToNurse)
     │   └─ WITH_DOCTOR   (ForwardToDoctor — can cycle multiple times)
     ├─ WITH_LAB          (ForwardToLab — can be called multiple times)
     │   └─ WITH_DOCTOR   (ApproveLabResult — auto-returns)
     └─ VISIT_FINALIZED   (FinalizeVisit)
         └─ RECORD_FINALIZED  (FinalizeRecord — after medication dispensed)
             └─ CLAIM_SUBMITTED  (SubmitClaim)
                 └─ CLAIM_UNDER_AUDIT  (AuditClaim)
                     ├─ CLAIM_APPROVED   (ProcessClaim APPROVED)
                     └─ CLAIM_REJECTED   (ProcessClaim REJECTED)
                         └─ DISCHARGED   (DischargePatient)
```

Note: `DischargePatient` also allowed from `RECORD_FINALIZED` (no claim needed).

---

## Chaincode Functions (32 total across 7 contracts)

### PatientContract (6 functions)

| Function | Args | Role | What it does |
|----------|------|------|-------------|
| `RegisterPatient` | patientId, name, age, gender, bloodGroup, contact, address | receptionist, admin | Creates patient master record. Fails if patientId exists. |
| `GetPatient` | patientId | any enrolled | Returns full patient object including visitIds list. |
| `PatientExists` | patientId | any enrolled | Returns `true` or `false`. |
| `GetPatientVisits` | patientId | any enrolled | Returns visitIds array only. |
| `GetPatientHistory` | patientId | any enrolled | Returns full blockchain history of patient master record — every tx with txId, timestamp, and snapshot. |
| `UpdatePatientInfo` | patientId, contact, address | receptionist, admin | Updates contact/address only. Clinical fields cannot be changed. |

---

### VisitContract (7 functions)

| Function | Args | Role | What it does |
|----------|------|------|-------------|
| `OpenVisit` | patientId, chiefComplaint | receptionist, admin | Creates new visit. Auto-generates visitId (PAT-001-V1, V2...). Updates patient visitIds. Status: OPEN. |
| `AssignDoctor` | visitId, doctorId | receptionist, admin | Sets assignedDoctor. Status: WITH_DOCTOR. Adds to forwardingLog. |
| `AssignNurse` | visitId, nurseId | receptionist, doctor, admin | Sets assignedNurse. Adds to forwardingLog. Status unchanged. |
| `FinalizeVisit` | visitId, finalDiagnosis | doctor | Closes clinical work. Requires non-empty finalDiagnosis. Status: VISIT_FINALIZED. Blocks all clinical updates after this. |
| `GetVisit` | visitId | any enrolled | Returns full visit object — all fields, forwardingLog, labRequests, prescriptions, careNotes. |
| `GetVisitHistory` | visitId | any enrolled | Full blockchain tx history for this visit — every state change with txId and timestamp. |
| `GetPatientVisitsFull` | patientId | any enrolled | Returns array of complete visit objects for all visits of a patient. |

---

### ForwardContract (4 functions)

| Function | Args | Role | What it does |
|----------|------|------|-------------|
| `ForwardToNurse` | visitId, instructions | doctor | Hands visit to nurse with instructions. Status: WITH_NURSE. Appends to forwardingLog. |
| `ForwardToDoctor` | visitId, notes | nurse | Returns visit to doctor with notes. Status: WITH_DOCTOR. Appends to forwardingLog. |
| `ForwardToLab` | visitId, testsJson, instructions | doctor | Creates new lab request (L1, L2...). Status: WITH_LAB. Appends to forwardingLog and labRequests. |
| `LabResultsBackToDoctor` | visitId, labRequestId | labsupervisor, labadmin, admin | Explicitly returns visit to doctor after results. Status: WITH_DOCTOR. Appends to forwardingLog. |

---

### ClinicalContract (5 functions)

| Function | Args | Role | What it does |
|----------|------|------|-------------|
| `UpdateDiagnosisNotes` | visitId, notes | doctor | Overwrites working diagnosis notes. Can be called multiple times. Blocked after VISIT_FINALIZED. |
| `RecordVitals` | visitId, vitalsJson | nurse | Overwrites vitals (BP, temp, pulse, weight, height, oxygenSat, etc). Adds recordedBy/recordedAt. |
| `AddCareNote` | visitId, note | nurse | Appends a timestamped care note to careNotes[]. Never overwrites — full history preserved. |
| `UpdatePrescription` | visitId, medicationsJson, instructions | doctor | Appends new prescription version to prescriptions[]. Version auto-increments (1, 2, 3...). |
| `GetCurrentPrescription` | visitId | doctor, nurse, pharmacist, admin, receptionist, medrecordofficer | Returns the latest prescription version only (highest version number). |

---

### LabContract (4 functions)

| Function | Args | Role | What it does |
|----------|------|------|-------------|
| `AcknowledgeLabRequest` | visitId, labRequestId | labreceptionist, labadmin | Acknowledges a REQUESTED lab request. Sets acknowledgedBy/At. Cannot be called twice on same request. |
| `SubmitLabResult` | visitId, labRequestId, resultsJson, resultsHash | labtechnician, radiologist, labadmin | Submits key-value results and optional hash. Request must be ACKNOWLEDGED first. |
| `ApproveLabResult` | visitId, labRequestId | labsupervisor, labadmin | Approves COMPLETED results. Moves visit status back to WITH_DOCTOR. |
| `GetLabRequest` | visitId, labRequestId | doctor, all lab roles, admin, medrecordofficer, nurse | Returns a specific lab request object from within the visit. |

---

### DischargeContract (3 functions)

| Function | Args | Role | What it does |
|----------|------|------|-------------|
| `DispenseMedication` | visitId, medicationDetails | pharmacist | Records medication dispensed. Visit must be VISIT_FINALIZED. |
| `FinalizeRecord` | visitId | medrecordofficer | Finalizes official record. Status: RECORD_FINALIZED. Triggers insurance workflow. Visit must be VISIT_FINALIZED. |
| `DischargePatient` | visitId, dischargeNotes | admin, hospitaladmin | Discharges patient. Allowed from CLAIM_APPROVED, CLAIM_REJECTED, or RECORD_FINALIZED. Status: DISCHARGED. |

---

### ClaimsContract (3 functions)

| Function | Args | Role | What it does |
|----------|------|------|-------------|
| `SubmitClaim` | visitId, claimId, claimAmount | billingofficer | Submits insurance claim. Visit must be RECORD_FINALIZED. Amount must be positive. |
| `AuditClaim` | visitId, auditNotes | claimsauditor | Moves claim to audit stage. Notes required. |
| `ProcessClaim` | visitId, decision, reason | insuranceofficer | Approves or rejects claim. decision = APPROVED or REJECTED. Rejection requires reason. |

---

## Backend APIs (4 services)

### peer0-api (:3001) — receptionist + admin

```
POST   /auth/login                       → JWT token
GET    /auth/me                          → current user info

POST   /patients                         → RegisterPatient
GET    /patients/:id                     → GetPatient
GET    /patients/:id/exists              → PatientExists
GET    /patients/:id/visits              → GetPatientVisits (IDs only)
GET    /patients/:id/visits/full         → GetPatientVisitsFull (full objects)
GET    /patients/:id/history             → GetPatientHistory
PUT    /patients/:id                     → UpdatePatientInfo

POST   /visits                           → OpenVisit
GET    /visits/:id                       → GetVisit
GET    /visits/:id/history               → GetVisitHistory
PUT    /visits/:id/doctor                → AssignDoctor
PUT    /visits/:id/nurse                 → AssignNurse
PUT    /visits/:id/discharge             → DischargePatient (admin only)
```

### peer1-api (:3002) — doctor

```
POST   /auth/login
GET    /auth/me

GET    /doctor/visits/:id                → GetVisit
GET    /doctor/visits/:id/history        → GetVisitHistory
GET    /doctor/visits/:id/prescription   → GetCurrentPrescription
PUT    /doctor/visits/:id/diagnosis      → UpdateDiagnosisNotes
PUT    /doctor/visits/:id/prescription   → UpdatePrescription
PUT    /doctor/visits/:id/forward/nurse  → ForwardToNurse
PUT    /doctor/visits/:id/forward/lab    → ForwardToLab
PUT    /doctor/visits/:id/finalize       → FinalizeVisit
PUT    /doctor/visits/:id/assign/nurse   → AssignNurse
```

### peer2-api (:3003) — nurse + pharmacist + medrecordofficer

```
POST   /auth/login
GET    /auth/me

GET    /nurse/visits/:id                        → GetVisit
GET    /nurse/visits/:id/prescription           → GetCurrentPrescription
PUT    /nurse/visits/:id/vitals                 → RecordVitals
POST   /nurse/visits/:id/carenote              → AddCareNote
PUT    /nurse/visits/:id/forward/doctor         → ForwardToDoctor

GET    /pharmacist/visits/:id                   → GetVisit
GET    /pharmacist/visits/:id/prescription      → GetCurrentPrescription
PUT    /pharmacist/visits/:id/dispense          → DispenseMedication

GET    /records/visits/:id                      → GetVisit
GET    /records/visits/:id/history              → GetVisitHistory
PUT    /records/visits/:id/finalize             → FinalizeRecord
```

### extorg-api (:3004) — lab (DiagnosticsMSP) + provider (ProviderMSP)

```
POST   /auth/login
GET    /auth/me

GET    /lab/visits/:id                                    → GetVisit
GET    /lab/visits/:id/request/:reqId                    → GetLabRequest
PUT    /lab/visits/:id/request/:reqId/acknowledge        → AcknowledgeLabRequest
PUT    /lab/visits/:id/request/:reqId/submit             → SubmitLabResult
PUT    /lab/visits/:id/request/:reqId/approve            → ApproveLabResult
PUT    /lab/visits/:id/request/:reqId/return             → LabResultsBackToDoctor

GET    /claims/visits/:id                                → GetVisit
GET    /claims/visits/:id/history                        → GetVisitHistory
POST   /claims/visits/:id/submit                         → SubmitClaim
PUT    /claims/visits/:id/audit                          → AuditClaim
PUT    /claims/visits/:id/process                        → ProcessClaim
```

---

## Role-to-Function Matrix

| Role | Peer | Can invoke |
|------|------|-----------|
| receptionist | peer0 | RegisterPatient, OpenVisit, AssignDoctor, AssignNurse, UpdatePatientInfo |
| admin (hospitaladmin) | peer0 | same as receptionist + DischargePatient |
| doctor | peer1 | UpdateDiagnosisNotes, UpdatePrescription, ForwardToNurse, ForwardToLab, FinalizeVisit, AssignNurse |
| nurse | peer2 | RecordVitals, AddCareNote, ForwardToDoctor |
| pharmacist | peer2 | DispenseMedication |
| medrecordofficer | peer2 | FinalizeRecord |
| labreceptionist | peer0.diagnostic | AcknowledgeLabRequest |
| labtechnician | peer0.diagnostic | SubmitLabResult |
| radiologist | peer0.diagnostic | SubmitLabResult |
| labsupervisor | peer0.diagnostic | ApproveLabResult, LabResultsBackToDoctor |
| labadmin | peer0.diagnostic | AcknowledgeLabRequest, SubmitLabResult, ApproveLabResult, LabResultsBackToDoctor |
| billingofficer | peer0.provider | SubmitClaim |
| claimsauditor | peer0.provider | AuditClaim |
| insuranceofficer | peer0.provider | ProcessClaim |

All roles can read: GetVisit, GetPatient, GetVisitHistory, GetPatientHistory, GetCurrentPrescription, GetLabRequest, PatientExists.

---

## Key Design Properties

**Visit-based model** — A patient is a permanent record. Each hospital visit is a separate ledger entry. One patient can have unlimited visits (V1, V2, V3...). This correctly models repeat visits, follow-ups, and long-term care.

**Multiple lab requests per visit** — A doctor can order labs multiple times during a single visit (L1, L2...). Each request goes through its own acknowledge → submit → approve cycle independently.

**Versioned prescriptions** — Each call to UpdatePrescription adds a new version. The full history of prescriptions is preserved on the ledger. GetCurrentPrescription returns only the latest version.

**Append-only care notes** — AddCareNote never overwrites. Every nurse note is permanently recorded with timestamp and author.

**Forwarding log** — Every handoff (doctor→nurse, nurse→doctor, doctor→lab, lab→doctor) is appended to forwardingLog with: from/to identity, fromRole/toRole, action type, instructions/notes, and timestamp. This is a complete, immutable audit trail of patient movement through the hospital.

**Blockchain history** — GetVisitHistory and GetPatientHistory return every state change ever made to a record, with the transaction ID and orderer timestamp. These timestamps cannot be faked — they come from the orderer, not the client.

**Cross-org transparency** — Hospital, Diagnostics, and Provider all read from the same ledger. When the lab submits results, the doctor sees them. When the billing officer submits a claim, the auditor sees it. No intermediary, no API calls between orgs.

**Role enforcement in chaincode** — Access control is enforced inside the chaincode using the `role` attribute embedded in the X.509 certificate at enrollment time (`role=doctor:ecert`). Even if the JWT is bypassed at the API layer, the peer will reject the transaction if the cert doesn't have the right role.

**Non-repudiation** — Every transaction includes the full X.509 certificate of the submitter, signed with their private key. The signature is validated by the endorsing peer and stored in the block. It is cryptographically impossible to deny having submitted a transaction.

---

## What the System Does NOT Yet Have

1. **CouchDB indexes** — GetPatientsByStatus-style rich queries need an index definition (`META-INF/statedb/couchdb/indexes/`) or they will warn under load.
2. **Chaincode events** — No `stub.setEvent()` calls. Event-driven notifications (nurse gets notified when lab results are ready) require adding events to the chaincode.
3. **Private data collections** — Lab results are currently on the shared ledger visible to all orgs. If Diagnostics wants to keep results private until approved, private data collections are needed.
4. **Refresh token rotation / revocation** — JWT refresh tokens are stateless. There is no blacklist for revoked tokens.
5. **Multi-VM deployment** — All peers currently run on localhost. Peer addresses in `.env` files need updating for distributed deployment.
