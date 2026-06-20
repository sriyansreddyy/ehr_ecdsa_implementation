'use strict';

const path = require('path');

const _base = process.env.FABRIC_BASE_PATH
  ? path.isAbsolute(process.env.FABRIC_BASE_PATH)
    ? process.env.FABRIC_BASE_PATH
    : path.resolve(process.cwd(), process.env.FABRIC_BASE_PATH)
  : path.resolve(__dirname, '../../../..');

// ── Diagnostics org ───────────────────────────────────────────
const DIAG_USERS = path.join(_base, 'organizations/peerOrganizations/diagnostic.example.com/users');
const DIAG_PEERS = path.join(_base, 'organizations/peerOrganizations/diagnostic.example.com/peers');
const DIAG_ADDR  = process.env.DIAG_PEER_ADDRESS || 'localhost:8051';
const DIAG_TLS   = path.join(DIAG_PEERS, 'peer0.diagnostic.example.com/tls/ca.crt');
const DIAG_MSP   = 'DiagnosticsMSP';

// ── Provider org ──────────────────────────────────────────────
const PROV_USERS = path.join(_base, 'organizations/peerOrganizations/provider.example.com/users');
const PROV_PEERS = path.join(_base, 'organizations/peerOrganizations/provider.example.com/peers');
const PROV_ADDR  = process.env.PROV_PEER_ADDRESS || 'localhost:11051';
const PROV_TLS   = path.join(PROV_PEERS, 'peer0.provider.example.com/tls/ca.crt');
const PROV_MSP   = 'ProviderMSP';

const PEER_MAP = {
  // ── Lab roles (DiagnosticsMSP) ──────────────────────────────
  labreceptionist: {
    address: DIAG_ADDR, tlsCertPath: DIAG_TLS,
    mspPath: path.join(DIAG_USERS, 'labreceptionist/msp'), mspId: DIAG_MSP,
  },
  labtechnician: {
    address: DIAG_ADDR, tlsCertPath: DIAG_TLS,
    mspPath: path.join(DIAG_USERS, 'labtechnician/msp'), mspId: DIAG_MSP,
  },
  radiologist: {
    address: DIAG_ADDR, tlsCertPath: DIAG_TLS,
    mspPath: path.join(DIAG_USERS, 'radiologist/msp'), mspId: DIAG_MSP,
  },
  labsupervisor: {
    address: DIAG_ADDR, tlsCertPath: DIAG_TLS,
    mspPath: path.join(DIAG_USERS, 'labsupervisor/msp'), mspId: DIAG_MSP,
  },
  labadmin: {
    address: DIAG_ADDR, tlsCertPath: DIAG_TLS,
    mspPath: path.join(DIAG_USERS, 'labadmin/msp'), mspId: DIAG_MSP,
  },

  // ── Provider roles (ProviderMSP) ─────────────────────────────
  billingofficer: {
    address: PROV_ADDR, tlsCertPath: PROV_TLS,
    mspPath: path.join(PROV_USERS, 'billingofficer/msp'), mspId: PROV_MSP,
  },
  claimsauditor: {
    address: PROV_ADDR, tlsCertPath: PROV_TLS,
    mspPath: path.join(PROV_USERS, 'claimsauditor/msp'), mspId: PROV_MSP,
  },
  insuranceofficer: {
    address: PROV_ADDR, tlsCertPath: PROV_TLS,
    mspPath: path.join(PROV_USERS, 'insuranceofficer/msp'), mspId: PROV_MSP,
  },
  provideradmin: {
    address: PROV_ADDR, tlsCertPath: PROV_TLS,
    mspPath: path.join(PROV_USERS, 'provideradmin/msp'), mspId: PROV_MSP,
  },
};

function getPeerConfig(role) {
  const c = PEER_MAP[role];
  if (!c) throw new Error(`No peer config for role: '${role}'`);
  return c;
}

function knownRoles() { return Object.keys(PEER_MAP); }

module.exports = { getPeerConfig, knownRoles, PEER_MAP, _base };
