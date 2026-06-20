#!/bin/bash

# ============================================================
# EHR Network - End to End Test Script
# Usage: bash scripts/chaincode_test.sh [--patient PAT-XXX]
# ============================================================



RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

log()     { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
section() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
  echo -e "${WHITE}  $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
}

PASS_COUNT=0
FAIL_COUNT=0

# ============================================================
# CONFIG
# ============================================================

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
ORGANIZATIONS="$BASE_DIR/organizations"
CHANNEL="ehrchannel"
CC_NAME="ehr"
PATIENT_ID="PAT-TEST-001"
ORDERER_ADDR="localhost:7050"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --patient) PATIENT_ID="$2"; shift ;;
  esac
  shift
done

export FABRIC_CFG_PATH=${HOME}/Data/fabric-samples/config
export CORE_PEER_TLS_ENABLED=true
export ORDERER_TLS="$ORGANIZATIONS/ordererOrganizations/example.com/orderers/orderer.example.com/tls/tlscacerts/tls-localhost-7054-ca-orderer.pem"

PEER0_HOSP_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt"
PEER1_HOSP_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer1.hospital.example.com/tls/ca.crt"
PEER2_HOSP_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer2.hospital.example.com/tls/ca.crt"
DIAG_TLS="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/peers/peer0.diagnostic.example.com/tls/ca.crt"
PROV_TLS="$ORGANIZATIONS/peerOrganizations/provider.example.com/peers/peer0.provider.example.com/tls/ca.crt"

HOSP_USERS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/users"
DIAG_USERS="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/users"
PROV_USERS="$ORGANIZATIONS/peerOrganizations/provider.example.com/users"

# ============================================================
# PEER SWITCH HELPERS
# ============================================================

use_receptionist()    { export CORE_PEER_LOCALMSPID=HospitalMSP;    export CORE_PEER_ADDRESS=localhost:7051;  export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_HOSP_TLS; export CORE_PEER_MSPCONFIGPATH=$HOSP_USERS/receptionist/msp; }
use_hospitaladmin()   { export CORE_PEER_LOCALMSPID=HospitalMSP;    export CORE_PEER_ADDRESS=localhost:7051;  export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_HOSP_TLS; export CORE_PEER_MSPCONFIGPATH=$HOSP_USERS/hospitaladmin/msp; }
use_doctor()          { export CORE_PEER_LOCALMSPID=HospitalMSP;    export CORE_PEER_ADDRESS=localhost:9051;  export CORE_PEER_TLS_ROOTCERT_FILE=$PEER1_HOSP_TLS; export CORE_PEER_MSPCONFIGPATH=$HOSP_USERS/doctor/msp; }
use_nurse()           { export CORE_PEER_LOCALMSPID=HospitalMSP;    export CORE_PEER_ADDRESS=localhost:10051; export CORE_PEER_TLS_ROOTCERT_FILE=$PEER2_HOSP_TLS; export CORE_PEER_MSPCONFIGPATH=$HOSP_USERS/nurse/msp; }
use_pharmacist()      { export CORE_PEER_LOCALMSPID=HospitalMSP;    export CORE_PEER_ADDRESS=localhost:10051; export CORE_PEER_TLS_ROOTCERT_FILE=$PEER2_HOSP_TLS; export CORE_PEER_MSPCONFIGPATH=$HOSP_USERS/pharmacist/msp; }
use_medrecordofficer(){ export CORE_PEER_LOCALMSPID=HospitalMSP;    export CORE_PEER_ADDRESS=localhost:9051;  export CORE_PEER_TLS_ROOTCERT_FILE=$PEER1_HOSP_TLS; export CORE_PEER_MSPCONFIGPATH=$HOSP_USERS/medrecordofficer/msp; }
use_labreceptionist() { export CORE_PEER_LOCALMSPID=DiagnosticsMSP; export CORE_PEER_ADDRESS=localhost:8051;  export CORE_PEER_TLS_ROOTCERT_FILE=$DIAG_TLS;       export CORE_PEER_MSPCONFIGPATH=$DIAG_USERS/labreceptionist/msp; }
use_labtechnician()   { export CORE_PEER_LOCALMSPID=DiagnosticsMSP; export CORE_PEER_ADDRESS=localhost:8051;  export CORE_PEER_TLS_ROOTCERT_FILE=$DIAG_TLS;       export CORE_PEER_MSPCONFIGPATH=$DIAG_USERS/labtechnician/msp; }
use_labsupervisor()   { export CORE_PEER_LOCALMSPID=DiagnosticsMSP; export CORE_PEER_ADDRESS=localhost:8051;  export CORE_PEER_TLS_ROOTCERT_FILE=$DIAG_TLS;       export CORE_PEER_MSPCONFIGPATH=$DIAG_USERS/labsupervisor/msp; }
use_billingofficer()  { export CORE_PEER_LOCALMSPID=ProviderMSP;    export CORE_PEER_ADDRESS=localhost:11051; export CORE_PEER_TLS_ROOTCERT_FILE=$PROV_TLS;       export CORE_PEER_MSPCONFIGPATH=$PROV_USERS/billingofficer/msp; }
use_claimsauditor()   { export CORE_PEER_LOCALMSPID=ProviderMSP;    export CORE_PEER_ADDRESS=localhost:11051; export CORE_PEER_TLS_ROOTCERT_FILE=$PROV_TLS;       export CORE_PEER_MSPCONFIGPATH=$PROV_USERS/claimsauditor/msp; }
use_insuranceofficer(){ export CORE_PEER_LOCALMSPID=ProviderMSP;    export CORE_PEER_ADDRESS=localhost:11051; export CORE_PEER_TLS_ROOTCERT_FILE=$PROV_TLS;       export CORE_PEER_MSPCONFIGPATH=$PROV_USERS/insuranceofficer/msp; }

# ============================================================
# INVOKE / QUERY HELPERS
# ============================================================

invoke() {
  peer chaincode invoke \
    -o $ORDERER_ADDR \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls --cafile $ORDERER_TLS \
    -C $CHANNEL -n $CC_NAME \
    --peerAddresses $CORE_PEER_ADDRESS \
    --tlsRootCertFiles $CORE_PEER_TLS_ROOTCERT_FILE \
    -c "$1" 2>&1
}

query() {
  peer chaincode query \
    -C $CHANNEL -n $CC_NAME \
    -c "$1" 2>&1
}

# ── Always queries using hospitaladmin on peer0 ───────────────
get_status() {
  CORE_PEER_LOCALMSPID=HospitalMSP \
  CORE_PEER_ADDRESS=localhost:7051 \
  CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_HOSP_TLS \
  CORE_PEER_MSPCONFIGPATH=$HOSP_USERS/hospitaladmin/msp \
  peer chaincode query \
    -C $CHANNEL -n $CC_NAME \
    -c "{\"function\":\"GetPatient\",\"Args\":[\"$1\"]}" 2>/dev/null | jq -r '.status' 2>/dev/null
}

# ============================================================
# ASSERT HELPERS
# ============================================================

assert_success() {
  local LABEL=$1
  local OUTPUT=$2
  if echo "$OUTPUT" | grep -q "Chaincode invoke successful"; then
    echo -e "  ${GREEN}✓${NC} $LABEL"
    PASS_COUNT=$(( PASS_COUNT + 1 ))
  else
    echo -e "  ${RED}✗${NC} $LABEL"
    echo -e "    ${RED}$OUTPUT${NC}"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
  fi
}

assert_status() {
  local LABEL=$1
  local PID=$2
  local EXPECTED=$3
  local ACTUAL
  ACTUAL=$(get_status "$PID")
  if [ "$ACTUAL" == "$EXPECTED" ]; then
    echo -e "  ${GREEN}✓${NC} $LABEL → ${WHITE}$ACTUAL${NC}"
    PASS_COUNT=$(( PASS_COUNT + 1 ))
  else
    echo -e "  ${RED}✗${NC} $LABEL → expected: ${WHITE}$EXPECTED${NC} got: ${RED}${ACTUAL:-empty}${NC}"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
  fi
}

assert_denied() {
  local LABEL=$1
  local OUTPUT=$2
  if echo "$OUTPUT" | grep -q "Access denied\|not authorized"; then
    echo -e "  ${GREEN}✓${NC} $LABEL ${GREEN}[correctly denied]${NC}"
    PASS_COUNT=$(( PASS_COUNT + 1 ))
  else
    echo -e "  ${RED}✗${NC} $LABEL ${RED}[should have been denied]${NC}"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
  fi
}

# ============================================================
# HEADER
# ============================================================

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}   EHR Network — End to End Test                    ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "  Channel  : ${WHITE}$CHANNEL${NC}"
echo -e "  Chaincode: ${WHITE}$CC_NAME${NC}"
echo -e "  Patient  : ${WHITE}$PATIENT_ID${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"

# ============================================================
# PRE-CHECK
# ============================================================

section "PRE-CHECK"

use_hospitaladmin
EXISTS=$(query "{\"function\":\"PatientExists\",\"Args\":[\"$PATIENT_ID\"]}")
if echo "$EXISTS" | grep -q "false\|true"; then
  success "Chaincode is reachable"
else
  echo -e "${RED}Chaincode not reachable. Make sure network is up and chaincode is deployed.${NC}"
  echo "$EXISTS"
  exit 1
fi

if echo "$EXISTS" | grep -q "true"; then
  warn "Patient $PATIENT_ID already exists — using fresh ID"
  PATIENT_ID="${PATIENT_ID}-$(date +%s)"
  log "New patient ID: $PATIENT_ID"
fi

# ============================================================
# A. HAPPY PATH
# ============================================================

section "A. HAPPY PATH — Full Patient Journey"

# Step 1
log "Step 1: RegisterPatient (receptionist → peer0)"
use_receptionist
OUT=$(invoke "{\"function\":\"RegisterPatient\",\"Args\":[\"$PATIENT_ID\",\"John Doe\",\"35\",\"Male\",\"O+\",\"9999999999\",\"123 Main St\"]}")
assert_success "RegisterPatient" "$OUT"
sleep 6
assert_status "Status after RegisterPatient" "$PATIENT_ID" "REGISTERED"

# Step 2
log "Step 2: AssignDoctor (receptionist → peer0)"
use_receptionist
OUT=$(invoke "{\"function\":\"AssignDoctor\",\"Args\":[\"$PATIENT_ID\",\"doctor\"]}")
assert_success "AssignDoctor" "$OUT"
sleep 6
assert_status "Status after AssignDoctor" "$PATIENT_ID" "DOCTOR_ASSIGNED"

# Step 3
log "Step 3: DiagnosePatient (doctor → peer1)"
use_doctor
OUT=$(invoke "{\"function\":\"DiagnosePatient\",\"Args\":[\"$PATIENT_ID\",\"Type 2 Diabetes\",\"Elevated blood sugar levels\"]}")
assert_success "DiagnosePatient" "$OUT"
sleep 6
assert_status "Status after DiagnosePatient" "$PATIENT_ID" "DIAGNOSED"

# Step 4
log "Step 4: RequestLabTest (doctor → peer1)"
use_doctor
OUT=$(invoke "{\"function\":\"RequestLabTest\",\"Args\":[\"$PATIENT_ID\",\"[\\\"Blood Sugar\\\",\\\"HbA1c\\\"]\"]}")
assert_success "RequestLabTest" "$OUT"
sleep 6
assert_status "Status after RequestLabTest" "$PATIENT_ID" "LAB_REQUESTED"

# Step 5
log "Step 5: AcknowledgeLabRequest (labreceptionist → peer0.diagnostic)"
use_labreceptionist
OUT=$(invoke "{\"function\":\"AcknowledgeLabRequest\",\"Args\":[\"$PATIENT_ID\"]}")
assert_success "AcknowledgeLabRequest" "$OUT"
sleep 6
assert_status "Status after AcknowledgeLabRequest" "$PATIENT_ID" "LAB_ACKNOWLEDGED"

# Step 6
log "Step 6: SubmitLabResult (labtechnician → peer0.diagnostic)"
use_labtechnician
OUT=$(invoke "{\"function\":\"SubmitLabResult\",\"Args\":[\"$PATIENT_ID\",\"{\\\"Blood Sugar\\\":\\\"180mg/dL\\\",\\\"HbA1c\\\":\\\"7.2%\\\"}\",\"sha256:abc123\"]}")
assert_success "SubmitLabResult" "$OUT"
sleep 6
assert_status "Status after SubmitLabResult" "$PATIENT_ID" "LAB_COMPLETED"

# Step 7
log "Step 7: ApproveLabResult (labsupervisor → peer0.diagnostic)"
use_labsupervisor
OUT=$(invoke "{\"function\":\"ApproveLabResult\",\"Args\":[\"$PATIENT_ID\"]}")
assert_success "ApproveLabResult" "$OUT"
sleep 6
assert_status "Status after ApproveLabResult" "$PATIENT_ID" "LAB_APPROVED"

# Step 8
log "Step 8: ReviewLabAndPrescribe (doctor → peer1)"
use_doctor
OUT=$(invoke "{\"function\":\"ReviewLabAndPrescribe\",\"Args\":[\"$PATIENT_ID\",\"[\\\"Metformin 500mg\\\",\\\"Glipizide 5mg\\\"]\",\"Diabetes confirmed\"]}")
assert_success "ReviewLabAndPrescribe" "$OUT"
sleep 6
assert_status "Status after ReviewLabAndPrescribe" "$PATIENT_ID" "PRESCRIBED"

# Step 9
log "Step 9: AdministerTreatment (nurse → peer2)"
use_nurse
OUT=$(invoke "{\"function\":\"AdministerTreatment\",\"Args\":[\"$PATIENT_ID\",\"nurse\",\"Vitals stable, medication administered\"]}")
assert_success "AdministerTreatment" "$OUT"
sleep 6
assert_status "Status after AdministerTreatment" "$PATIENT_ID" "UNDER_TREATMENT"

# Step 10
log "Step 10: DispenseMedication (pharmacist → peer2)"
use_pharmacist
OUT=$(invoke "{\"function\":\"DispenseMedication\",\"Args\":[\"$PATIENT_ID\",\"Metformin 500mg x30, Glipizide 5mg x30 dispensed\"]}")
assert_success "DispenseMedication" "$OUT"
sleep 6
assert_status "Status after DispenseMedication" "$PATIENT_ID" "MEDICATION_DISPENSED"

# Step 11
log "Step 11: FinalizeRecord (medrecordofficer → peer1)"
use_medrecordofficer
OUT=$(invoke "{\"function\":\"FinalizeRecord\",\"Args\":[\"$PATIENT_ID\"]}")
assert_success "FinalizeRecord" "$OUT"
sleep 6
assert_status "Status after FinalizeRecord" "$PATIENT_ID" "RECORD_FINALIZED"

# Step 12
log "Step 12: SubmitClaim (billingofficer → peer0.provider)"
use_billingofficer
OUT=$(invoke "{\"function\":\"SubmitClaim\",\"Args\":[\"$PATIENT_ID\",\"CLM-001\",\"15000\"]}")
assert_success "SubmitClaim" "$OUT"
sleep 6
assert_status "Status after SubmitClaim" "$PATIENT_ID" "CLAIM_SUBMITTED"

# Step 13
log "Step 13: AuditClaim (claimsauditor → peer0.provider)"
use_claimsauditor
OUT=$(invoke "{\"function\":\"AuditClaim\",\"Args\":[\"$PATIENT_ID\",\"All documents verified\"]}")
assert_success "AuditClaim" "$OUT"
sleep 6
assert_status "Status after AuditClaim" "$PATIENT_ID" "CLAIM_UNDER_AUDIT"

# Step 14
log "Step 14: ProcessClaim (insuranceofficer → peer0.provider)"
use_insuranceofficer
OUT=$(invoke "{\"function\":\"ProcessClaim\",\"Args\":[\"$PATIENT_ID\",\"APPROVED\",\"Policy covers diabetes treatment\"]}")
assert_success "ProcessClaim" "$OUT"
sleep 6
assert_status "Status after ProcessClaim" "$PATIENT_ID" "CLAIM_APPROVED"

# Step 15
log "Step 15: DischargePatient (hospitaladmin → peer0)"
use_hospitaladmin
OUT=$(invoke "{\"function\":\"DischargePatient\",\"Args\":[\"$PATIENT_ID\",\"Patient recovered, discharged in stable condition\"]}")
assert_success "DischargePatient" "$OUT"
sleep 6
assert_status "Status after DischargePatient" "$PATIENT_ID" "DISCHARGED"

# ============================================================
# B. ACCESS CONTROL TESTS
# ============================================================

section "B. ACCESS CONTROL TESTS"

log "Testing role enforcement..."

use_doctor
OUT=$(invoke "{\"function\":\"RegisterPatient\",\"Args\":[\"PAT-HACK\",\"Hacker\",\"99\",\"M\",\"X\",\"000\",\"nowhere\"]}")
assert_denied "Doctor cannot RegisterPatient" "$OUT"

use_nurse
OUT=$(invoke "{\"function\":\"DiagnosePatient\",\"Args\":[\"$PATIENT_ID\",\"Fake\",\"Notes\"]}")
assert_denied "Nurse cannot DiagnosePatient" "$OUT"

use_labtechnician
OUT=$(invoke "{\"function\":\"RegisterPatient\",\"Args\":[\"PAT-HACK2\",\"Hacker\",\"99\",\"M\",\"X\",\"000\",\"nowhere\"]}")
assert_denied "Lab Technician cannot RegisterPatient" "$OUT"

use_insuranceofficer
OUT=$(invoke "{\"function\":\"DiagnosePatient\",\"Args\":[\"$PATIENT_ID\",\"Fake\",\"Notes\"]}")
assert_denied "Insurance Officer cannot DiagnosePatient" "$OUT"

use_billingofficer
OUT=$(invoke "{\"function\":\"AdministerTreatment\",\"Args\":[\"$PATIENT_ID\",\"nurse\",\"Notes\"]}")
assert_denied "Billing Officer cannot AdministerTreatment" "$OUT"

# ============================================================
# C. QUERY TESTS
# ============================================================

section "C. QUERY TESTS"

log "Testing query functions..."

use_hospitaladmin

# GetPatient
OUT=$(query "{\"function\":\"GetPatient\",\"Args\":[\"$PATIENT_ID\"]}")
if echo "$OUT" | jq -e '.status == "DISCHARGED"' > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} GetPatient returns correct data"
  PASS_COUNT=$(( PASS_COUNT + 1 ))
else
  echo -e "  ${RED}✗${NC} GetPatient failed"
  FAIL_COUNT=$(( FAIL_COUNT + 1 ))
fi

# GetPatientHistory
OUT=$(query "{\"function\":\"GetPatientHistory\",\"Args\":[\"$PATIENT_ID\"]}")
COUNT=$(echo "$OUT" | jq 'length' 2>/dev/null || echo 0)
if [ "$COUNT" -gt 10 ]; then
  echo -e "  ${GREEN}✓${NC} GetPatientHistory returns ${WHITE}$COUNT${NC} records"
  PASS_COUNT=$(( PASS_COUNT + 1 ))
else
  echo -e "  ${RED}✗${NC} GetPatientHistory returned only $COUNT records"
  FAIL_COUNT=$(( FAIL_COUNT + 1 ))
fi

# PatientExists true
OUT=$(query "{\"function\":\"PatientExists\",\"Args\":[\"$PATIENT_ID\"]}")
if echo "$OUT" | grep -q "true"; then
  echo -e "  ${GREEN}✓${NC} PatientExists → true for existing patient"
  PASS_COUNT=$(( PASS_COUNT + 1 ))
else
  echo -e "  ${RED}✗${NC} PatientExists true check failed"
  FAIL_COUNT=$(( FAIL_COUNT + 1 ))
fi

# PatientExists false
OUT=$(query "{\"function\":\"PatientExists\",\"Args\":[\"NONEXISTENT-999\"]}")
if echo "$OUT" | grep -q "false"; then
  echo -e "  ${GREEN}✓${NC} PatientExists → false for non-existent patient"
  PASS_COUNT=$(( PASS_COUNT + 1 ))
else
  echo -e "  ${RED}✗${NC} PatientExists false check failed"
  FAIL_COUNT=$(( FAIL_COUNT + 1 ))
fi

# ============================================================
# D. FINAL PATIENT RECORD
# ============================================================

section "D. FINAL PATIENT RECORD"

echo ""
log "Full record for $PATIENT_ID:"
echo ""
use_hospitaladmin
query "{\"function\":\"GetPatient\",\"Args\":[\"$PATIENT_ID\"]}" | jq .

# ============================================================
# SUMMARY
# ============================================================

TOTAL=$(( PASS_COUNT + FAIL_COUNT ))

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}  TEST SUMMARY${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "  Total  : ${WHITE}$TOTAL${NC}"
echo -e "  Passed : ${GREEN}$PASS_COUNT${NC}"
echo -e "  Failed : ${RED}$FAIL_COUNT${NC}"
echo ""
if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}  ✓ All tests passed!${NC}"
  echo -e "${GREEN}  ✓ Role-based access control verified.${NC}"
  echo -e "${GREEN}  ✓ Full journey REGISTERED → DISCHARGED complete.${NC}"
else
  echo -e "${RED}  ✗ $FAIL_COUNT test(s) failed. Check output above.${NC}"
fi
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

exit $FAIL_COUNT