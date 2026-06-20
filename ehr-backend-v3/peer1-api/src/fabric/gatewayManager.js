'use strict';

const { connect, signers } = require('@hyperledger/fabric-gateway');
const grpc   = require('@grpc/grpc-js');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const { PEER_MAP, _base }  = require('./peerRouter');
const { loadIdentityFromMSP, validateMSPDirectory } = require('./wallet');
const logger = require('../config/logger');

const ORDERER_TLS_CA = process.env.ORDERER_TLS_CA
  ? path.isAbsolute(process.env.ORDERER_TLS_CA)
    ? process.env.ORDERER_TLS_CA
    : path.resolve(process.cwd(), process.env.ORDERER_TLS_CA)
  : path.join(
      _base,
      'organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/tlscacerts/tls-localhost-7054-ca-orderer.pem'
    );

const CHANNEL   = process.env.FABRIC_CHANNEL  || 'ehrchannel';
const CHAINCODE = process.env.FABRIC_CHAINCODE || 'ehr';

const pool = {};

function newGrpcClient(address, tlsCertPath) {
  const creds = grpc.credentials.createSsl(fs.readFileSync(tlsCertPath));
  return new grpc.Client(address, creds, {
    'grpc.ssl_target_name_override':   address.split(':')[0],
    'grpc.max_receive_message_length': -1,
    'grpc.max_send_message_length':    -1,
    'grpc.keepalive_time_ms':          30000,
    'grpc.keepalive_timeout_ms':       10000,
  });
}

function newIdentityAndSigner(mspPath, mspId) {
  const data       = loadIdentityFromMSP(mspPath, mspId);
  const identity   = { mspId, credentials: Buffer.from(data.credentials.certificate) };
  const privateKey = crypto.createPrivateKey(data.credentials.privateKey);
  const signer     = signers.newPrivateKeySigner(privateKey);
  return { identity, signer };
}

async function buildEntry(role, config) {
  logger.info(`Connecting gateway: ${role}`, { peer: config.address, mspId: config.mspId });
  validateMSPDirectory(config.mspPath, role);
  const grpcClient           = newGrpcClient(config.address, config.tlsCertPath);
  const { identity, signer } = newIdentityAndSigner(config.mspPath, config.mspId);
  const gateway = connect({
    client: grpcClient, identity, signer,
    evaluateOptions:     () => ({ deadline: Date.now() + 10_000 }),
    endorseOptions:      () => ({ deadline: Date.now() + 30_000 }),
    submitOptions:       () => ({ deadline: Date.now() + 30_000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
  });
  const network  = gateway.getNetwork(CHANNEL);
  const contract = network.getContract(CHAINCODE);
  return { gateway, grpcClient, network, contract };
}

async function init() {
  logger.info('Initializing gateway pool...');
  for (const [role, config] of Object.entries(PEER_MAP)) {
    try {
      pool[role] = await buildEntry(role, config);
      logger.info(`Gateway ready: ${role}`);
    } catch (err) {
      logger.error(`Gateway failed: ${role}`, { error: err.message });
    }
  }
  logger.info(`Pool ready. Roles: ${Object.keys(pool).join(', ')}`);
}

function getContract(role) {
  const entry = pool[role];
  if (!entry) throw new Error(`No active gateway for role '${role}'`);
  return entry.contract;
}

function getNetwork(role) {
  const entry = pool[role];
  if (!entry) throw new Error(`No active gateway for role '${role}'`);
  return entry.network;
}

async function reconnect(role) {
  const config = PEER_MAP[role];
  if (!config) throw new Error(`Unknown role: ${role}`);
  if (pool[role]) {
    try { pool[role].gateway.close();    } catch (_) {}
    try { pool[role].grpcClient.close(); } catch (_) {}
  }
  pool[role] = await buildEntry(role, config);
  logger.info(`Reconnected: ${role}`);
}

async function close() {
  for (const [role, entry] of Object.entries(pool)) {
    try { entry.gateway.close();    } catch (_) {}
    try { entry.grpcClient.close(); } catch (_) {}
    logger.info(`Closed gateway: ${role}`);
  }
}

module.exports = { init, getContract, getNetwork, reconnect, close };
