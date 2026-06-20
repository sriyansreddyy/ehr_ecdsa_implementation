#!/bin/bash

set -e

# ============================================================
# EHR Network - Chaincode Deployment Script
# Usage:
#   ./deploy-chaincode.sh \
#     --channel <channelname> \
#     --chaincode-name <name> \
#     --chaincode-path <path> \
#     --version <version> \
#     --sequence <sequence>
# ============================================================

# ============================================================
# COLORS
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
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
section() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
  echo -e "${WHITE}  $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
}

# ============================================================
# USAGE
# ============================================================

usage() {
  echo ""
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Required:"
  echo "  --channel         Channel name (e.g. ehrchannel)"
  echo "  --chaincode-name  Chaincode name (e.g. ehr)"
  echo "  --chaincode-path  Absolute or relative path to chaincode folder"
  echo ""
  echo "Optional:"
  echo "  --version         Chaincode version (default: 1.0)"
  echo "  --sequence        Chaincode sequence number (default: 1)"
  echo "  --init-required   Pass this flag if chaincode requires --isInit"
  echo "  --help            Show this help"
  echo ""
  echo "Examples:"
  echo "  $0 --channel ehrchannel --chaincode-name ehr --chaincode-path ./chaincode/ehr"
  echo "  $0 --channel ehrchannel --chaincode-name ehr --chaincode-path ./chaincode/ehr --version 2.0 --sequence 2"
  echo ""
  exit 1
}

# ============================================================
# PARSE ARGUMENTS
# ============================================================

CHANNEL=""
CC_NAME=""
CC_PATH=""
CC_VERSION="1.0"
CC_SEQUENCE="1"
INIT_REQUIRED=false

# Endorsement policy — ANY one org peer can endorse
# This matches our design: each function is endorsed by its designated peer only
CC_POLICY="OR('HospitalMSP.peer','DiagnosticsMSP.peer','ProviderMSP.peer')"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --channel)        CHANNEL="$2";      shift ;;
    --chaincode-name) CC_NAME="$2";      shift ;;
    --chaincode-path) CC_PATH="$2";      shift ;;
    --version)        CC_VERSION="$2";   shift ;;
    --sequence)       CC_SEQUENCE="$2";  shift ;;
    --init-required)  INIT_REQUIRED=true ;;
    --help|-h)        usage ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
  shift
done

# ============================================================
# VALIDATE
# ============================================================

[ -z "$CHANNEL" ]  && error "--channel is required"
[ -z "$CC_NAME" ]  && error "--chaincode-name is required"
[ -z "$CC_PATH" ]  && error "--chaincode-path is required"
[ ! -d "$CC_PATH" ] && error "Chaincode path does not exist: $CC_PATH"
[ ! -f "$CC_PATH/package.json" ] && error "No package.json found in $CC_PATH — is this a Node.js chaincode?"

# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
ORGANIZATIONS="$BASE_DIR/organizations"
export FABRIC_CFG_PATH="$BASE_DIR/configtx"

CC_PATH=$(cd "$CC_PATH" && pwd)  # convert to absolute path
CC_LABEL="${CC_NAME}_${CC_VERSION}"
CC_PACKAGE="${BASE_DIR}/channel-artifacts/${CC_LABEL}.tar.gz"

ORDERER_ADDRESS="localhost:7050"
ORDERER_TLS="$ORGANIZATIONS/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"

# ============================================================
# ORG DEFINITIONS
# All orgs — we'll filter by channel membership later
# ============================================================

declare -A ORG_MSP
declare -A ORG_PEER
declare -A ORG_ADMIN_MSP
declare -A ORG_TLS

ORG_MSP[hospital]="HospitalMSP"
ORG_PEER[hospital]="localhost:7051"
ORG_ADMIN_MSP[hospital]="$ORGANIZATIONS/peerOrganizations/hospital.example.com/users/hospitaladmin/msp"
ORG_TLS[hospital]="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt"

ORG_MSP[diagnostics]="DiagnosticsMSP"
ORG_PEER[diagnostics]="localhost:8051"
ORG_ADMIN_MSP[diagnostics]="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/users/labadmin/msp"
ORG_TLS[diagnostics]="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/peers/peer0.diagnostic.example.com/tls/ca.crt"

ORG_MSP[provider]="ProviderMSP"
ORG_PEER[provider]="localhost:11051"
ORG_ADMIN_MSP[provider]="$ORGANIZATIONS/peerOrganizations/provider.example.com/users/provideradmin/msp"
ORG_TLS[provider]="$ORGANIZATIONS/peerOrganizations/provider.example.com/peers/peer0.provider.example.com/tls/ca.crt"

# Hospital peer1 (Doctor) and peer2 (Nurse/Pharma)
# These need chaincode installed but are NOT separate orgs (same HospitalMSP)
# so they don't need separate approve/commit
PEER1_ADDR="localhost:9051"
PEER1_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer1.hospital.example.com/tls/ca.crt"
PEER2_ADDR="localhost:10051"
PEER2_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/peers/peer2.hospital.example.com/tls/ca.crt"
HOSP_ADMIN_MSP="$ORGANIZATIONS/peerOrganizations/hospital.example.com/users/hospitaladmin/msp"

# ============================================================
# DISCOVER WHICH ORGS ARE ON THE CHANNEL
# ============================================================

section "DETECTING CHANNEL MEMBERS"

CHANNEL_ORGS=()

for ORG in hospital diagnostics provider; do
  log "Checking if $ORG peer is on channel $CHANNEL..."

  JOINED=$(
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_LOCALMSPID="${ORG_MSP[$ORG]}" \
    CORE_PEER_ADDRESS="${ORG_PEER[$ORG]}" \
    CORE_PEER_MSPCONFIGPATH="${ORG_ADMIN_MSP[$ORG]}" \
    CORE_PEER_TLS_ROOTCERT_FILE="${ORG_TLS[$ORG]}" \
    peer channel list 2>/dev/null | grep "^$CHANNEL$" || echo ""
  )

  if [ -n "$JOINED" ]; then
    CHANNEL_ORGS+=($ORG)
    success "$ORG is on channel $CHANNEL"
  else
    warn "$ORG is NOT on channel $CHANNEL — skipping"
  fi
done

if [ ${#CHANNEL_ORGS[@]} -eq 0 ]; then
  error "No peers found on channel $CHANNEL. Make sure peers have joined the channel."
fi

echo ""
log "Channel members: ${CHANNEL_ORGS[*]}"

# ============================================================
# STEP 1: INSTALL NODE DEPENDENCIES
# ============================================================

section "STEP 1: INSTALLING NODE DEPENDENCIES"

log "Running npm install in $CC_PATH..."
cd $CC_PATH
npm install --quiet
cd $BASE_DIR
success "npm install complete"

# ============================================================
# STEP 2: PACKAGE CHAINCODE
# ============================================================

section "STEP 2: PACKAGING CHAINCODE"

log "Packaging chaincode: $CC_LABEL"

peer lifecycle chaincode package $CC_PACKAGE \
  --path $CC_PATH \
  --lang node \
  --label $CC_LABEL

success "Chaincode packaged: $CC_PACKAGE"
ls -lh $CC_PACKAGE

# ============================================================
# STEP 3: INSTALL ON ALL CHANNEL PEERS
# ============================================================

section "STEP 3: INSTALLING CHAINCODE ON PEERS"

declare -A PACKAGE_IDS

for ORG in "${CHANNEL_ORGS[@]}"; do
  log "Installing $CC_LABEL on $ORG peer..."

  INSTALL_OUT=$(
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_LOCALMSPID="${ORG_MSP[$ORG]}" \
    CORE_PEER_ADDRESS="${ORG_PEER[$ORG]}" \
    CORE_PEER_MSPCONFIGPATH="${ORG_ADMIN_MSP[$ORG]}" \
    CORE_PEER_TLS_ROOTCERT_FILE="${ORG_TLS[$ORG]}" \
    peer lifecycle chaincode install $CC_PACKAGE 2>&1 || true
  )

  if echo "$INSTALL_OUT" | grep -q "already successfully installed"; then
    warn "$ORG — chaincode already installed, skipping"
  elif echo "$INSTALL_OUT" | grep -q "error\|Error\|failed"; then
    error "Install failed on $ORG: $INSTALL_OUT"
  else
    success "Installed on $ORG"
  fi

  # Get package ID
  PKG_ID=$(
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_LOCALMSPID="${ORG_MSP[$ORG]}" \
    CORE_PEER_ADDRESS="${ORG_PEER[$ORG]}" \
    CORE_PEER_MSPCONFIGPATH="${ORG_ADMIN_MSP[$ORG]}" \
    CORE_PEER_TLS_ROOTCERT_FILE="${ORG_TLS[$ORG]}" \
    peer lifecycle chaincode queryinstalled 2>/dev/null | \
    grep "$CC_LABEL" | \
    awk -F'[, ]+' '{print $3}' | \
    tr -d ','
  )

  PACKAGE_IDS[$ORG]=$PKG_ID
  success "Installed on $ORG — Package ID: $PKG_ID"
done

# Use package ID from first org
PACKAGE_ID="${PACKAGE_IDS[${CHANNEL_ORGS[0]}]}"
log "Using Package ID: $PACKAGE_ID"

# ── Also install on Hospital peer1 and peer2 ─────────────────
# These are same HospitalMSP but run on separate nodes
# They must have chaincode installed to endorse transactions
section "STEP 3b: INSTALLING ON HOSPITAL PEER1 AND PEER2"

install_extra_peer() {
  local LABEL=$1
  local ADDR=$2
  local TLS=$3

  log "Installing on Hospital ${LABEL}..."

  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID="HospitalMSP"
  export CORE_PEER_ADDRESS="$ADDR"
  export CORE_PEER_MSPCONFIGPATH="$HOSP_ADMIN_MSP"
  export CORE_PEER_TLS_ROOTCERT_FILE="$TLS"

  local OUT
  OUT=$(peer lifecycle chaincode install $CC_PACKAGE 2>&1 || true)

  if echo "$OUT" | grep -q "already successfully installed"; then
    warn "Hospital ${LABEL} — already installed, skipping"
  elif echo "$OUT" | grep -q "error\|Error\|failed"; then
    warn "Install on Hospital ${LABEL} had issues: $OUT"
  else
    success "Installed on Hospital ${LABEL}"
  fi
}

install_extra_peer "peer1 (Doctor)"       "$PEER1_ADDR" "$PEER1_TLS"
install_extra_peer "peer2 (Nurse/Pharma)" "$PEER2_ADDR" "$PEER2_TLS"

# ============================================================
# STEP 4: APPROVE FOR EACH ORG
# ============================================================

section "STEP 4: APPROVING CHAINCODE FOR EACH ORG"

INIT_FLAG=""
[ "$INIT_REQUIRED" = true ] && INIT_FLAG="--init-required"

for ORG in "${CHANNEL_ORGS[@]}"; do
  log "Approving chaincode for $ORG..."

  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_LOCALMSPID="${ORG_MSP[$ORG]}" \
  CORE_PEER_ADDRESS="${ORG_PEER[$ORG]}" \
  CORE_PEER_MSPCONFIGPATH="${ORG_ADMIN_MSP[$ORG]}" \
  CORE_PEER_TLS_ROOTCERT_FILE="${ORG_TLS[$ORG]}" \
  peer lifecycle chaincode approveformyorg \
    -o $ORDERER_ADDRESS \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID $CHANNEL \
    --name $CC_NAME \
    --version $CC_VERSION \
    --package-id $PACKAGE_ID \
    --sequence $CC_SEQUENCE \
    --signature-policy "$CC_POLICY" \
    --tls \
    --cafile $ORDERER_TLS \
    $INIT_FLAG

  success "Approved for $ORG"
done

# ============================================================
# STEP 5: CHECK COMMIT READINESS
# ============================================================

section "STEP 5: CHECKING COMMIT READINESS"

FIRST_ORG="${CHANNEL_ORGS[0]}"

log "Checking commit readiness on channel $CHANNEL..."

CORE_PEER_TLS_ENABLED=true \
CORE_PEER_LOCALMSPID="${ORG_MSP[$FIRST_ORG]}" \
CORE_PEER_ADDRESS="${ORG_PEER[$FIRST_ORG]}" \
CORE_PEER_MSPCONFIGPATH="${ORG_ADMIN_MSP[$FIRST_ORG]}" \
CORE_PEER_TLS_ROOTCERT_FILE="${ORG_TLS[$FIRST_ORG]}" \
peer lifecycle chaincode checkcommitreadiness \
  --channelID $CHANNEL \
  --name $CC_NAME \
  --version $CC_VERSION \
  --sequence $CC_SEQUENCE \
  --signature-policy "$CC_POLICY" \
  --tls \
  --cafile $ORDERER_TLS \
  --output json \
  $INIT_FLAG

# ============================================================
# STEP 6: COMMIT CHAINCODE
# ============================================================

section "STEP 6: COMMITTING CHAINCODE"

log "Committing $CC_NAME on channel $CHANNEL..."

# Build --peerAddresses and --tlsRootCertFiles flags for all orgs
PEER_FLAGS=""
for ORG in "${CHANNEL_ORGS[@]}"; do
  PEER_FLAGS="$PEER_FLAGS --peerAddresses ${ORG_PEER[$ORG]}"
  PEER_FLAGS="$PEER_FLAGS --tlsRootCertFiles ${ORG_TLS[$ORG]}"
done

CORE_PEER_TLS_ENABLED=true \
CORE_PEER_LOCALMSPID="${ORG_MSP[$FIRST_ORG]}" \
CORE_PEER_ADDRESS="${ORG_PEER[$FIRST_ORG]}" \
CORE_PEER_MSPCONFIGPATH="${ORG_ADMIN_MSP[$FIRST_ORG]}" \
CORE_PEER_TLS_ROOTCERT_FILE="${ORG_TLS[$FIRST_ORG]}" \
peer lifecycle chaincode commit \
  -o $ORDERER_ADDRESS \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID $CHANNEL \
  --name $CC_NAME \
  --version $CC_VERSION \
  --sequence $CC_SEQUENCE \
  --signature-policy "$CC_POLICY" \
  --tls \
  --cafile $ORDERER_TLS \
  $PEER_FLAGS \
  $INIT_FLAG

success "Chaincode $CC_NAME committed on $CHANNEL"

# ============================================================
# STEP 7: VERIFY
# ============================================================

section "STEP 7: VERIFYING DEPLOYMENT"

for ORG in "${CHANNEL_ORGS[@]}"; do
  log "Querying committed chaincode on $ORG..."

  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_LOCALMSPID="${ORG_MSP[$ORG]}" \
  CORE_PEER_ADDRESS="${ORG_PEER[$ORG]}" \
  CORE_PEER_MSPCONFIGPATH="${ORG_ADMIN_MSP[$ORG]}" \
  CORE_PEER_TLS_ROOTCERT_FILE="${ORG_TLS[$ORG]}" \
  peer lifecycle chaincode querycommitted \
    --channelID $CHANNEL \
    --name $CC_NAME \
    --tls \
    --cafile $ORDERER_TLS
done

# ============================================================
# DONE
# ============================================================

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Chaincode deployed successfully!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Channel      : ${WHITE}$CHANNEL${NC}"
echo -e "  Chaincode    : ${WHITE}$CC_NAME${NC}"
echo -e "  Version      : ${WHITE}$CC_VERSION${NC}"
echo -e "  Sequence     : ${WHITE}$CC_SEQUENCE${NC}"
echo -e "  Package ID   : ${WHITE}$PACKAGE_ID${NC}"
echo -e "  Deployed on  : ${WHITE}${CHANNEL_ORGS[*]}${NC}"
echo ""
