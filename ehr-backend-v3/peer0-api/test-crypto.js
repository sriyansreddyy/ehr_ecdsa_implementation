// 1. Import the tools you just made
const { generateActorKeys, signDocument, verifyDocument } = require('./src/utils/cryptoUtils');

console.log("--- STARTING ECDSA TEST ---\n");

// 2. Generate Keys for a test Doctor
console.log("1. Generating Keys for Dr. Smith...");
const doctorKeys = generateActorKeys();
console.log("Success! Private and Public keys created.\n");

// 3. Create a dummy medical record
const medicalRecord = {
    patientId: "PAT-12345",
    diagnosis: "Common Cold",
    notes: "Rest and drink fluids."
};
console.log("2. Medical Record Created:", medicalRecord, "\n");

// 4. Sign the record using the Doctor's PRIVATE key
console.log("3. Doctor is signing the record...");
const digitalSignature = signDocument(doctorKeys.privateKey, medicalRecord);
console.log("Signature Generated:", digitalSignature, "\n");

// 5. Verify the record using the Doctor's PUBLIC key
console.log("4. System is verifying the signature...");
const isAuthentic = verifyDocument(doctorKeys.publicKey, digitalSignature, medicalRecord);

if (isAuthentic) {
    console.log("✅ VERIFICATION SUCCESSFUL: The document is authentic and has not been tampered with.");
} else {
    console.log("❌ VERIFICATION FAILED: The document is invalid.");
}

console.log("\n--- TEST COMPLETE ---");