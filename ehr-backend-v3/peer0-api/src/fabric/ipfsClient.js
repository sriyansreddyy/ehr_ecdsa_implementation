'use strict';

// ==========================================
// LOCAL BYPASS: FAKE IPFS NETWORK
// ==========================================
module.exports.fetchByCID = async (cid) => {
    // Return a baseline clinical JSON object so the APIs have something to digitally sign
    return {
        patientId: 'PAT-123',
        forwardingLog: [],
        labRequests: [{
            labRequestId: 'VISIT-123-L1', // Required for the Lab Tech submit route
            tests: ['Blood'],
            status: 'REQUESTED'
        }],
        prescriptions: []
    };
};

module.exports.pinJSON = async (data, filename) => {
    // Pretend the file was uploaded and return a fake CID string
    return `mock-cid-for-${filename}`;
};