'use strict';

/**
 * cryptoUtils.js  (updated)
 * -------------------------
 * getOrCreateActorKeys() has been REMOVED.
 * Key generation and storage is now handled by keyVault.js.
 *
 * What remains:
 *   signDocument(privateKeyPem, documentObject)  → hex signature
 *   verifyDocument(publicKeyPem, signature, documentObject) → bool
 *   logSignatureLocally(actorId, contextId, signature) → void (file log)
 *
 * Usage in a route:
 *
 *   const { signDocument, logSignatureLocally } = require('../utils/cryptoUtils');
 *   // privateKey comes from req.actorPrivateKey (set by verifyPin middleware)
 *   const sig = signDocument(req.actorPrivateKey, clinical);
 *   logSignatureLocally(req.user.userId, visitId, sig);
 *   // req.actorPrivateKey goes out of scope at end of handler — GC'd
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// Signature log still goes to disk (audit trail only — no key material here)
const LOG_DIR = path.join(__dirname, '../../signature_logs');

/**
 * signDocument(privateKeyPem, documentObject)
 * --------------------------------------------
 * Signs a JSON-serialisable object with the actor's EC private key.
 * Returns the signature as a hex string.
 */
function signDocument(privateKeyPem, documentObject) {
  const dataString = JSON.stringify(documentObject);
  const sign = crypto.createSign('SHA256');
  sign.update(dataString);
  sign.end();
  return sign.sign(privateKeyPem, 'hex');
}

/**
 * verifyDocument(publicKeyPem, hexSignature, documentObject)
 * -----------------------------------------------------------
 * Verifies a signature previously produced by signDocument.
 * Returns true if valid, false otherwise.
 */
function verifyDocument(publicKeyPem, hexSignature, documentObject) {
  const dataString = JSON.stringify(documentObject);
  const verify = crypto.createVerify('SHA256');
  verify.update(dataString);
  verify.end();
  return verify.verify(publicKeyPem, hexSignature, 'hex');
}

/**
 * logSignatureLocally(actorId, contextId, signature)
 * ---------------------------------------------------
 * Appends an audit entry to a local log file.
 * This is an audit trail only — it contains no key material.
 */
function logSignatureLocally(actorId, contextId, signature) {
  const actorLogDir = path.join(LOG_DIR, actorId);
  if (!fs.existsSync(actorLogDir)) fs.mkdirSync(actorLogDir, { recursive: true });

  const logPath  = path.join(actorLogDir, 'signatures.log');
  const logEntry = `[${new Date().toISOString()}] context=${contextId} sig=${signature}\n`;
  fs.appendFileSync(logPath, logEntry);
}

module.exports = {
  signDocument,
  verifyDocument,
  logSignatureLocally,
};