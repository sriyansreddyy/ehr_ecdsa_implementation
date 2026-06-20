#!/bin/bash

# ============================================================
# EHR Network - Full Network Up Script
# Automates: CA start → Enroll → Network start → Channel → Anchor peers
#
# Usage:
#   bash scripts/network-up.sh [OPTIONS]
#
# Options:
#   --channel    Channel name (default: ehrchannel)
#   --delay      Retry delay in seconds (default: 3)
#   --retry      Max retry attempts (default: 5)
#   --skip-enroll  Skip enrollment (if already enrolled)
#   --help       Show this help
#
# Examples:
#   bash scripts/network-up.sh
#   bash scripts/network-up.sh --channel ehrchannel
#   bash scripts/network-up.sh --skip-enroll
# ============================================================

set -e

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
# DEFAULTS
# ============================================================

CHANNEL_NAME="ehrchannel"
DELAY=3
MAX_RETRY=5
SKIP_ENROLL=false

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
DOCKER_DIR="$BASE_DIR/docker"
SCRIPTS_DIR="$BASE_DIR/scripts"
ORGANIZATIONS="$BASE_DIR/organizations"

# ============================================================
# PARSE ARGUMENTS
# ============================================================

usage() {
  echo ""
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --channel      Channel name (default: ehrchannel)"
  echo "  --delay        Retry delay seconds (default: 3)"
  echo "  --retry        Max retries (default: 5)"
  echo "  --skip-enroll  Skip CA enrollment step"
  echo "  --help         Show this help"
  echo ""
  exit 1
}

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --channel)     CHANNEL_NAME="$2"; shift ;;
    --delay)       DELAY="$2";        shift ;;
    --retry)       MAX_RETRY="$2";    shift ;;
    --skip-enroll) SKIP_ENROLL=true ;;
    --help|-h)     usage ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
  shift
done

# ============================================================
# VALIDATE ENVIRONMENT
# ============================================================

validate_env() {
  section "VALIDATING ENVIRONMENT"

  # Check required binaries
  for BIN in peer orderer configtxgen configtxlator osnadmin fabric-ca-client jq; do
    if ! which $BIN &>/dev/null; then
      error "$BIN not found. Make sure Fabric binaries are in PATH."
    fi
    success "$BIN found"
  done

  # Check docker
  if ! docker info &>/dev/null; then
    error "Docker is not running."
  fi
  success "Docker is running"

  # Check docker-compose files
  [ ! -f "$DOCKER_DIR/docker-compose-ca.yaml" ] && \
    error "Missing: $DOCKER_DIR/docker-compose-ca.yaml"
  [ ! -f "$DOCKER_DIR/docker-compose-network.yaml" ] && \
    error "Missing: $DOCKER_DIR/docker-compose-network.yaml"
  success "Docker compose files found"

  # Check configtx
  [ ! -f "$BASE_DIR/configtx/configtx.yaml" ] && \
    error "Missing: $BASE_DIR/configtx/configtx.yaml"
  success "configtx.yaml found"
}

# ============================================================
# STEP 1: Start CAs
# ============================================================

start_cas() {
  section "STEP 1: STARTING CERTIFICATE AUTHORITIES"

  # ── Pre-create ehr_network ────────────────────────────────────────────────
  # Both compose files declare the network as external=true.
  # Docker requires the network to exist BEFORE either compose file starts.
  # Creating it here ensures it survives CA stop and network compose start.
  if ! docker network inspect ehr_network &>/dev/null; then
    log "Creating ehr_network (external, persistent)..."
    docker network create ehr_network
    success "ehr_network created"
  else
    success "ehr_network already exists — reusing"
  fi

  # Create CA directories if missing (needed for volume mounts)
  mkdir -p "$ORGANIZATIONS/ordererOrganizations/example.com/ca"
  mkdir -p "$ORGANIZATIONS/peerOrganizations/hospital.example.com/ca"
  mkdir -p "$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/ca"
  mkdir -p "$ORGANIZATIONS/peerOrganizations/provider.example.com/ca"

  log "Starting CA containers..."
  docker compose -f "$DOCKER_DIR/docker-compose-ca.yaml" up -d

  log "Waiting for CAs to initialize and generate certs..."
  local WAITED=0
  local MAX_WAIT=30

  while [ $WAITED -lt $MAX_WAIT ]; do
    # Check all 4 CA certs exist
    if [ -f "$ORGANIZATIONS/ordererOrganizations/example.com/ca/ca-cert.pem" ] && \
       [ -f "$ORGANIZATIONS/peerOrganizations/hospital.example.com/ca/ca-cert.pem" ] && \
       [ -f "$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/ca/ca-cert.pem" ] && \
       [ -f "$ORGANIZATIONS/peerOrganizations/provider.example.com/ca/ca-cert.pem" ]; then
      break
    fi
    sleep 2
    WAITED=$(( WAITED + 2 ))
    log "Waiting for CA certs... (${WAITED}s)"
  done

  if [ $WAITED -ge $MAX_WAIT ]; then
    error "CAs did not generate certs within ${MAX_WAIT}s. Check: docker logs <ca-container-name>"
  fi

  success "All 4 CA certs found"
  success "CAs started:"
  success "  ca-orderer     :7054"
  success "  ca-hospital    :7055"
  success "  ca-diagnostics :7056"
  success "  ca-provider    :7057"
}

# ============================================================
# STEP 2: Fix permissions & Enroll identities
# ============================================================

enroll_identities() {
  section "STEP 2: ENROLLING IDENTITIES"

  log "Fixing directory permissions..."
  sudo chown -R $USER:$USER "$ORGANIZATIONS/" 2>/dev/null || \
    chown -R $USER:$USER "$ORGANIZATIONS/" 2>/dev/null || \
    warn "Could not fix permissions — will try anyway"

  log "Running enroll script..."
  bash "$SCRIPTS_DIR/enroll.sh"

  success "All identities enrolled"
}

# ============================================================
# STEP 3: Start network (peers + orderer)
# ============================================================

start_network() {
  section "STEP 3: STARTING PEERS, ORDERER AND IPFS"

  log "Starting network containers..."
  docker compose -f "$DOCKER_DIR/docker-compose-network.yaml" up -d

  log "Waiting for peers, orderer and IPFS to be ready..."
  sleep 8

  # ── Check peers and orderer ───────────────────────────────────────────────
  # These use docker compose v2 naming (project-name-service-N prefix).
  # We match by partial name using docker ps --filter which does substring match.
  local PEER_PATTERNS=(
    "orderer.example.com"
    "peer0.hospital.example.com"
    "peer1.hospital.example.com"
    "peer2.hospital.example.com"
    "peer0.diagnostic.example.com"
    "peer0.provider.example.com"
  )

  local ALL_UP=true
  for PATTERN in "${PEER_PATTERNS[@]}"; do
    STATUS=$(docker ps --filter "name=${PATTERN}" --format "{{.Status}}" 2>/dev/null | head -1)
    if [[ "$STATUS" == Up* ]]; then
      success "  $PATTERN → $STATUS"
    else
      warn "  $PATTERN → ${STATUS:-not found}"
      ALL_UP=false
    fi
  done

  # ── Check IPFS separately ─────────────────────────────────────────────────
  # IPFS container has an explicit container_name=ipfs.ehr.local so no prefix.
  # Use docker inspect (exact name match) instead of --filter (regex, dots = wildcard).
  IPFS_STATUS=$(docker inspect --format='{{.State.Status}}' ipfs.ehr.local 2>/dev/null || echo "missing")
  if [ "$IPFS_STATUS" = "running" ]; then
    success "  ipfs.ehr.local → Up (running)"
  else
    warn "  ipfs.ehr.local → ${IPFS_STATUS}"
    warn "  IPFS may still be initialising — continuing anyway"
    # Don't fail the whole network startup for IPFS
  fi

  if [ "$ALL_UP" == "false" ]; then
    error "Some Fabric containers are not running. Check: docker ps -a"
  fi

  # Wait for IPFS daemon to be ready
  # On first run: repo init + migration + indexing takes 60-90s.
  # On subsequent runs: 5-15s.
  # We check localhost:5001/api/v0/id directly — no docker exec needed.
  log "Waiting for IPFS daemon to be ready (first run can take 60-90s)..."
  local IPFS_WAITED=0
  local IPFS_MAX=120
  while [ $IPFS_WAITED -lt $IPFS_MAX ]; do
    # Try the IPFS HTTP API directly from the host
    if curl -s -m 3 -X POST http://localhost:5001/api/v0/id \
        --output /dev/null 2>/dev/null; then
      success "IPFS daemon is ready (${IPFS_WAITED}s)"
      break
    fi
    sleep 5
    IPFS_WAITED=$(( IPFS_WAITED + 5 ))
    log "Waiting for IPFS... (${IPFS_WAITED}s / ${IPFS_MAX}s max)"
  done

  if [ $IPFS_WAITED -ge $IPFS_MAX ]; then
    warn "IPFS daemon not responding within ${IPFS_MAX}s"
    warn "Check logs: docker logs ipfs.ehr.local --tail 30"
    warn "Continuing — ipfs-service will wait for IPFS on its own startup"
  else
    # Configure CORS so ipfs-service and browsers can reach the API
    log "Configuring IPFS CORS..."
    curl -s -X POST \
      "http://localhost:5001/api/v0/config?arg=API.HTTPHeaders.Access-Control-Allow-Origin&arg=[\"*\"]&json=true" \
      --output /dev/null 2>/dev/null || true
    curl -s -X POST \
      "http://localhost:5001/api/v0/config?arg=API.HTTPHeaders.Access-Control-Allow-Methods&arg=[\"PUT\",\"POST\",\"GET\"]&json=true" \
      --output /dev/null 2>/dev/null || true
    success "IPFS CORS configured"
  fi

  success "All network containers running"
  success "IPFS API:     http://localhost:5001"
  success "IPFS Gateway: http://localhost:8090"
}

# ============================================================
# STEP 4: Create channel and join all peers
# ============================================================

create_channel() {
  section "STEP 4: CREATING CHANNEL AND JOINING PEERS"

  cd "$BASE_DIR"

  # Let createChannel.sh use its own default org list.
  # Passing --orgs can conflict if createChannel.sh expects different format.
  bash "$SCRIPTS_DIR/createChannel.sh" \
    --channel "$CHANNEL_NAME" \
    --delay "$DELAY" \
    --retry "$MAX_RETRY"

  success "Channel '$CHANNEL_NAME' created and all peers joined"
}

# ============================================================
# STEP 5: Set anchor peers
# ============================================================

set_anchor_peers() {
  section "STEP 5: SETTING ANCHOR PEERS"

  cd "$BASE_DIR"

  export FABRIC_CFG_PATH=${HOME}/Data/fabric-samples/config
  export TEST_NETWORK_HOME="$BASE_DIR"
  . "$SCRIPTS_DIR/utils.sh"
  . "$SCRIPTS_DIR/envVar.sh"

  # Set peer0.hospital env vars directly — avoids any setGlobals format issues
  export CORE_PEER_LOCALMSPID="HospitalMSP"
  export CORE_PEER_TLS_ROOTCERT_FILE="$BASE_DIR/organizations/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$BASE_DIR/organizations/peerOrganizations/hospital.example.com/users/hospitaladmin/msp"
  export CORE_PEER_ADDRESS="localhost:7051"

  log "Fetching channel config to check anchor peers..."

  peer channel fetch config "$BASE_DIR/channel-artifacts/config_block.pb" \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    -c "$CHANNEL_NAME" \
    --tls --cafile "$ORDERER_TLS_CA" \
    2>/dev/null || warn "Could not fetch channel config — skipping anchor peer check"

  if [ ! -f "$BASE_DIR/channel-artifacts/config_block.pb" ]; then
    warn "Skipping anchor peer check — config block not available"
    return
  fi

  configtxlator proto_decode \
    --input  "$BASE_DIR/channel-artifacts/config_block.pb" \
    --type   common.Block \
    --output "$BASE_DIR/channel-artifacts/config_block.json" \
    2>/dev/null

  jq .data.data[0].payload.data.config \
    "$BASE_DIR/channel-artifacts/config_block.json" \
    > "$BASE_DIR/channel-artifacts/current_config.json" \
    2>/dev/null

  # Check and set anchor peers for each org
  for ORG_NUM in 1 2 3; do
    case $ORG_NUM in
      1) MSP="HospitalMSP" ;;
      2) MSP="DiagnosticsMSP" ;;
      3) MSP="ProviderMSP" ;;
    esac

    ANCHOR=$(jq -r \
      ".channel_group.groups.Application.groups.${MSP}.values.AnchorPeers.value.anchor_peers[0].host // \"not set\"" \
      "$BASE_DIR/channel-artifacts/current_config.json" 2>/dev/null)

    if [ "$ANCHOR" != "not set" ] && [ -n "$ANCHOR" ]; then
      success "  $MSP anchor peer: $ANCHOR ✓"
    else
      warn "  $MSP anchor peer not set — running setAnchorPeer.sh $ORG_NUM..."
      bash "$SCRIPTS_DIR/setAnchorPeer.sh" "$ORG_NUM" "$CHANNEL_NAME" || \
        warn "  setAnchorPeer.sh $ORG_NUM failed — check manually"
    fi
  done

  success "Anchor peer check complete"
}

# ============================================================
# STEP 6: Final status check
# ============================================================

print_status() {
  section "NETWORK STATUS"

  echo ""
  echo -e "${WHITE}  Containers:${NC}"
  docker ps --format "  {{.Names}}\t{{.Status}}" | \
    grep -E "orderer|peer|ca" | \
    while IFS= read -r line; do
      echo -e "  ${GREEN}✓${NC} $line"
    done

  echo ""
  echo -e "${WHITE}  Channel: ${GREEN}$CHANNEL_NAME${NC}"
  echo ""
  echo -e "${WHITE}  Peers on channel:${NC}"
  echo -e "  ${GREEN}✓${NC} peer0.hospital   :7051  → Auth/Reception"
  echo -e "  ${GREEN}✓${NC} peer1.hospital   :9051  → Doctor"
  echo -e "  ${GREEN}✓${NC} peer2.hospital   :10051 → Nurse/Pharmacist"
  echo -e "  ${GREEN}✓${NC} peer0.diagnostic :8051  → Lab"
  echo -e "  ${GREEN}✓${NC} peer0.provider   :11051 → Insurance"
  echo ""
  echo -e "${WHITE}  IPFS Node:${NC}"
  echo -e "  ${GREEN}✓${NC} ipfs.ehr.local"
  echo -e "      API:     http://localhost:5001"
  echo -e "      Gateway: http://localhost:8090"
  echo ""
  echo -e "${WHITE}  Role → Peer mapping:${NC}"
  echo -e "  receptionist, hospitaladmin  → peer0.hospital  :7051"
  echo -e "  doctor, medrecordofficer     → peer1.hospital  :9051"
  echo -e "  nurse, pharmacist            → peer2.hospital  :10051"
  echo -e "  labreceptionist, labtech,    → peer0.diagnostic :8051"
  echo -e "  labsupervisor, radiologist"
  echo -e "  billingofficer, claimsauditor,"
  echo -e "  insuranceofficer             → peer0.provider  :11051"
  echo ""
  echo -e "${WHITE}  Next steps:${NC}"
  echo -e "  1. Write chaincode  → chaincode/ehr-chaincode/"
  echo -e "  2. Deploy chaincode → bash scripts/deployChaincode.sh \\"
  echo -e "       --channel $CHANNEL_NAME \\"
  echo -e "       --chaincode-name ehr \\"
  echo -e "       --chaincode-path ./chaincode/ehr-chaincode \\"
  echo -e "       --version 1.0 --sequence 1"
  echo ""
}

# ============================================================
# MAIN
# ============================================================

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}       EHR Blockchain Network — Startup             ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "  Channel  : ${WHITE}$CHANNEL_NAME${NC}"
echo -e "  Enroll   : ${WHITE}$( [ "$SKIP_ENROLL" = true ] && echo "skipped" || echo "yes" )${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"

START_TIME=$SECONDS

validate_env
start_cas

if [ "$SKIP_ENROLL" = false ]; then
  enroll_identities
else
  warn "Skipping enrollment (--skip-enroll flag set)"
fi

start_network
create_channel
set_anchor_peers
print_status

ELAPSED=$(( SECONDS - START_TIME ))
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  EHR Network is UP!  (${ELAPSED}s)${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
