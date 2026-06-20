'use strict';

const path = require('path');

const _base = process.env.FABRIC_BASE_PATH
  ? path.isAbsolute(process.env.FABRIC_BASE_PATH)
    ? process.env.FABRIC_BASE_PATH
    : path.resolve(process.cwd(), process.env.FABRIC_BASE_PATH)
  : path.resolve(__dirname, '../../../..');

const USERS = path.join(_base, 'organizations/peerOrganizations/hospital.example.com/users');
const PEERS = path.join(_base, 'organizations/peerOrganizations/hospital.example.com/peers');
const PEER_ADDR = process.env.PEER_ADDRESS || 'localhost:7051';
const TLS_CERT  = path.join(PEERS, 'peer0.hospital.example.com/tls/ca.crt');
const MSP_ID    = 'HospitalMSP';

// peer0 serves: receptionist and admin (hospitaladmin)
const PEER_MAP = {
  receptionist: {
    address: PEER_ADDR, tlsCertPath: TLS_CERT,
    mspPath: path.join(USERS, 'receptionist/msp'), mspId: MSP_ID,
  },
  admin: {
    address: PEER_ADDR, tlsCertPath: TLS_CERT,
    mspPath: path.join(USERS, 'hospitaladmin/msp'), mspId: MSP_ID,
  },
};

function getPeerConfig(role) {
  const c = PEER_MAP[role];
  if (!c) throw new Error(`No peer config for role: '${role}'`);
  return c;
}

function knownRoles() { return Object.keys(PEER_MAP); }

module.exports = { getPeerConfig, knownRoles, PEER_MAP, _base };
