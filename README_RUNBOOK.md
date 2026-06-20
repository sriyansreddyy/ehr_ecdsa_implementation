# EHR Project Runbook

This file explains how to start the full EHR stack in the correct order after cloning the repository.

The project is split into these parts:

- `ehr-network` — Hyperledger Fabric network, channel, chaincode, and CA setup
- `ehr-backend-v3` — API services for hospital, external orgs, patient portal, and IPFS wrapper
- `ehr-frontend-v2` — React portals for hospital staff and patients

## What you need first

- Node.js 18+ and npm
- Docker and Docker Compose
- Hyperledger Fabric binaries on the machine that runs the network
- Bash, Git Bash, or WSL for the `.sh` scripts
- A local IPFS/Kubo node on ports `5001` and `8090`

## One-time setup

Before starting anything, create the service environment files from their examples:

```bash
cd ehr-backend-v3/extorg-api
cp .env.example .env

cd ../peer0-api
cp .env.example .env

cd ../peer1-api
cp .env.example .env

cd ../peer2-api
cp .env.example .env

cd ../patient-api
cp .env.example .env

cd ../ipfs-service
cp .env.example .env
```

Then update the important values in those `.env` files:

- `FABRIC_BASE_PATH` must point to the absolute path of `ehr-network`
- `JWT_SECRET` must be set to a strong secret string
- `IPFS_SERVICE_URL` should point to `http://localhost:3006`
- `IPFS_SERVICE_KEY` must match the key used by internal services

## Start order

Start the stack in this order:

1. Fabric network and certificates
2. IPFS node
3. Backend APIs
4. Frontend portals

## Start the Fabric network

From a Bash shell:

```bash
cd ehr-network/scripts
bash network-up.sh
```

If you are on Windows, use Git Bash or WSL for this step.

## Start the backend APIs

The backend has multiple services. The quickest way to start them is the provided script:

```bash
cd ehr-backend-v3
bash start_all.sh
```

That script starts these services:

- `ipfs-service` on `3006`
- `peer0-api` on `3001`
- `peer1-api` on `3002`
- `peer2-api` on `3003`
- `extorg-api` on `3004`
- `patient-api` on `3005`

If you prefer to start them manually, run each service in its own terminal:

```bash
cd ehr-backend-v3/peer0-api && npm start
cd ehr-backend-v3/peer1-api && npm start
cd ehr-backend-v3/peer2-api && npm start
cd ehr-backend-v3/extorg-api && npm start
cd ehr-backend-v3/patient-api && npm start
cd ehr-backend-v3/ipfs-service && npm start
```

## Start the frontends

Hospital portal:

```bash
cd ehr-frontend-v2/hospital-portal
npm install
npm run dev
```

Patient portal:

```bash
cd ehr-frontend-v2/patient-portal
npm install
npm run dev
```

The hospital portal normally runs on `http://localhost:5173`.
The patient portal normally runs on `http://localhost:5174`.

## Demo login accounts

These are the current demo credentials used by the project:

- Receptionist: `receptionist` / `recept123`
- Hospital Admin: `hospitaladmin` / `hadminpw`
- Doctor: `doctor` / `docpw`
- Nurse: `nurse` / `nursepw`
- Pharmacist: `pharmacist` / `pharmpw`
- Medical Records: `medrecordofficer` / `medpw`

Use these only for local demo/testing. If you publish a public repository, review whether you want to keep these demo values or replace them with your own test accounts.

## Quick checks

After starting the stack, these endpoints should respond:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health
curl http://localhost:3006/health
```

If the frontend opens to a blank page, check:

- Browser console for a React runtime error
- Backend terminal output for API errors
- Whether the Fabric network and IPFS node are actually running

## What to know before publishing to GitHub

- Do not commit real secrets in `.env` files.
- Keep generated keys, keystores, logs, and local runtime folders out of the repository.
- If any `.sh` scripts fail on Windows, run them in Git Bash or WSL, or convert line endings to LF.
- Update any hardcoded `localhost` API URLs if you deploy to another machine or a hosted server.

## Recommended commit checklist

- Verify `.env.example` files exist for every service
- Verify `.gitignore` excludes `.env`, logs, and generated credentials
- Confirm the README instructions match the actual ports in your environment
- Run the login flow and one patient flow before publishing
