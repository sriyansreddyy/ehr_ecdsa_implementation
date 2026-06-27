'use strict';

// ==========================================
// LOCAL BYPASS: FAKE IPFS NETWORK
// ==========================================

module.exports.fetchByCID = async (cid) => {
    return {
        patientId: 'PAT-123',
        forwardingLog: [],
        labRequests: [{
            labRequestId: 'VISIT-123-L1',
            tests: ['Blood'],
            status: 'REQUESTED'
        }],
        prescriptions: []
    };
};

module.exports.pinJSON = async (data, filename) => {
    return `mock-cid-for-${filename}`;
};

// Required by patients.js → POST /patients
module.exports.initEHR = async (patientId, demographics) => {
    return { cid: `mock-ehr-cid-for-${patientId}` };
};

// Required by visits.js → POST /visits (OpenVisit)
module.exports.initVisit = async (visitId, patientId, chiefComplaint, openedBy) => {
    return { cid: `mock-visit-cid-for-${visitId}` };
};