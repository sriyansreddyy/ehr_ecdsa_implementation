const jwt = require('jsonwebtoken');

const SECRET = 'super_secret_test_key_for_development_12345'; 

function mintToken(userId, role) {
    return jwt.sign({ userId: userId, role: role }, SECRET, { expiresIn: '8h' });
}

async function makeRequest(port, path, method, token, body) {
    try {
        const response = await fetch(`http://localhost:${port}${path}`, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await response.json();
        console.log(`\n [Port ${port}] ${method} ${path}`);
        console.log(JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error(`\n [Port ${port}] Failed:`, error.message);
    }
}

async function runSimulation() {
    console.log(" Starting Local EHR Network Simulation (4 APIs)...\n");

    try {
        // ==========================================
        // 1. FORGE VIP TOKENS (BYPASSING LOGIN ROUTES)
        // ==========================================
        console.log("Minting cryptographic JWT tokens...");
        const doctorToken = mintToken('doctor', 'doctor');
        const nurseToken  = mintToken('nurse', 'nurse');
        const pharmToken  = mintToken('pharmacist', 'pharmacist');
        const labToken    = mintToken('labtechnician', 'labtechnician');
        
        

        // ==========================================
        // 2. EXECUTE THE CLINICAL WORKFLOW
        // ==========================================
        
        // 1. DOCTOR updates diagnosis (peer1-api on Port 3002)
        await makeRequest(3002, '/doctor/visits/VISIT-123/diagnosis', 'PUT', doctorToken, {
            notes: "Patient exhibiting mild flu symptoms."
        });

        // 2. NURSE records vitals (peer2-api on Port 3003)
        await makeRequest(3003, '/nurse/visits/VISIT-123/vitals', 'PUT', nurseToken, {
            vitals: { bloodPressure: "120/80", temperature: "98.6" }
        });

        // 3. LAB TECH submits test results (extorg-api on Port 3004)
        await makeRequest(3004, '/lab/visits/VISIT-123/request/VISIT-123-L1/submit', 'PUT', labToken, {
            results: { hemoglobin: "14.2", wbc: "7.5" }
        });

        // 4. PHARMACIST dispenses meds (peer2-api on Port 3003)
        await makeRequest(3003, '/pharmacist/visits/VISIT-123/dispense', 'PUT', pharmToken, {
            medicationDetails: "Amoxicillin 500mg dispensed."
        });

        console.log("\n Simulation Complete! Check your file explorer for the local_keystore folders.");
        
    } catch (err) {
        console.error("\n Simulation aborted due to error:", err.message);
    }
}

runSimulation();