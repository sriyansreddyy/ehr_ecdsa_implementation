#!/bin/bash

# ============================================================
# EHR Network - Full Status Report
# ============================================================

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
ORGANIZATIONS="$BASE_DIR/organizations"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}!${NC}"

# ============================================================
# HELPERS
# ============================================================

section() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
  echo -e "${WHITE}  $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
}

subsection() {
  echo ""
  echo -e "${CYAN}  ── $1 ──${NC}"
}

check_container() {
  local NAME=$1
  local LABEL=${2:-$NAME}
  local STATUS=$(docker inspect --format='{{.State.Status}}' $NAME 2>/dev/null)
  if [ "$STATUS" == "running" ]; then
    echo -e "  ${PASS} ${LABEL} ${GREEN}[running]${NC}"
    return 0
  else
    echo -e "  ${FAIL} ${LABEL} ${RED}[${STATUS:-not found}]${NC}"
    return 1
  fi
}

peer_cmd() {
  local PEER_ADDRESS=$1
  local MSP_ID=$2
  local MSP_PATH=$3
  local TLS_CERT=$4
  shift 4

  FABRIC_CFG_PATH=${HOME}/Data/fabric-samples/config \
  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_LOCALMSPID=$MSP_ID \
  CORE_PEER_ADDRESS=$PEER_ADDRESS \
  CORE_PEER_MSPCONFIGPATH=$MSP_PATH \
  CORE_PEER_TLS_ROOTCERT_FILE=$TLS_CERT \
  peer "$@" 2>/dev/null
}

# ── Admin MSP paths ───────────────────────────────────────────
HOSPITAL_ADMIN_MSP="$ORGANIZATIONS/peerOrganizations/hospital.example.com/users/hospitaladmin/msp"
DIAG_ADMIN_MSP="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/users/labadmin/msp"
PROV_ADMIN_MSP="$ORGANIZATIONS/peerOrganizations/provider.example.com/users/provideradmin/msp"

# ── Peer TLS certs ────────────────────────────────────────────
PEER0_HOSP_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt"
PEER1_HOSP_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer1.hospital.example.com/tls/ca.crt"
PEER2_HOSP_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer2.hospital.example.com/tls/ca.crt"
DIAG_TLS="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/peers/peer0.diagnostic.example.com/tls/ca.crt"
PROV_TLS="$ORGANIZATIONS/peerOrganizations/provider.example.com/peers/peer0.provider.example.com/tls/ca.crt"

# ============================================================
# HEADER
# ============================================================

clear
echo -e "${BLUE}"
echo "  ███████╗██╗  ██╗██████╗     ███╗   ██╗███████╗████████╗"
echo "  ██╔════╝██║  ██║██╔══██╗    ████╗  ██║██╔════╝╚══██╔══╝"
echo "  █████╗  ███████║██████╔╝    ██╔██╗ ██║█████╗     ██║   "
echo "  ██╔══╝  ██╔══██║██╔══██╗    ██║╚██╗██║██╔══╝     ██║   "
echo "  ███████╗██║  ██║██║  ██║    ██║ ╚████║███████╗   ██║   "
echo "  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═══╝╚══════╝   ╚═╝   "
echo -e "${NC}"
echo -e "${WHITE}  EHR Hyperledger Fabric Network — Status Report${NC}"
echo -e "  Generated: $(date '+%Y-%m-%d %H:%M:%S')"

# ============================================================
# SECTION 1: DOCKER CONTAINERS
# ============================================================

section "1. DOCKER CONTAINERS"

subsection "Certificate Authorities"
check_container "docker-ca-orderer-1"     "ca-orderer     :7054"
check_container "docker-ca-hospital-1"    "ca-hospital    :7055"
check_container "docker-ca-diagnostics-1" "ca-diagnostics :7056"
check_container "docker-ca-provider-1"    "ca-provider    :7057"

subsection "Orderer"
check_container "docker-orderer.example.com-1" "orderer.example.com :7050 :7053"

subsection "Hospital Peers (HospitalMSP)"
check_container "docker-peer0.hospital.example.com-1" "peer0.hospital :7051  → Auth/Reception"
check_container "docker-peer1.hospital.example.com-1" "peer1.hospital :9051  → Doctor"
check_container "docker-peer2.hospital.example.com-1" "peer2.hospital :10051 → Nurse/Pharmacist"

subsection "External Org Peers"
check_container "docker-peer0.diagnostic.example.com-1" "peer0.diagnostic :8051  → Lab"
check_container "docker-peer0.provider.example.com-1"   "peer0.provider   :11051 → Insurance"

TOTAL=$(docker ps --filter "name=docker-" --format "{{.Names}}" 2>/dev/null | wc -l)
echo ""
echo -e "  Total EHR containers running: ${WHITE}$TOTAL / 10${NC}"

# ============================================================
# SECTION 2: CONTAINER RESOURCE USAGE
# ============================================================

section "2. CONTAINER RESOURCE USAGE"

echo ""
printf "  %-48s %-12s %-15s\n" "NAME" "CPU" "MEMORY"
printf "  %-48s %-12s %-15s\n" "----" "---" "------"

docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}" 2>/dev/null | \
grep "docker-" | \
while IFS='|' read NAME CPU MEM; do
  printf "  %-48s %-12s %-15s\n" "$NAME" "$CPU" "$MEM"
done

# ============================================================
# SECTION 3: PORT MAPPINGS
# ============================================================

section "3. PORT MAPPINGS"

echo ""
printf "  %-48s %-55s\n" "CONTAINER" "PORTS"
printf "  %-48s %-55s\n" "---------" "-----"

docker ps --filter "name=docker-" --format "{{.Names}}|{{.Ports}}" 2>/dev/null | \
while IFS='|' read NAME PORTS; do
  printf "  %-48s %-55s\n" "$NAME" "$PORTS"
done

# ============================================================
# SECTION 4: MSP / IDENTITY STATUS
# ============================================================

section "4. IDENTITY & MSP STATUS"

check_msp() {
  local LABEL=$1
  local MSP_DIR=$2

  local HAS_CERT=$([ -f "$MSP_DIR/signcerts/cert.pem" ] && echo "yes" || echo "no")
  local HAS_KEY=$(ls "$MSP_DIR/keystore/"*_sk 2>/dev/null | wc -l)
  local HAS_CONFIG=$([ -f "$MSP_DIR/config.yaml" ] && echo "yes" || echo "no")
  local HAS_CACERT=$(ls "$MSP_DIR/cacerts/" 2>/dev/null | wc -l)

  if [ "$HAS_CERT" == "yes" ] && [ "$HAS_KEY" -gt 0 ]; then
    local EXPIRY=$(openssl x509 -noout -enddate \
      -in "$MSP_DIR/signcerts/cert.pem" 2>/dev/null | cut -d= -f2)
    local OU=$(openssl x509 -noout -subject \
      -in "$MSP_DIR/signcerts/cert.pem" 2>/dev/null | \
      grep -o 'OU=[^,/]*' | head -1)
    echo -e "  ${PASS} ${LABEL}"
    echo -e "       ${OU} | expires: ${EXPIRY} | config.yaml: ${HAS_CONFIG} | cacerts: ${HAS_CACERT}"
  else
    echo -e "  ${FAIL} ${LABEL} ${RED}[missing cert or key]${NC}"
  fi
}

subsection "Orderer"
check_msp "orderer.example.com" \
  "$ORGANIZATIONS/ordererOrganizations/example.com/orderers/orderer.example.com/msp"

subsection "Hospital Peers"
check_msp "peer0.hospital (Auth/Reception)" \
  "$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/msp"
check_msp "peer1.hospital (Doctor)" \
  "$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer1.hospital.example.com/msp"
check_msp "peer2.hospital (Nurse/Pharma)" \
  "$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer2.hospital.example.com/msp"

subsection "Hospital Users"
for USER in admin receptionist doctor nurse pharmacist medrecordofficer hospitaladmin; do
  MSP="$ORGANIZATIONS/peerOrganizations/hospital.example.com/users/$USER/msp"
  [ -d "$MSP" ] && check_msp "$USER@hospital" "$MSP"
done

subsection "Diagnostics Peer & Users"
check_msp "peer0.diagnostic (Lab)" \
  "$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/peers/peer0.diagnostic.example.com/msp"
for USER in admin labreceptionist labtechnician labsupervisor radiologist labadmin; do
  MSP="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/users/$USER/msp"
  [ -d "$MSP" ] && check_msp "$USER@diagnostics" "$MSP"
done

subsection "Provider Peer & Users"
check_msp "peer0.provider (Insurance)" \
  "$ORGANIZATIONS/peerOrganizations/provider.example.com/peers/peer0.provider.example.com/msp"
for USER in admin billingofficer claimsauditor insuranceofficer provideradmin; do
  MSP="$ORGANIZATIONS/peerOrganizations/provider.example.com/users/$USER/msp"
  [ -d "$MSP" ] && check_msp "$USER@provider" "$MSP"
done

# ============================================================
# SECTION 5: TLS CERTIFICATE STATUS
# ============================================================

section "5. TLS CERTIFICATE STATUS"

check_tls() {
  local LABEL=$1
  local TLS_DIR=$2

  local HAS_CRT=$([ -f "$TLS_DIR/server.crt" ] && echo "yes" || echo "no")
  local HAS_KEY=$([ -f "$TLS_DIR/server.key" ] && echo "yes" || echo "no")
  local HAS_CA=$([ -f "$TLS_DIR/ca.crt" ] && echo "yes" || echo "no")

  if [ "$HAS_CRT" == "yes" ] && [ "$HAS_KEY" == "yes" ]; then
    local EXPIRY=$(openssl x509 -noout -enddate \
      -in "$TLS_DIR/server.crt" 2>/dev/null | cut -d= -f2)
    echo -e "  ${PASS} ${LABEL} | expires: ${EXPIRY} | ca.crt: ${HAS_CA}"
  else
    echo -e "  ${FAIL} ${LABEL} ${RED}[server.crt: $HAS_CRT | server.key: $HAS_KEY]${NC}"
  fi
}

echo ""
check_tls "orderer.example.com    TLS" \
  "$ORGANIZATIONS/ordererOrganizations/example.com/orderers/orderer.example.com/tls"
check_tls "peer0.hospital         TLS" \
  "$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls"
check_tls "peer1.hospital         TLS" \
  "$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer1.hospital.example.com/tls"
check_tls "peer2.hospital         TLS" \
  "$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer2.hospital.example.com/tls"
check_tls "peer0.diagnostic       TLS" \
  "$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/peers/peer0.diagnostic.example.com/tls"
check_tls "peer0.provider         TLS" \
  "$ORGANIZATIONS/peerOrganizations/provider.example.com/peers/peer0.provider.example.com/tls"

# ============================================================
# SECTION 6: CHANNEL STATUS
# ============================================================

section "6. CHANNEL STATUS"

query_channels() {
  local LABEL=$1
  local PEER_ADDR=$2
  local MSP_ID=$3
  local MSP_PATH=$4
  local TLS_CERT=$5

  echo ""
  echo -e "  ${CYAN}$LABEL${NC}"

  if [ ! -d "$MSP_PATH" ]; then
    echo -e "    ${FAIL} Admin MSP not found: $MSP_PATH"
    return
  fi

  CHANNELS=$(peer_cmd $PEER_ADDR $MSP_ID $MSP_PATH $TLS_CERT \
    channel list 2>/dev/null | grep -v "^2" | grep -v "Channels peers" || echo "")

  if [ -n "$CHANNELS" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && echo -e "    ${PASS} channel: ${WHITE}$line${NC}"
    done <<< "$CHANNELS"
  else
    echo -e "    ${WARN} No channels joined or peer unreachable"
  fi
}

query_channels "Hospital peer0 (Auth/Reception)" \
  "localhost:7051" "HospitalMSP" "$HOSPITAL_ADMIN_MSP" "$PEER0_HOSP_TLS"

query_channels "Hospital peer1 (Doctor)" \
  "localhost:9051" "HospitalMSP" "$HOSPITAL_ADMIN_MSP" "$PEER1_HOSP_TLS"

query_channels "Hospital peer2 (Nurse/Pharma)" \
  "localhost:10051" "HospitalMSP" "$HOSPITAL_ADMIN_MSP" "$PEER2_HOSP_TLS"

query_channels "Diagnostics peer0 (Lab)" \
  "localhost:8051" "DiagnosticsMSP" "$DIAG_ADMIN_MSP" "$DIAG_TLS"

query_channels "Provider peer0 (Insurance)" \
  "localhost:11051" "ProviderMSP" "$PROV_ADMIN_MSP" "$PROV_TLS"

# ============================================================
# SECTION 7: LEDGER & BLOCK HEIGHT
# ============================================================

section "7. LEDGER & BLOCK HEIGHT"

query_ledger() {
  local LABEL=$1
  local PEER_ADDR=$2
  local MSP_ID=$3
  local MSP_PATH=$4
  local TLS_CERT=$5
  local CHANNEL=$6

  if [ ! -d "$MSP_PATH" ]; then
    echo -e "  ${FAIL} ${LABEL} | admin MSP missing"
    return
  fi

  INFO=$(peer_cmd $PEER_ADDR $MSP_ID $MSP_PATH $TLS_CERT \
    channel getinfo -c $CHANNEL 2>/dev/null || echo "")

  if [ -n "$INFO" ]; then
    HEIGHT=$(echo $INFO | grep -o '"height":[0-9]*' | cut -d: -f2)
    HASH=$(echo $INFO | grep -o '"currentBlockHash":"[^"]*"' | \
      cut -d'"' -f4 | head -c 16)
    echo -e "  ${PASS} ${LABEL} | channel: ${WHITE}${CHANNEL}${NC} | height: ${WHITE}${HEIGHT:-?}${NC} | hash: ${HASH}..."
  else
    echo -e "  ${WARN} ${LABEL} | ${YELLOW}not joined or unreachable${NC}"
  fi
}

echo ""
# Get channel list from peer0 hospital
JOINED_CHANNELS=$(peer_cmd localhost:7051 HospitalMSP \
  "$HOSPITAL_ADMIN_MSP" "$PEER0_HOSP_TLS" \
  channel list 2>/dev/null | grep -v "^2" | grep -v "Channels peers" || echo "")

if [ -z "$JOINED_CHANNELS" ]; then
  echo -e "  ${WARN} No channels found on Hospital peer0"
else
  while IFS= read -r CHANNEL; do
    [ -z "$CHANNEL" ] && continue
    echo -e "  ${CYAN}Channel: $CHANNEL${NC}"
    query_ledger "  peer0.hospital  " "localhost:7051"  "HospitalMSP"    "$HOSPITAL_ADMIN_MSP" "$PEER0_HOSP_TLS" "$CHANNEL"
    query_ledger "  peer1.hospital  " "localhost:9051"  "HospitalMSP"    "$HOSPITAL_ADMIN_MSP" "$PEER1_HOSP_TLS" "$CHANNEL"
    query_ledger "  peer2.hospital  " "localhost:10051" "HospitalMSP"    "$HOSPITAL_ADMIN_MSP" "$PEER2_HOSP_TLS" "$CHANNEL"
    query_ledger "  peer0.diagnostic" "localhost:8051"  "DiagnosticsMSP" "$DIAG_ADMIN_MSP"     "$DIAG_TLS"       "$CHANNEL"
    query_ledger "  peer0.provider  " "localhost:11051" "ProviderMSP"    "$PROV_ADMIN_MSP"     "$PROV_TLS"       "$CHANNEL"
    echo ""
  done <<< "$JOINED_CHANNELS"
fi

# ============================================================
# SECTION 8: CHAINCODE STATUS
# ============================================================

section "8. CHAINCODE STATUS"

query_chaincode() {
  local LABEL=$1
  local PEER_ADDR=$2
  local MSP_ID=$3
  local MSP_PATH=$4
  local TLS_CERT=$5

  echo ""
  echo -e "  ${CYAN}$LABEL${NC}"

  if [ ! -d "$MSP_PATH" ]; then
    echo -e "    ${FAIL} Admin MSP not found"
    return
  fi

  # Installed
  INSTALLED=$(peer_cmd $PEER_ADDR $MSP_ID $MSP_PATH $TLS_CERT \
    lifecycle chaincode queryinstalled 2>/dev/null || echo "")

  if echo "$INSTALLED" | grep -q "Package ID"; then
    echo -e "    ${CYAN}Installed:${NC}"
    echo "$INSTALLED" | grep "Package ID" | while read -r line; do
      echo -e "    ${PASS} $line"
    done
  else
    echo -e "    ${WARN} No chaincodes installed"
  fi

  # Committed
  CHANNELS=$(peer_cmd $PEER_ADDR $MSP_ID $MSP_PATH $TLS_CERT \
    channel list 2>/dev/null | grep -v "^2" | grep -v "Channels peers" || echo "")

  while IFS= read -r CHANNEL; do
    [ -z "$CHANNEL" ] && continue
    COMMITTED=$(peer_cmd $PEER_ADDR $MSP_ID $MSP_PATH $TLS_CERT \
      lifecycle chaincode querycommitted -C $CHANNEL 2>/dev/null || echo "")
    if echo "$COMMITTED" | grep -q "Name:"; then
      echo -e "    ${CYAN}Committed on ${WHITE}$CHANNEL${CYAN}:${NC}"
      echo "$COMMITTED" | grep "Name:" | while read -r line; do
        echo -e "    ${PASS} $line"
      done
    else
      echo -e "    ${WARN} No chaincodes committed on ${CHANNEL}"
    fi
  done <<< "$CHANNELS"
}

query_chaincode "Hospital peer0 (Auth/Reception)" \
  "localhost:7051" "HospitalMSP" "$HOSPITAL_ADMIN_MSP" "$PEER0_HOSP_TLS"

query_chaincode "Hospital peer1 (Doctor)" \
  "localhost:9051" "HospitalMSP" "$HOSPITAL_ADMIN_MSP" "$PEER1_HOSP_TLS"

query_chaincode "Hospital peer2 (Nurse/Pharma)" \
  "localhost:10051" "HospitalMSP" "$HOSPITAL_ADMIN_MSP" "$PEER2_HOSP_TLS"

query_chaincode "Diagnostics peer0 (Lab)" \
  "localhost:8051" "DiagnosticsMSP" "$DIAG_ADMIN_MSP" "$DIAG_TLS"

query_chaincode "Provider peer0 (Insurance)" \
  "localhost:11051" "ProviderMSP" "$PROV_ADMIN_MSP" "$PROV_TLS"

# ============================================================
# SECTION 9: NETWORK ARTIFACTS
# ============================================================

section "9. NETWORK ARTIFACTS"

check_file() {
  local LABEL=$1
  local FILE=$2
  if [ -f "$FILE" ]; then
    SIZE=$(du -h "$FILE" | cut -f1)
    echo -e "  ${PASS} ${LABEL} ${GREEN}[${SIZE}]${NC} — $FILE"
  else
    echo -e "  ${FAIL} ${LABEL} ${RED}[missing]${NC} — $FILE"
  fi
}

echo ""
echo -e "  ${CYAN}Config Files:${NC}"
check_file "configtx.yaml        " "$BASE_DIR/configtx/configtx.yaml"
check_file "core.yaml            " "$BASE_DIR/configtx/core.yaml"
check_file "docker-compose-ca    " "$BASE_DIR/docker/docker-compose-ca.yaml"
check_file "docker-compose-network" "$BASE_DIR/docker/docker-compose-network.yaml"

echo ""
echo -e "  ${CYAN}Channel Blocks:${NC}"
BLOCKS=$(ls $BASE_DIR/channel-artifacts/*.block 2>/dev/null)
if [ -n "$BLOCKS" ]; then
  for BLOCK in $BLOCKS; do
    SIZE=$(du -h "$BLOCK" | cut -f1)
    MODIFIED=$(stat -c '%y' "$BLOCK" | cut -d'.' -f1)
    echo -e "  ${PASS} $(basename $BLOCK) ${GREEN}[${SIZE}]${NC} — created: ${MODIFIED}"
  done
else
  echo -e "  ${WARN} No .block files found in channel-artifacts/"
fi

echo ""
echo -e "  ${CYAN}Scripts:${NC}"
for SCRIPT in \
  network-up.sh \
  network-down.sh \
  enroll.sh \
  createChannel.sh \
  deployChaincode.sh \
  setAnchorPeer.sh \
  enrollregisteruser.sh \
  status.sh \
  dockerLogs.sh \
  envVar.sh \
  utils.sh; do
  FILE="$BASE_DIR/scripts/$SCRIPT"
  if [ -f "$FILE" ]; then
    PERMS=$(stat -c '%A' "$FILE")
    echo -e "  ${PASS} $SCRIPT ${GREEN}[$PERMS]${NC}"
  else
    echo -e "  ${WARN} $SCRIPT ${YELLOW}[not found]${NC}"
  fi
done

# ============================================================
# SECTION 10: DOCKER NETWORK & VOLUMES
# ============================================================

section "10. DOCKER NETWORK & VOLUMES"

echo ""
echo -e "  ${CYAN}Docker Network:${NC}"
docker network inspect ehr_network --format \
  "  Name: {{.Name}} | Driver: {{.Driver}} | Containers: {{len .Containers}}" \
  2>/dev/null || echo -e "  ${FAIL} ehr_network not found"

echo ""
echo -e "  ${CYAN}Docker Volumes:${NC}"
for VOL in \
  docker_orderer.example.com \
  docker_peer0.hospital.example.com \
  docker_peer1.hospital.example.com \
  docker_peer2.hospital.example.com \
  docker_peer0.diagnostic.example.com \
  docker_peer0.provider.example.com; do
  if docker volume inspect "$VOL" &>/dev/null; then
    SIZE=$(docker volume inspect "$VOL" \
      --format '{{.Mountpoint}}' 2>/dev/null | \
      xargs du -sh 2>/dev/null | cut -f1 || echo "?")
    echo -e "  ${PASS} $VOL ${GREEN}[$SIZE]${NC}"
  else
    echo -e "  ${WARN} $VOL ${YELLOW}[not found]${NC}"
  fi
done

# ============================================================
# FOOTER
# ============================================================

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}  Report complete — $(date '+%H:%M:%S')${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""