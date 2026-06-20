'use strict';

const fs   = require('fs');
const path = require('path');

function loadIdentityFromMSP(mspPath, mspId) {
  const certDir = path.join(mspPath, 'signcerts');
  const keyDir  = path.join(mspPath, 'keystore');

  const certFiles = fs.readdirSync(certDir).filter(f => f.endsWith('.pem'));
  if (!certFiles.length) throw new Error(`No certificate found in ${certDir}`);
  const certificate = fs.readFileSync(path.join(certDir, certFiles[0])).toString();

  const keyFiles = fs.readdirSync(keyDir);
  if (!keyFiles.length) throw new Error(`No private key found in ${keyDir}`);
  const privateKey = fs.readFileSync(path.join(keyDir, keyFiles[0])).toString();

  return { credentials: { certificate, privateKey }, mspId, type: 'X.509' };
}

function validateMSPDirectory(mspPath, role) {
  const required = [
    path.join(mspPath, 'signcerts'),
    path.join(mspPath, 'keystore'),
    path.join(mspPath, 'cacerts'),
    path.join(mspPath, 'config.yaml'),
  ];
  const missing = required.filter(p => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(`MSP for '${role}' incomplete. Missing: ${missing.join(', ')}`);
  }
}

module.exports = { loadIdentityFromMSP, validateMSPDirectory };
