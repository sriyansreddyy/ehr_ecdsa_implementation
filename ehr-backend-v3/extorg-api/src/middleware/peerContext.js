'use strict';

// ==========================================
// LOCAL BYPASS: FAKE BLOCKCHAIN MIDDLEWARE
// ==========================================
module.exports.peerContext = async (req, res, next) => {
    // We attach a fake smart contract to the request
    req.contract = {
        evaluateTransaction: async (contractName, ...args) => {
            // Fake the "GetVisit" read request so the APIs think the patient is ready
            return Buffer.from(JSON.stringify({
                visitCID: 'mock-ipfs-cid-123',
                patientId: 'PAT-123',
                assignedDoctor: 'doctor',
                assignedNurse: 'nurse',
                status: 'CLAIM_SUBMITTED' // Required for the Pharmacist route to work
            }));
        },
        submitTransaction: async (contractName, ...args) => {
            // Fake a successful write to the blockchain
            return Buffer.from(JSON.stringify({ success: true, txId: 'mock-tx-999' }));
        }
    };
    next();
};