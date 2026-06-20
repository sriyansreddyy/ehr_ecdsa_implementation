# ECDSA Implementation README

This repository contains a standalone ECDSA-based security layer for a web application.

The focus of this implementation is:

- generating ECDSA key pairs
- signing data before sensitive actions
- verifying signatures on the backend
- storing keys locally for demo/testing purposes
- adding a lightweight access-key check in the React frontend

This README only covers the ECDSA implementation itself. It does not include Docker, blockchain, or infrastructure setup.

## What this project does

The implementation adds cryptographic protection around user actions:

- the backend generates and manages ECDSA key pairs for actors
- the backend signs and verifies JSON payloads using SHA-256 with ECDSA
- the frontend creates a local access key for each user and stores it in the browser
- the login screen and protected actions require the correct access key before continuing
- signatures are recorded locally for auditing and debugging

## Tech Stack

- Node.js
- React
- Browser `crypto` API
- Node.js `crypto` module
- Local browser storage for demo keys
- Local file storage for backend keystores and signature logs

## How it works

### Backend crypto flow

The backend implementation uses the Node.js `crypto` module.

1. Generate an EC key pair with the `prime256v1` curve.
2. Save the public and private keys locally for each actor.
3. Sign JSON data with the private key.
4. Verify the same JSON data with the public key.
5. Store signature logs locally for traceability.

The key helper functions live in `src/utils/cryptoUtils.js` in the backend service.

### Frontend key flow

The frontend adds a lightweight access-key gate for user actions.

1. Generate a random 32-byte access key in the browser.
2. Store that key in `localStorage` under a user-specific key.
3. Copy/paste the key during login or protected actions.
4. Reject the action if the pasted key does not match the stored key.

The frontend helper functions live in `src/utils/keyAuth.js`.

## Important files

### Backend

- `src/utils/cryptoUtils.js` — ECDSA key generation, signing, verification, and local logging
- `src/routes/*.js` — routes that call the signing helpers

### Frontend

- `src/utils/keyAuth.js` — access-key generation and comparison
- `src/context/AuthContext.jsx` — login state and key storage
- `src/pages/Login.jsx` — login UI and access-key check
- `src/components/security/KeyGateModal.jsx` — confirmation modal for sensitive actions

## Prerequisites

- Node.js 18 or newer
- npm
- A modern browser with Web Crypto support

## Setup

Install dependencies in the frontend and backend folders:

```bash
cd backend
npm install

cd ../frontend
npm install
```

If your repo uses a different folder structure, run the commands in the backend and frontend project folders that contain the ECDSA code.

## Run the project

Start the backend:

```bash
cd backend
npm start
```

Start the frontend in a separate terminal:

```bash
cd frontend
npm run dev
```

Then open the frontend URL shown by the dev server.

## Demo flow

1. Open the login page.
2. Select a role.
3. Copy or paste the access key.
4. Sign in.
5. Perform a protected action.
6. Enter the access key again in the authorization modal if the action requires confirmation.

## Default demo credentials

The demo login values depend on your project data. If you are using the same sample accounts as the current implementation, the following values are currently configured:

- Receptionist: `receptionist` / `recept123`
- Hospital Admin: `hospitaladmin` / `hadminpw`
- Doctor: `doctor` / `docpw`
- Nurse: `nurse` / `nursepw`
- Pharmacist: `pharmacist` / `pharmpw`
- Medical Records: `medrecordofficer` / `medpw`

If you publish this as a separate repository, update this section to match the demo users you include there.

## Notes on security

This implementation is for local demo and development use.

- private keys should not be exposed in the browser
- browser `localStorage` is only used here for simple demo access keys
- signature logs are local and should not be treated as production audit storage
- always use HTTPS and stronger key storage for production-grade deployments

## What to include in GitHub

Before publishing, make sure you do not commit:

- `.env` files with secrets
- generated keys and keystore folders
- log files
- machine-specific paths

## Suggested repository structure

```text
ecdsa-project/
├── backend/
│   └── src/
│       ├── routes/
│       └── utils/
├── frontend/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── pages/
│       └── utils/
└── README.md
```

## Short summary

This project adds ECDSA-based signing and verification to secure user actions in the EHR frontend and backend. It is intentionally lightweight and does not include infrastructure, Docker, or blockchain setup in this repository.
