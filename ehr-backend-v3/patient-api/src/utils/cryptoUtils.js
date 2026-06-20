const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Define where the local keystore folders will live
const KEYSTORE_DIR = path.join(__dirname, '../../local_keystore');

// 1. Existing function: Generates the math
function generateActorKeys() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey };
}

// 2. NEW: Manages the Actor's Folder
function getOrCreateActorKeys(actorId) {
    const actorDir = path.join(KEYSTORE_DIR, actorId);
    const pubPath = path.join(actorDir, 'public.pem');
    const privPath = path.join(actorDir, 'private.pem');

    // If the actor already has a folder and keys, read them from the file
    if (fs.existsSync(pubPath) && fs.existsSync(privPath)) {
        return {
            publicKey: fs.readFileSync(pubPath, 'utf8'),
            privateKey: fs.readFileSync(privPath, 'utf8')
        };
    }

    // Otherwise, generate new keys and create the folder
    const keys = generateActorKeys();
    
    fs.mkdirSync(actorDir, { recursive: true }); // Creates the folder if it doesn't exist
    fs.writeFileSync(pubPath, keys.publicKey);
    fs.writeFileSync(privPath, keys.privateKey);

    return keys;
}

// 3. NEW: Saves a log of the signature in the Actor's folder
function logSignatureLocally(actorId, patientId, signature) {
    const actorDir = path.join(KEYSTORE_DIR, actorId);
    if (!fs.existsSync(actorDir)) fs.mkdirSync(actorDir, { recursive: true });

    const sigLogPath = path.join(actorDir, 'signatures.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Signed Patient: ${patientId} | Signature: ${signature}\n`;
    
    fs.appendFileSync(sigLogPath, logEntry);
}

// 4. Existing function: Signs the document
function signDocument(privateKey, documentObject) {
    const dataString = JSON.stringify(documentObject);
    const sign = crypto.createSign('SHA256');
    sign.update(dataString);
    sign.end();
    return sign.sign(privateKey, 'hex'); 
}

// 5. Existing function: Verifies the document
function verifyDocument(publicKey, signature, documentObject) {
    const dataString = JSON.stringify(documentObject);
    const verify = crypto.createVerify('SHA256');
    verify.update(dataString);
    verify.end();
    return verify.verify(publicKey, signature, 'hex');
}

// Export the new functions alongside the old ones
module.exports = {
    getOrCreateActorKeys,
    logSignatureLocally,
    signDocument,
    verifyDocument
};