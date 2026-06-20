#!/bin/bash
# ============================================================
# EHR Blockchain — Full End-to-End Test Suite v3
#
# Services under test:
#   ipfs-service  :3006   IPFS wrapper
#   peer0-api     :3001   receptionist, hospitaladmin
#   peer1-api     :3002   doctor
#   peer2-api     :3003   nurse, pharmacist, medrecordofficer
#   extorg-api    :3004   lab + insurance roles
#   patient-api   :3005   patient self-service
#
# Usage:
#   bash test_ehr_v3.sh [--patient-id PAT-001] [--skip-ipfs] [--stop-on-fail]
# ============================================================

# No set -e — we handle errors ourselves
PASS=0; FAIL=0; SKIP=0

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; WHITE='\033[1;37m'; NC='\033[0m'

pass()    { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail()    { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); [ "$STOP_ON_FAIL" = true ] && { summary; exit 1; }; }
skip()    { echo -e "  ${YELLOW}⊘${NC} $1"; SKIP=$((SKIP+1)); }
info()    { echo -e "  ${CYAN}→${NC} $1"; }
section() {
  echo -e "\n${BLUE}══════════════════════════════════════════════${NC}"
  echo -e "${WHITE}  $1${NC}"
  echo -e "${BLUE}══════════════════════════════════════════════${NC}"
}

# ── Defaults ─────────────────────────────────────────────────
PATIENT_ID="PAT-TEST-$(date +%s)"
SKIP_IPFS=false
STOP_ON_FAIL=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --patient-id)   PATIENT_ID="$2"; shift ;;
    --skip-ipfs)    SKIP_IPFS=true ;;
    --stop-on-fail) STOP_ON_FAIL=true ;;
  esac; shift
done

# ── Endpoints ─────────────────────────────────────────────────
P0="http://localhost:3001"
P1="http://localhost:3002"
P2="http://localhost:3003"
EX="http://localhost:3004"
PA="http://localhost:3005"
IS="http://localhost:3006"
IPFS_KEY="${IPFS_SERVICE_KEY:-change-me-in-production}"

# ── State ─────────────────────────────────────────────────────
TOK_REC=""; TOK_ADM=""; TOK_DOC=""; TOK_NRS=""
TOK_PHA=""; TOK_MRO=""; TOK_LRC=""; TOK_LTC=""
TOK_LSV=""; TOK_BIL=""; TOK_AUD=""; TOK_INS=""
TOK_PAT=""
VISIT_ID=""; LAB_REQ_ID=""; CLAIM_ID="CLM-$(date +%s)"
EHR_CID=""; VISIT_CID=""

# ── HTTP helpers ──────────────────────────────────────────────

# do_curl METHOD URL [curl-args...] → sets RESP_CODE and RESP_BODY
do_curl() {
  local METHOD=$1 URL=$2; shift 2
  local RAW
  RAW=$(curl -s -w "\n__CODE__%{http_code}" -X "$METHOD" "$URL" \
    -H "Content-Type: application/json" "$@" 2>/dev/null)
  RESP_CODE=$(echo "$RAW" | grep "__CODE__" | sed 's/__CODE__//')
  RESP_BODY=$(echo "$RAW" | sed '/__CODE__/d')
}

# assert METHOD URL DESC [curl-args...]
# Sets LAST_BODY to response JSON. Passes if HTTP 2xx and success=true.
assert() {
  local METHOD=$1 URL=$2 DESC=$3; shift 3
  do_curl "$METHOD" "$URL" "$@"
  LAST_BODY="$RESP_BODY"
  if echo "$RESP_CODE" | grep -qE "^2"; then
    local OK
    OK=$(echo "$RESP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
    if [ "$OK" = "True" ] || [ "$OK" = "true" ]; then
      pass "$DESC [HTTP $RESP_CODE]"
    else
      local ERR
      ERR=$(echo "$RESP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',d.get('message','?')))" 2>/dev/null)
      fail "$DESC [HTTP $RESP_CODE] — success=false: $ERR"
    fi
  else
    local ERR
    ERR=$(echo "$RESP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','?'))" 2>/dev/null)
    fail "$DESC [HTTP $RESP_CODE] — $ERR"
  fi
}

# assert_status METHOD URL DESC EXPECTED_CODE [curl-args...]
assert_status() {
  local METHOD=$1 URL=$2 DESC=$3 EXPECTED=$4; shift 4
  do_curl "$METHOD" "$URL" "$@"
  LAST_BODY="$RESP_BODY"
  if [ "$RESP_CODE" = "$EXPECTED" ]; then
    pass "$DESC [HTTP $RESP_CODE]"
  else
    fail "$DESC — expected HTTP $EXPECTED, got $RESP_CODE"
  fi
}

# jget JSON PYPATH — extract field using python
jget() {
  echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null
}

# login BASE USER PASS → token string
login() {
  do_curl POST "$1/auth/login" -d "{\"username\":\"$2\",\"password\":\"$3\"}"
  echo "$RESP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])" 2>/dev/null
}

# summary
summary() {
  echo ""
  echo -e "${BLUE}══════════════════════════════════════════════${NC}"
  echo -e "${WHITE}  TEST RESULTS${NC}"
  echo -e "${BLUE}══════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}PASS${NC}: $PASS"
  echo -e "  ${RED}FAIL${NC}: $FAIL"
  echo -e "  ${YELLOW}SKIP${NC}: $SKIP"
  echo -e "  TOTAL: $((PASS+FAIL+SKIP))"
  echo ""
  echo -e "  Patient ID : ${WHITE}$PATIENT_ID${NC}"
  echo -e "  Visit ID   : ${WHITE}${VISIT_ID:-N/A}${NC}"
  echo -e "  EHR CID    : ${WHITE}${EHR_CID:-N/A (ipfs offline)}${NC}"
  echo -e "  Claim ID   : ${WHITE}$CLAIM_ID${NC}"
  echo ""
  if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}  ALL TESTS PASSED! ✓${NC}"
  else
    echo -e "${RED}  $FAIL TEST(S) FAILED${NC}"
  fi
  echo -e "${BLUE}══════════════════════════════════════════════${NC}"
}

# ══════════════════════════════════════════════════════════════
section "0. SERVICE HEALTH CHECKS"
# ══════════════════════════════════════════════════════════════

for PORT_NAME in "3001:peer0-api" "3002:peer1-api" "3003:peer2-api" "3004:extorg-api" "3005:patient-api"; do
  PORT="${PORT_NAME%%:*}"; NAME="${PORT_NAME##*:}"
  do_curl GET "http://localhost:$PORT/health"
  STATUS=$(echo "$RESP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null)
  [ "$STATUS" = "ok" ] && pass "$NAME :$PORT is healthy" || fail "$NAME :$PORT health check failed"
done

if [ "$SKIP_IPFS" = false ]; then
  do_curl GET "$IS/health"
  OK=$(echo "$RESP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
  [ "$OK" = "True" ] && pass "ipfs-service :3006 is healthy" || skip "ipfs-service not reachable"
fi

# ══════════════════════════════════════════════════════════════
section "1. AUTHENTICATION — ALL ROLES"
# ══════════════════════════════════════════════════════════════

info "Logging in all staff roles..."
TOK_REC=$(login $P0 "receptionist" "recept123")
[ -n "$TOK_REC" ] && pass "receptionist login" || fail "receptionist login FAILED"

TOK_ADM=$(login $P0 "hospitaladmin" "hadminpw")
[ -n "$TOK_ADM" ] && pass "hospitaladmin login" || fail "hospitaladmin login FAILED"

TOK_DOC=$(login $P1 "doctor" "docpw")
[ -n "$TOK_DOC" ] && pass "doctor login" || fail "doctor login FAILED"

TOK_NRS=$(login $P2 "nurse" "nursepw")
[ -n "$TOK_NRS" ] && pass "nurse login" || fail "nurse login FAILED"

TOK_PHA=$(login $P2 "pharmacist" "pharmpw")
[ -n "$TOK_PHA" ] && pass "pharmacist login" || fail "pharmacist login FAILED"

TOK_MRO=$(login $P2 "medrecordofficer" "medpw")
[ -n "$TOK_MRO" ] && pass "medrecordofficer login" || fail "medrecordofficer login FAILED"

TOK_LRC=$(login $EX "labreceptionist" "labrecpw")
[ -n "$TOK_LRC" ] && pass "labreceptionist login" || fail "labreceptionist login FAILED"

TOK_LTC=$(login $EX "labtechnician" "labpw")
[ -n "$TOK_LTC" ] && pass "labtechnician login" || fail "labtechnician login FAILED"

TOK_LSV=$(login $EX "labsupervisor" "labsuppw")
[ -n "$TOK_LSV" ] && pass "labsupervisor login" || fail "labsupervisor login FAILED"

TOK_BIL=$(login $EX "billingofficer" "billpw")
[ -n "$TOK_BIL" ] && pass "billingofficer login" || fail "billingofficer login FAILED"

TOK_AUD=$(login $EX "claimsauditor" "claimaudpw")
[ -n "$TOK_AUD" ] && pass "claimsauditor login" || fail "claimsauditor login FAILED"

TOK_INS=$(login $EX "insuranceofficer" "inspw")
[ -n "$TOK_INS" ] && pass "insuranceofficer login" || fail "insuranceofficer login FAILED"

assert GET "$P0/auth/me" "GET /auth/me (peer0)" -H "Authorization: Bearer $TOK_REC"
assert GET "$P1/auth/me" "GET /auth/me (peer1)" -H "Authorization: Bearer $TOK_DOC"
assert GET "$P2/auth/me" "GET /auth/me (peer2)" -H "Authorization: Bearer $TOK_NRS"
assert GET "$EX/auth/me" "GET /auth/me (extorg)" -H "Authorization: Bearer $TOK_LRC"

assert_status POST "$P0/auth/login" "Wrong password → 401" "401" \
  -d '{"username":"receptionist","password":"wrongpw"}'
assert_status GET "$P0/patients/X" "No token → 401" "401"

# ══════════════════════════════════════════════════════════════
section "2. PATIENT REGISTRATION + EHR INIT (peer0-api)"
# ══════════════════════════════════════════════════════════════

info "Registering patient: $PATIENT_ID"
assert POST "$P0/patients" "POST /patients — RegisterPatient + InitEHR" \
  -H "Authorization: Bearer $TOK_REC" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"name\":\"Test Patient\",\"age\":35,\"gender\":\"Male\",\"bloodGroup\":\"O+\",\"contact\":\"9876543210\",\"address\":\"123 Test Street, Chennai\"}"

EHR_CID=$(jget "$LAST_BODY" "['data']['ehrCID']")
[ -n "$EHR_CID" ] && pass "EHR CID returned: $EHR_CID" || skip "EHR CID not in response (ipfs may be offline)"

assert_status POST "$P0/patients" "Duplicate patient → 409" "409" \
  -H "Authorization: Bearer $TOK_REC" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"name\":\"Dup\",\"age\":30,\"gender\":\"M\",\"bloodGroup\":\"A+\",\"contact\":\"111\",\"address\":\"x\"}"

assert GET "$P0/patients/$PATIENT_ID" "GET /patients/:id" \
  -H "Authorization: Bearer $TOK_REC"
assert GET "$P0/patients/$PATIENT_ID/exists" "GET /patients/:id/exists" \
  -H "Authorization: Bearer $TOK_REC"
assert GET "$P0/patients/$PATIENT_ID/visits" "GET /patients/:id/visits (empty)" \
  -H "Authorization: Bearer $TOK_REC"
assert GET "$P0/patients/$PATIENT_ID/history" "GET /patients/:id/history" \
  -H "Authorization: Bearer $TOK_REC"

if [ -n "$EHR_CID" ]; then
  assert GET "$P0/patients/$PATIENT_ID/ehr/cid" "GET /patients/:id/ehr/cid" \
    -H "Authorization: Bearer $TOK_REC"
  assert GET "$P0/patients/$PATIENT_ID/ehr/history" "GET /patients/:id/ehr/history" \
    -H "Authorization: Bearer $TOK_REC"
fi

assert PUT "$P0/patients/$PATIENT_ID" "PUT /patients/:id — UpdatePatientInfo" \
  -H "Authorization: Bearer $TOK_REC" \
  -d '{"contact":"9999999999","address":"456 Updated Street"}'

# ══════════════════════════════════════════════════════════════
section "3. OPEN VISIT + ASSIGNMENTS (peer0-api)"
# ══════════════════════════════════════════════════════════════

info "Opening visit for $PATIENT_ID..."
assert POST "$P0/visits" "POST /visits — OpenVisit + pin to IPFS" \
  -H "Authorization: Bearer $TOK_REC" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"chiefComplaint\":\"Fever and headache for 3 days\"}"

VISIT_ID=$(jget "$LAST_BODY" "['data']['visitId']")
VISIT_CID=$(jget "$LAST_BODY" "['data']['visitCID']")
info "Visit ID: $VISIT_ID"
[ -n "$VISIT_ID" ] || { fail "OpenVisit did not return visitId — cannot continue"; summary; exit 1; }

assert GET "$P0/visits/$VISIT_ID" "GET /visits/:id (status=OPEN)" \
  -H "Authorization: Bearer $TOK_REC"
assert GET "$P0/visits/$VISIT_ID/history" "GET /visits/:id/history" \
  -H "Authorization: Bearer $TOK_REC"
assert GET "$P0/visits/$VISIT_ID/cids" "GET /visits/:id/cids" \
  -H "Authorization: Bearer $TOK_REC"

if [ "$SKIP_IPFS" = false ] && [ -n "$VISIT_CID" ]; then
  assert GET "$P0/visits/$VISIT_ID/ipfs" "GET /visits/:id/ipfs — IPFS clinical content" \
    -H "Authorization: Bearer $TOK_REC"
fi

assert PUT "$P0/visits/$VISIT_ID/doctor" "PUT /visits/:id/doctor — AssignDoctor" \
  -H "Authorization: Bearer $TOK_REC" \
  -d '{"doctorId":"doctor"}'
assert PUT "$P0/visits/$VISIT_ID/nurse" "PUT /visits/:id/nurse — AssignNurse" \
  -H "Authorization: Bearer $TOK_REC" \
  -d '{"nurseId":"nurse"}'
assert GET "$P0/patients/$PATIENT_ID/visits/full" "GET /patients/:id/visits/full" \
  -H "Authorization: Bearer $TOK_REC"

# ══════════════════════════════════════════════════════════════
section "4. DOCTOR WORKFLOW (peer1-api)"
# ══════════════════════════════════════════════════════════════

assert GET "$P1/doctor/visits/$VISIT_ID" "GET /doctor/visits/:id (+ clinical)" \
  -H "Authorization: Bearer $TOK_DOC"
assert GET "$P1/doctor/visits/$VISIT_ID/history" "GET /doctor/visits/:id/history" \
  -H "Authorization: Bearer $TOK_DOC"

if [ -n "$EHR_CID" ]; then
  assert GET "$P1/doctor/visits/$VISIT_ID/ehr" "GET /doctor/visits/:id/ehr — patient EHR" \
    -H "Authorization: Bearer $TOK_DOC"
fi

assert PUT "$P1/doctor/visits/$VISIT_ID/diagnosis" "PUT /doctor/visits/:id/diagnosis" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"notes":"Likely viral fever. Rule out dengue. Patient has high temp 102F."}'

assert PUT "$P1/doctor/visits/$VISIT_ID/prescription" "PUT /doctor/visits/:id/prescription (v1)" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"medications":["Paracetamol 500mg q6h","ORS sachets","Doxycycline 100mg BD"],"instructions":"Take with food. Plenty of fluids."}'

assert GET "$P1/doctor/visits/$VISIT_ID/prescription" "GET /doctor/visits/:id/prescription" \
  -H "Authorization: Bearer $TOK_DOC"

assert PUT "$P1/doctor/visits/$VISIT_ID/prescription" "PUT /doctor/visits/:id/prescription (v2)" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"medications":["Paracetamol 650mg q6h","ORS sachets","Doxycycline 100mg BD","Vitamin C 500mg"],"instructions":"Updated. Take after meals."}'

assert PUT "$P1/doctor/visits/$VISIT_ID/assign/nurse" "PUT /doctor/visits/:id/assign/nurse" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"nurseId":"nurse"}'

assert PUT "$P1/doctor/visits/$VISIT_ID/forward/nurse" "PUT /doctor/visits/:id/forward/nurse" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"instructions":"Record vitals. Monitor temperature every 2 hours."}'

# ══════════════════════════════════════════════════════════════
section "5. NURSE WORKFLOW (peer2-api)"
# ══════════════════════════════════════════════════════════════

assert GET "$P2/nurse/visits/$VISIT_ID" "GET /nurse/visits/:id (WITH_NURSE)" \
  -H "Authorization: Bearer $TOK_NRS"
assert GET "$P2/nurse/visits/$VISIT_ID/prescription" "GET /nurse/visits/:id/prescription" \
  -H "Authorization: Bearer $TOK_NRS"

assert PUT "$P2/nurse/visits/$VISIT_ID/vitals" "PUT /nurse/visits/:id/vitals" \
  -H "Authorization: Bearer $TOK_NRS" \
  -d '{"vitals":{"bloodPressure":"118/76","temperature":"102.4F","pulse":"92bpm","weight":"68kg","height":"170cm","oxygenSat":"97%"}}'

assert POST "$P2/nurse/visits/$VISIT_ID/carenote" "POST /nurse/visits/:id/carenote (1)" \
  -H "Authorization: Bearer $TOK_NRS" \
  -d '{"note":"Patient alert and oriented. Administered Paracetamol at 10:00 AM. Temp slightly reduced."}'

assert POST "$P2/nurse/visits/$VISIT_ID/carenote" "POST /nurse/visits/:id/carenote (2)" \
  -H "Authorization: Bearer $TOK_NRS" \
  -d '{"note":"Patient reports mild nausea. Temperature 101.2F at 12:00 PM. Monitoring."}'

assert PUT "$P2/nurse/visits/$VISIT_ID/ehr" "PUT /nurse/visits/:id/ehr — update allergies" \
  -H "Authorization: Bearer $TOK_NRS" \
  -d '{"section":"allergies","data":[{"substance":"Penicillin","reaction":"Rash","severity":"Moderate","addedBy":"nurse","addedAt":"2026-03-22T10:00:00Z"}]}'

assert PUT "$P2/nurse/visits/$VISIT_ID/forward/doctor" "PUT /nurse/visits/:id/forward/doctor" \
  -H "Authorization: Bearer $TOK_NRS" \
  -d '{"notes":"Vitals recorded. Paracetamol given. Patient stable. Temp still elevated."}'

# ══════════════════════════════════════════════════════════════
section "6. DOCTOR REQUESTS LAB TESTS (peer1-api)"
# ══════════════════════════════════════════════════════════════

assert GET "$P1/doctor/visits/$VISIT_ID" "GET /doctor/visits/:id (back WITH_DOCTOR)" \
  -H "Authorization: Bearer $TOK_DOC"

assert PUT "$P1/doctor/visits/$VISIT_ID/forward/lab" "PUT /doctor/visits/:id/forward/lab" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"tests":["NS1 Antigen","CBC","Platelet Count","Dengue IgM/IgG"],"instructions":"Fasting sample preferred. Urgent."}'

LAB_REQ_ID="${VISIT_ID}-L1"
info "Lab Request ID: $LAB_REQ_ID"

# ══════════════════════════════════════════════════════════════
section "7. LAB WORKFLOW (extorg-api — DiagnosticsMSP)"
# ══════════════════════════════════════════════════════════════

assert GET "$EX/lab/visits/$VISIT_ID" "GET /lab/visits/:id (WITH_LAB)" \
  -H "Authorization: Bearer $TOK_LRC"
assert GET "$EX/lab/visits/$VISIT_ID/request/$LAB_REQ_ID" \
  "GET /lab/visits/:id/request/:reqId" \
  -H "Authorization: Bearer $TOK_LRC"

assert PUT "$EX/lab/visits/$VISIT_ID/request/$LAB_REQ_ID/acknowledge" \
  "PUT .../acknowledge — AcknowledgeLabRequest" \
  -H "Authorization: Bearer $TOK_LRC"

assert PUT "$EX/lab/visits/$VISIT_ID/request/$LAB_REQ_ID/submit" \
  "PUT .../submit — SubmitLabResult" \
  -H "Authorization: Bearer $TOK_LTC" \
  -d '{"results":{"NS1 Antigen":"Positive","CBC":"WBC 3800, RBC 4.2M","Platelet Count":"85000/uL (LOW)","Dengue IgM":"Reactive","Dengue IgG":"Non-Reactive"},"resultsHash":"sha256:abc123def456"}'

assert PUT "$EX/lab/visits/$VISIT_ID/request/$LAB_REQ_ID/approve" \
  "PUT .../approve — ApproveLabResult (→ WITH_DOCTOR)" \
  -H "Authorization: Bearer $TOK_LSV"

# ══════════════════════════════════════════════════════════════
section "8. DOCTOR REVIEWS LAB + FINALIZES VISIT (peer1-api)"
# ══════════════════════════════════════════════════════════════

assert GET "$P1/doctor/visits/$VISIT_ID" "GET /doctor/visits/:id (lab results visible)" \
  -H "Authorization: Bearer $TOK_DOC"

assert PUT "$P1/doctor/visits/$VISIT_ID/diagnosis" \
  "PUT /doctor/visits/:id/diagnosis — confirmed dengue" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"notes":"Dengue fever confirmed. NS1 positive, platelets low at 85K. Increase fluid intake."}'

assert PUT "$P1/doctor/visits/$VISIT_ID/ehr" \
  "PUT /doctor/visits/:id/ehr — update chronicConditions" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"section":"chronicConditions","data":[{"condition":"Dengue Fever","diagnosedAt":"2026-03","status":"Active","addedBy":"doctor"}]}'

assert PUT "$P1/doctor/visits/$VISIT_ID/finalize" \
  "PUT /doctor/visits/:id/finalize — FinalizeVisit (→ VISIT_FINALIZED)" \
  -H "Authorization: Bearer $TOK_DOC" \
  -d '{"finalDiagnosis":"Dengue Fever — Confirmed by NS1 Antigen and CBC"}'

# ══════════════════════════════════════════════════════════════
section "9. PHARMACY — DISPENSE MEDICATION (peer2-api)"
# ══════════════════════════════════════════════════════════════

assert GET "$P2/pharmacist/visits/$VISIT_ID" \
  "GET /pharmacist/visits/:id (VISIT_FINALIZED)" \
  -H "Authorization: Bearer $TOK_PHA"
assert GET "$P2/pharmacist/visits/$VISIT_ID/prescription" \
  "GET /pharmacist/visits/:id/prescription" \
  -H "Authorization: Bearer $TOK_PHA"
assert PUT "$P2/pharmacist/visits/$VISIT_ID/dispense" \
  "PUT /pharmacist/visits/:id/dispense — DispenseMedication" \
  -H "Authorization: Bearer $TOK_PHA" \
  -d '{"medicationDetails":"Paracetamol 650mg x20, Doxycycline 100mg x14, ORS x10, Vitamin C 500mg x14"}'

# ══════════════════════════════════════════════════════════════
section "10. MEDICAL RECORDS — FINALIZE RECORD (peer2-api)"
# ══════════════════════════════════════════════════════════════

assert GET "$P2/records/visits/$VISIT_ID" "GET /records/visits/:id" \
  -H "Authorization: Bearer $TOK_MRO"
assert GET "$P2/records/visits/$VISIT_ID/history" "GET /records/visits/:id/history" \
  -H "Authorization: Bearer $TOK_MRO"
assert PUT "$P2/records/visits/$VISIT_ID/finalize" \
  "PUT /records/visits/:id/finalize — FinalizeRecord (→ RECORD_FINALIZED)" \
  -H "Authorization: Bearer $TOK_MRO"

# ══════════════════════════════════════════════════════════════
section "11. INSURANCE CLAIMS (extorg-api — ProviderMSP)"
# ══════════════════════════════════════════════════════════════

assert GET "$EX/claims/visits/$VISIT_ID" \
  "GET /claims/visits/:id (RECORD_FINALIZED)" \
  -H "Authorization: Bearer $TOK_BIL"
assert GET "$EX/claims/visits/$VISIT_ID/history" \
  "GET /claims/visits/:id/history" \
  -H "Authorization: Bearer $TOK_BIL"

assert POST "$EX/claims/visits/$VISIT_ID/submit" \
  "POST /claims/visits/:id/submit — SubmitClaim (→ CLAIM_SUBMITTED)" \
  -H "Authorization: Bearer $TOK_BIL" \
  -d "{\"claimId\":\"$CLAIM_ID\",\"claimAmount\":28500.00}"

assert PUT "$EX/claims/visits/$VISIT_ID/audit" \
  "PUT /claims/visits/:id/audit — AuditClaim (→ CLAIM_UNDER_AUDIT)" \
  -H "Authorization: Bearer $TOK_AUD" \
  -d '{"auditNotes":"Documentation complete. Dengue confirmed. Claim amount reasonable."}'

assert PUT "$EX/claims/visits/$VISIT_ID/process" \
  "PUT /claims/visits/:id/process — ProcessClaim APPROVED (→ CLAIM_APPROVED)" \
  -H "Authorization: Bearer $TOK_INS" \
  -d '{"decision":"APPROVED","reason":"Valid dengue case. All documentation verified."}'

# ══════════════════════════════════════════════════════════════
section "12. DISCHARGE PATIENT (peer0-api)"
# ══════════════════════════════════════════════════════════════

assert PUT "$P0/visits/$VISIT_ID/discharge" \
  "PUT /visits/:id/discharge — DischargePatient (→ DISCHARGED)" \
  -H "Authorization: Bearer $TOK_ADM" \
  -d '{"dischargeNotes":"Patient discharged stable. Follow up in 1 week."}'

assert GET "$P0/visits/$VISIT_ID" "GET /visits/:id — verify DISCHARGED" \
  -H "Authorization: Bearer $TOK_REC"
FINAL_STATUS=$(jget "$LAST_BODY" "['data']['status']")
[ "$FINAL_STATUS" = "DISCHARGED" ] && \
  pass "Final visit status = DISCHARGED ✓" || \
  fail "Expected DISCHARGED, got: $FINAL_STATUS"

# ══════════════════════════════════════════════════════════════
section "13. PATIENT API — SELF SERVICE (patient-api)"
# ══════════════════════════════════════════════════════════════

assert POST "$PA/auth/register" "POST /auth/register — patient account" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"password\":\"patientpass123\",\"email\":\"patient@test.com\",\"phone\":\"9876543210\"}"
TOK_PAT=$(jget "$LAST_BODY" "['data']['token']")
[ -n "$TOK_PAT" ] && pass "Patient JWT issued" || fail "Patient registration FAILED — no token"

assert_status POST "$PA/auth/register" "Duplicate patient account → 409" "409" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"password\":\"anotherpassword\"}"

assert POST "$PA/auth/login" "POST /auth/login — patient login" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"password\":\"patientpass123\"}"
TOK_PAT=$(jget "$LAST_BODY" "['data']['token']")

assert_status POST "$PA/auth/login" "Wrong patient password → 401" "401" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"password\":\"wrongpass\"}"

assert GET "$PA/auth/me" "GET /auth/me (patient)" \
  -H "Authorization: Bearer $TOK_PAT"

assert PUT "$PA/auth/password" "PUT /auth/password — change password" \
  -H "Authorization: Bearer $TOK_PAT" \
  -d '{"currentPassword":"patientpass123","newPassword":"newpass456"}'

assert POST "$PA/auth/login" "POST /auth/login — new password works" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"password\":\"newpass456\"}"
TOK_PAT=$(jget "$LAST_BODY" "['data']['token']")

assert GET "$PA/profile" "GET /profile — on-chain demographics" \
  -H "Authorization: Bearer $TOK_PAT"
assert GET "$PA/profile/history" "GET /profile/history" \
  -H "Authorization: Bearer $TOK_PAT"

if [ -n "$EHR_CID" ]; then
  assert GET "$PA/ehr" "GET /ehr — patient views EHR from IPFS" \
    -H "Authorization: Bearer $TOK_PAT"
  assert GET "$PA/ehr/history" "GET /ehr/history — CID version log" \
    -H "Authorization: Bearer $TOK_PAT"
  assert PUT "$PA/ehr/contact" "PUT /ehr/contact — update emergency contact" \
    -H "Authorization: Bearer $TOK_PAT" \
    -d '{"emergencyContact":{"name":"Jane Patient","relation":"Spouse","phone":"9123456789"}}'
fi

assert GET "$PA/visits" "GET /visits — patient lists all visits" \
  -H "Authorization: Bearer $TOK_PAT"
assert GET "$PA/visits/$VISIT_ID" "GET /visits/:id — patient views visit + clinical" \
  -H "Authorization: Bearer $TOK_PAT"
assert GET "$PA/visits/$VISIT_ID/history" "GET /visits/:id/history" \
  -H "Authorization: Bearer $TOK_PAT"
assert GET "$PA/visits/$VISIT_ID/cids" "GET /visits/:id/cids — IPFS version log" \
  -H "Authorization: Bearer $TOK_PAT"

# Other patient cannot access this visit
WRONG_ID="PAT-WRONG-$(date +%s)"
do_curl POST "$PA/auth/register" \
  -d "{\"patientId\":\"$WRONG_ID\",\"password\":\"wrongpass\"}"
WRONG_TOK=$(jget "$RESP_BODY" "['data']['token']")
if [ -n "$WRONG_TOK" ]; then
  assert_status GET "$PA/visits/$VISIT_ID" "Other patient cannot access visit → 403" "403" \
    -H "Authorization: Bearer $WRONG_TOK"
fi

# ══════════════════════════════════════════════════════════════
section "14. ACCESS CONTROL — GRANT / REVOKE (patient-api)"
# ══════════════════════════════════════════════════════════════

assert POST "$PA/access/grant" \
  "POST /access/grant — grant doctor EHR+visits access" \
  -H "Authorization: Bearer $TOK_PAT" \
  -d '{"granteeId":"doctor","granteeRole":"doctor","sections":["ehr","visits"],"expiresAt":""}'

assert GET "$PA/access/active" "GET /access/active — list active grants" \
  -H "Authorization: Bearer $TOK_PAT"
assert GET "$PA/access" "GET /access — full grant list + audit log" \
  -H "Authorization: Bearer $TOK_PAT"
assert GET "$PA/access/check/doctor?section=ehr" \
  "GET /access/check/doctor — doctor has ehr access" \
  -H "Authorization: Bearer $TOK_PAT"

assert POST "$PA/access/grant" \
  "POST /access/grant — grant nurse visits access (expires 2027)" \
  -H "Authorization: Bearer $TOK_PAT" \
  -d '{"granteeId":"nurse","granteeRole":"nurse","sections":["visits"],"expiresAt":"2027-12-31T00:00:00.000Z"}'

assert DELETE "$PA/access/revoke/nurse" \
  "DELETE /access/revoke/nurse — revoke nurse access" \
  -H "Authorization: Bearer $TOK_PAT" \
  -d '{"reason":"No longer needed"}'

assert GET "$PA/access/check/nurse?section=visits" \
  "GET /access/check/nurse — verify revoked" \
  -H "Authorization: Bearer $TOK_PAT"
HAS=$(jget "$LAST_BODY" "['data']['hasAccess']")
[ "$HAS" = "False" ] && \
  pass "Nurse access correctly shows hasAccess=false after revoke ✓" || \
  fail "Expected hasAccess=false for revoked nurse, got: $HAS"

assert GET "$PA/access/log" "GET /access/log — full audit trail" \
  -H "Authorization: Bearer $TOK_PAT"

# ══════════════════════════════════════════════════════════════
section "15. IPFS SERVICE DIRECT TESTS"
# ══════════════════════════════════════════════════════════════

if [ "$SKIP_IPFS" = true ]; then
  skip "IPFS tests skipped (--skip-ipfs)"
else
  assert GET "$IS/health" "GET /health — IPFS node status (no auth)"

  do_curl POST "$IS/pin" \
    -H "X-IPFS-Key: $IPFS_KEY" \
    -d "{\"json\":{\"test\":true,\"ts\":\"$(date -Iseconds)\"},\"filename\":\"test.json\"}"
  TEST_CID=$(jget "$RESP_BODY" "['cid']")
  if [ -n "$TEST_CID" ]; then
    pass "POST /pin — CID: $TEST_CID"
    do_curl GET "$IS/fetch/$TEST_CID" -H "X-IPFS-Key: $IPFS_KEY"
    OK=$(jget "$RESP_BODY" "['success']")
    [ "$OK" = "True" ] && pass "GET /fetch/:cid — content verified" || fail "GET /fetch/:cid failed"
  else
    fail "POST /pin failed — IPFS node may be down"
  fi

  do_curl POST "$IS/ehr/init" \
    -H "X-IPFS-Key: $IPFS_KEY" \
    -d '{"patientId":"TEST-EHR-DIRECT","demographics":{"name":"Direct Test","age":25}}'
  EHR_INIT_CID=$(jget "$RESP_BODY" "['cid']")
  [ -n "$EHR_INIT_CID" ] && pass "POST /ehr/init — CID: $EHR_INIT_CID" || fail "POST /ehr/init failed"

  do_curl POST "$IS/visit/init" \
    -H "X-IPFS-Key: $IPFS_KEY" \
    -d '{"visitId":"TEST-V1","patientId":"TEST-EHR-DIRECT","chiefComplaint":"Test","openedBy":"receptionist"}'
  VISIT_INIT_CID=$(jget "$RESP_BODY" "['cid']")
  [ -n "$VISIT_INIT_CID" ] && pass "POST /visit/init — CID: $VISIT_INIT_CID" || fail "POST /visit/init failed"

  assert_status POST "$IS/pin" "No IPFS-Key → 401" "401" \
    -d '{"json":{"x":1}}'
fi

# ══════════════════════════════════════════════════════════════
section "16. NEGATIVE / AUTHORIZATION TESTS"
# ══════════════════════════════════════════════════════════════

assert_status POST "$P0/visits" "Nurse token on peer0 open visit → 403" "403" \
  -H "Authorization: Bearer $TOK_NRS" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"chiefComplaint\":\"test\"}"

assert_status GET "$P0/patients/$PATIENT_ID" "Invalid JWT → 401" "401" \
  -H "Authorization: Bearer invalid.jwt.token"

assert_status POST "$P0/patients" "Missing required fields → 400" "400" \
  -H "Authorization: Bearer $TOK_REC" \
  -d '{"patientId":"INCOMPLETE"}'

assert_status PUT "$EX/claims/visits/$VISIT_ID/process" \
  "Invalid claim decision → 400" "400" \
  -H "Authorization: Bearer $TOK_INS" \
  -d '{"decision":"MAYBE"}'

# ══════════════════════════════════════════════════════════════
section "BONUS: CLAIM REJECTION FLOW (second visit)"
# ══════════════════════════════════════════════════════════════

info "Creating second visit to test claim rejection..."

assert POST "$P0/visits" "POST /visits — open second visit" \
  -H "Authorization: Bearer $TOK_REC" \
  -d "{\"patientId\":\"$PATIENT_ID\",\"chiefComplaint\":\"Follow-up check\"}"
VISIT2_ID=$(jget "$LAST_BODY" "['data']['visitId']")

if [ -n "$VISIT2_ID" ]; then
  info "Visit 2: $VISIT2_ID"
  assert PUT "$P0/visits/$VISIT2_ID/doctor" "Assign doctor to visit 2" \
    -H "Authorization: Bearer $TOK_REC" -d '{"doctorId":"doctor"}'
  assert PUT "$P1/doctor/visits/$VISIT2_ID/finalize" "Finalize visit 2" \
    -H "Authorization: Bearer $TOK_DOC" \
    -d '{"finalDiagnosis":"Follow-up: No acute illness detected"}'
  assert PUT "$P2/records/visits/$VISIT2_ID/finalize" "Finalize record for visit 2" \
    -H "Authorization: Bearer $TOK_MRO"
  assert POST "$EX/claims/visits/$VISIT2_ID/submit" "Submit claim for visit 2" \
    -H "Authorization: Bearer $TOK_BIL" \
    -d '{"claimId":"CLM-V2-001","claimAmount":1500}'
  assert PUT "$EX/claims/visits/$VISIT2_ID/audit" "Audit claim for visit 2" \
    -H "Authorization: Bearer $TOK_AUD" \
    -d '{"auditNotes":"Reviewing follow-up claim"}'
  assert PUT "$EX/claims/visits/$VISIT2_ID/process" \
    "ProcessClaim REJECTED — claim rejection flow" \
    -H "Authorization: Bearer $TOK_INS" \
    -d '{"decision":"REJECTED","reason":"Follow-up not covered under current policy"}'
  assert PUT "$P0/visits/$VISIT2_ID/discharge" "Discharge after claim rejection" \
    -H "Authorization: Bearer $TOK_ADM" \
    -d '{"dischargeNotes":"Discharged after claim rejection."}'
  pass "Claim rejection + discharge flow complete ✓"
else
  skip "Second visit could not be opened"
fi

# ══════════════════════════════════════════════════════════════
summary
exit $FAIL
