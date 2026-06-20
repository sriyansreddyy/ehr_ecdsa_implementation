# EHR Backend v2

Four Express APIs, one per Hospital peer + one combined for external orgs.

```
ehr-backend-v2/
├── peer0-api/    :3001  HospitalMSP   peer0  receptionist, admin
├── peer1-api/    :3002  HospitalMSP   peer1  doctor
├── peer2-api/    :3003  HospitalMSP   peer2  nurse, pharmacist, medrecordofficer
└── extorg-api/   :3004  DiagnosticsMSP + ProviderMSP  all lab + provider roles
```

---

## Chaincode contracts & namespaces

Functions must be called with the contract prefix:

| Contract | Prefix | Handled by |
|----------|--------|-----------|
| PatientContract | `PatientContract:` | peer0-api, peer1-api |
| VisitContract | `VisitContract:` | peer0-api, peer1-api, peer2-api, extorg-api (read) |
| ForwardContract | `ForwardContract:` | peer1-api, peer2-api, extorg-api |
| ClinicalContract | `ClinicalContract:` | peer1-api, peer2-api |
| LabContract | `LabContract:` | extorg-api |
| DischargeContract | `DischargeContract:` | peer2-api, peer0-api (discharge) |
| ClaimsContract | `ClaimsContract:` | extorg-api |

---

## Quick start

```bash
# 1. Install dependencies
for API in peer0-api peer1-api peer2-api extorg-api; do
  cd $API && npm install && cd ..
done

# 2. Create .env files
for API in peer0-api peer1-api peer2-api extorg-api; do
  cp $API/.env.example $API/.env
done

# 3. Set FABRIC_BASE_PATH in each .env
#    Edit each .env and set:
#    FABRIC_BASE_PATH=/home/avi/Data/fabric-samples/ehr_test_6/ehr-network

# 4. Generate bcrypt hashes and patch auth.js files
bash generate_hashes.sh

# 5. Start all 4 APIs (4 terminals)
cd peer0-api  && npm start   # :3001
cd peer1-api  && npm start   # :3002
cd peer2-api  && npm start   # :3003
cd extorg-api && npm start   # :3004

# 6. Run full journey test
bash test_full_journey_v2.sh
```

---

## API Reference

### peer0-api (:3001) — receptionist + admin

| Method | Path | Role | Contract |
|--------|------|------|----------|
| POST | /auth/login | — | — |
| POST | /patients | receptionist, admin | PatientContract:RegisterPatient |
| GET | /patients/:id | any | PatientContract:GetPatient |
| GET | /patients/:id/exists | any | PatientContract:PatientExists |
| GET | /patients/:id/visits | any | PatientContract:GetPatientVisits |
| GET | /patients/:id/visits/full | any | VisitContract:GetPatientVisitsFull |
| GET | /patients/:id/history | any | PatientContract:GetPatientHistory |
| PUT | /patients/:id | receptionist, admin | PatientContract:UpdatePatientInfo |
| POST | /visits | receptionist, admin | VisitContract:OpenVisit |
| GET | /visits/:id | any | VisitContract:GetVisit |
| GET | /visits/:id/history | any | VisitContract:GetVisitHistory |
| PUT | /visits/:id/doctor | receptionist, admin | VisitContract:AssignDoctor |
| PUT | /visits/:id/nurse | receptionist, admin | VisitContract:AssignNurse |
| PUT | /visits/:id/discharge | admin | DischargeContract:DischargePatient |

### peer1-api (:3002) — doctor

| Method | Path | Role | Contract |
|--------|------|------|----------|
| POST | /auth/login | — | — |
| GET | /doctor/visits/:id | doctor | VisitContract:GetVisit |
| GET | /doctor/visits/:id/history | doctor | VisitContract:GetVisitHistory |
| GET | /doctor/visits/:id/prescription | doctor | ClinicalContract:GetCurrentPrescription |
| PUT | /doctor/visits/:id/diagnosis | doctor | ClinicalContract:UpdateDiagnosisNotes |
| PUT | /doctor/visits/:id/prescription | doctor | ClinicalContract:UpdatePrescription |
| PUT | /doctor/visits/:id/forward/nurse | doctor | ForwardContract:ForwardToNurse |
| PUT | /doctor/visits/:id/forward/lab | doctor | ForwardContract:ForwardToLab |
| PUT | /doctor/visits/:id/finalize | doctor | VisitContract:FinalizeVisit |
| PUT | /doctor/visits/:id/assign/nurse | doctor | VisitContract:AssignNurse |

### peer2-api (:3003) — nurse + pharmacist + medrecordofficer

| Method | Path | Role | Contract |
|--------|------|------|----------|
| POST | /auth/login | — | — |
| GET | /nurse/visits/:id | nurse | VisitContract:GetVisit |
| GET | /nurse/visits/:id/prescription | nurse | ClinicalContract:GetCurrentPrescription |
| PUT | /nurse/visits/:id/vitals | nurse | ClinicalContract:RecordVitals |
| POST | /nurse/visits/:id/carenote | nurse | ClinicalContract:AddCareNote |
| PUT | /nurse/visits/:id/forward/doctor | nurse | ForwardContract:ForwardToDoctor |
| GET | /pharmacist/visits/:id | pharmacist | VisitContract:GetVisit |
| GET | /pharmacist/visits/:id/prescription | pharmacist | ClinicalContract:GetCurrentPrescription |
| PUT | /pharmacist/visits/:id/dispense | pharmacist | DischargeContract:DispenseMedication |
| GET | /records/visits/:id | medrecordofficer | VisitContract:GetVisit |
| GET | /records/visits/:id/history | medrecordofficer | VisitContract:GetVisitHistory |
| PUT | /records/visits/:id/finalize | medrecordofficer | DischargeContract:FinalizeRecord |

### extorg-api (:3004) — lab + provider

| Method | Path | Role | Contract |
|--------|------|------|----------|
| POST | /auth/login | — | — |
| GET | /lab/visits/:id | lab roles | VisitContract:GetVisit |
| GET | /lab/visits/:id/request/:reqId | lab roles | LabContract:GetLabRequest |
| PUT | /lab/visits/:id/request/:reqId/acknowledge | labreceptionist | LabContract:AcknowledgeLabRequest |
| PUT | /lab/visits/:id/request/:reqId/submit | labtechnician, radiologist | LabContract:SubmitLabResult |
| PUT | /lab/visits/:id/request/:reqId/approve | labsupervisor | LabContract:ApproveLabResult |
| PUT | /lab/visits/:id/request/:reqId/return | labsupervisor | ForwardContract:LabResultsBackToDoctor |
| GET | /claims/visits/:id | provider roles | VisitContract:GetVisit |
| GET | /claims/visits/:id/history | provider roles | VisitContract:GetVisitHistory |
| POST | /claims/visits/:id/submit | billingofficer | ClaimsContract:SubmitClaim |
| PUT | /claims/visits/:id/audit | claimsauditor | ClaimsContract:AuditClaim |
| PUT | /claims/visits/:id/process | insuranceofficer | ClaimsContract:ProcessClaim |

---

## Key differences from v1

- **Visit-based model** — patients have multiple visits (`PAT-001-V1`, `PAT-001-V2`)
- **forwardingLog** — every handoff (doctor→nurse→lab) is recorded immutably
- **Multiple lab requests per visit** (`PAT-001-V1-L1`, `PAT-001-V1-L2`)
- **Versioned prescriptions** — each update adds a new version to the array
- **Contract namespaces** — all calls use `ContractName:FunctionName`
- **4 backends instead of 3** — hospital split by peer (peer0/peer1/peer2)
