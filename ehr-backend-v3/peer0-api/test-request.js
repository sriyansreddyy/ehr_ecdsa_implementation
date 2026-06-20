async function testPatientRegistration() {
    console.log("1. Attempting to log in as receptionist...");
    
    const loginRes = await fetch('http://localhost:3001/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: "receptionist", password: "recept123" })
    });
    
    const loginData = await loginRes.json();
    if (!loginData.success) {
        return console.log("Login failed", loginData);
    }
    
    const token = loginData.data.token;
    console.log("Token generated");
    
    const patientRes = await fetch('http://localhost:3001/patients', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
            patientId: "PAT-TEST-001",
            name: "X",
            age: 20,
            gender: "Male",
            bloodGroup: "A+",
            contact: "9876543210",
            address: "Earth"
        })
    });

    console.log(await patientRes.json());
}

testPatientRegistration();