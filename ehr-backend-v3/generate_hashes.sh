#!/bin/bash

# ============================================================
# generate_hashes.sh  (v2 backend)
# Generates bcrypt hashes and patches auth.js in all 4 APIs.
# Run from: ehr-backend-v2/
# ============================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
WHITE='\033[1;37m'; BLUE='\033[0;34m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE="$SCRIPT_DIR"

# Find node_modules with bcryptjs
NODE_DIR=""
for DIR in "$BASE/peer0-api" "$BASE/peer1-api" "$BASE/peer2-api" "$BASE/extorg-api"; do
  if [ -d "$DIR/node_modules/bcryptjs" ]; then
    NODE_DIR="$DIR"; break
  fi
done

if [ -z "$NODE_DIR" ]; then
  echo -e "${RED}ERROR: bcryptjs not found. Run npm install in one of the API dirs first.${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}  EHR Backend v2 — Hash Generator & Patcher        ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"

hash_pw() {
  node -e "process.stdout.write(require('$NODE_DIR/node_modules/bcryptjs').hashSync('$1', 10))"
}

patch_file() {
  local FILE=$1
  local BLOCK=$2
  if [ ! -f "$FILE" ]; then echo -e "  ${RED}MISSING: $FILE${NC}"; return 1; fi
  python3 - "$FILE" "$BLOCK" << 'PYEOF'
import sys, re
filepath, block = sys.argv[1], sys.argv[2]
with open(filepath) as f: content = f.read()
new = re.sub(r'const USERS = \{[\s\S]*?\};', block, content, count=1)
if new == content: print("ERROR: USERS block not found"); sys.exit(1)
with open(filepath, 'w') as f: f.write(new)
print("OK")
PYEOF
}

# ── peer0-api: receptionist, hospitaladmin ────────────────────
echo ""
echo -e "${CYAN}Patching peer0-api/src/routes/auth.js ...${NC}"
H_REC=$(hash_pw "recpw");     echo -e "  ✓ receptionist"
H_ADM=$(hash_pw "hadminpw");  echo -e "  ✓ hospitaladmin"

BLOCK="const USERS = {
  receptionist:  { password: '$H_REC', role: 'receptionist' }, // recpw
  hospitaladmin: { password: '$H_ADM', role: 'admin'        }, // hadminpw
};"
R=$(patch_file "$BASE/peer0-api/src/routes/auth.js" "$BLOCK")
[ "$R" = "OK" ] && echo -e "  ${GREEN}→ Done${NC}" || echo -e "  ${RED}→ $R${NC}"

# ── peer1-api: doctor ─────────────────────────────────────────
echo ""
echo -e "${CYAN}Patching peer1-api/src/routes/auth.js ...${NC}"
H_DOC=$(hash_pw "docpw"); echo -e "  ✓ doctor"

BLOCK="const USERS = {
  doctor: { password: '$H_DOC', role: 'doctor' }, // docpw
};"
R=$(patch_file "$BASE/peer1-api/src/routes/auth.js" "$BLOCK")
[ "$R" = "OK" ] && echo -e "  ${GREEN}→ Done${NC}" || echo -e "  ${RED}→ $R${NC}"

# ── peer2-api: nurse, pharmacist, medrecordofficer ────────────
echo ""
echo -e "${CYAN}Patching peer2-api/src/routes/auth.js ...${NC}"
H_NUR=$(hash_pw "nursepw");  echo -e "  ✓ nurse"
H_PHA=$(hash_pw "pharmpw");  echo -e "  ✓ pharmacist"
H_MED=$(hash_pw "medpw");    echo -e "  ✓ medrecordofficer"

BLOCK="const USERS = {
  nurse:            { password: '$H_NUR', role: 'nurse'            }, // nursepw
  pharmacist:       { password: '$H_PHA', role: 'pharmacist'       }, // pharmpw
  medrecordofficer: { password: '$H_MED', role: 'medrecordofficer' }, // medpw
};"
R=$(patch_file "$BASE/peer2-api/src/routes/auth.js" "$BLOCK")
[ "$R" = "OK" ] && echo -e "  ${GREEN}→ Done${NC}" || echo -e "  ${RED}→ $R${NC}"

# ── extorg-api: all lab + provider roles ──────────────────────
echo ""
echo -e "${CYAN}Patching extorg-api/src/routes/auth.js ...${NC}"
H_LABREC=$(hash_pw "labrecpw");   echo -e "  ✓ labreceptionist"
H_LABTECH=$(hash_pw "labpw");     echo -e "  ✓ labtechnician"
H_RADIO=$(hash_pw "radpw");       echo -e "  ✓ radiologist"
H_LABSUP=$(hash_pw "labsuppw");   echo -e "  ✓ labsupervisor"
H_LABADM=$(hash_pw "labadminpw"); echo -e "  ✓ labadmin"
H_BILL=$(hash_pw "billpw");       echo -e "  ✓ billingofficer"
H_AUD=$(hash_pw "claimaudpw");    echo -e "  ✓ claimsauditor"
H_INS=$(hash_pw "inspw");         echo -e "  ✓ insuranceofficer"
H_PADM=$(hash_pw "provadminpw");  echo -e "  ✓ provideradmin"

BLOCK="const USERS = {
  labreceptionist:  { password: '$H_LABREC',  role: 'labreceptionist',  mspId: 'DiagnosticsMSP', peer: 'peer0.diagnostic' }, // labrecpw
  labtechnician:    { password: '$H_LABTECH', role: 'labtechnician',    mspId: 'DiagnosticsMSP', peer: 'peer0.diagnostic' }, // labpw
  radiologist:      { password: '$H_RADIO',   role: 'radiologist',      mspId: 'DiagnosticsMSP', peer: 'peer0.diagnostic' }, // radpw
  labsupervisor:    { password: '$H_LABSUP',  role: 'labsupervisor',    mspId: 'DiagnosticsMSP', peer: 'peer0.diagnostic' }, // labsuppw
  labadmin:         { password: '$H_LABADM',  role: 'labadmin',         mspId: 'DiagnosticsMSP', peer: 'peer0.diagnostic' }, // labadminpw
  billingofficer:   { password: '$H_BILL',    role: 'billingofficer',   mspId: 'ProviderMSP',    peer: 'peer0.provider'   }, // billpw
  claimsauditor:    { password: '$H_AUD',     role: 'claimsauditor',    mspId: 'ProviderMSP',    peer: 'peer0.provider'   }, // claimaudpw
  insuranceofficer: { password: '$H_INS',     role: 'insuranceofficer', mspId: 'ProviderMSP',    peer: 'peer0.provider'   }, // inspw
  provideradmin:    { password: '$H_PADM',    role: 'provideradmin',    mspId: 'ProviderMSP',    peer: 'peer0.provider'   }, // provadminpw
};"
R=$(patch_file "$BASE/extorg-api/src/routes/auth.js" "$BLOCK")
[ "$R" = "OK" ] && echo -e "  ${GREEN}→ Done${NC}" || echo -e "  ${RED}→ $R${NC}"

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Done. Restart all 4 APIs.${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}cd peer0-api  && npm start   # :3001 receptionist + admin${NC}"
echo -e "  ${CYAN}cd peer1-api  && npm start   # :3002 doctor${NC}"
echo -e "  ${CYAN}cd peer2-api  && npm start   # :3003 nurse + pharmacist + medrecordofficer${NC}"
echo -e "  ${CYAN}cd extorg-api && npm start   # :3004 lab + provider roles${NC}"
echo ""
