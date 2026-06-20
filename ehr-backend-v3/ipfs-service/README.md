# ipfs-service

Thin HTTP wrapper around the Kubo IPFS node.
All EHR and Visit JSON content is stored through this service.

## Port
`3006`

## Auth
All routes except `/health` require the header:
```
X-IPFS-Key: <value from IPFS_SERVICE_KEY in .env>
```

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | IPFS node status (no auth) |
| POST | /pin | Pin any JSON object, returns CID |
| GET | /fetch/:cid | Fetch JSON by CID |
| POST | /ehr/init | Create + pin empty EHR template |
| POST | /visit/init | Create + pin empty visit JSON |
| POST | /unpin | Unpin a CID (careful — keeps history) |
| GET | /pins | List all pinned CIDs (debug) |

## How backends use this

### Patient Registration (peer0-api)
```
1. POST /patients        → RegisterPatient on blockchain
2. POST /ehr/init        → { patientId, demographics }
   ← { cid: "bafyrei..." }
3. blockchain InitEHR(patientId, cid)
```

### Open Visit (peer0-api)
```
1. POST /visits          → get visitId from blockchain OpenVisit response
   Wait — OpenVisit now needs visitCID first, so:
1. POST /visit/init      → { visitId: "PAT-001-V1", patientId, chiefComplaint, openedBy }
   ← { cid, visit }
2. blockchain OpenVisit(patientId, chiefComplaint, cid)
```

### Doctor Updates Diagnosis (peer1-api)
```
1. blockchain GetVisitCID(visitId)     → currentCID
2. GET /fetch/:currentCID              → visit JSON
3. modify visit.diagnosisNotes = notes
4. POST /pin { json: updatedVisit }    → newCID
5. blockchain UpdateDiagnosisNotes(visitId, newCID)
```

### Patient Views EHR (patient-api)
```
1. blockchain GetCurrentCID(patientId)  → ehrCID
2. GET /fetch/:ehrCID                   → EHR JSON
3. return to patient
```

## Setup

```bash
cp .env.example .env
# Edit .env — set IPFS_API_URL and IPFS_SERVICE_KEY
npm install
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3006 | Port this service listens on |
| IPFS_API_URL | http://localhost:5001 | Kubo IPFS API |
| IPFS_GATEWAY_URL | http://localhost:8090 | IPFS HTTP gateway |
| MAX_BODY_SIZE | 5mb | Max request body |
| IPFS_SERVICE_KEY | (required) | Auth key for internal services |
