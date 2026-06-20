#!/bin/bash

# ============================================================
# EHR Network - Full Network Down & Cleanup Script
#
# Usage:
#   bash scripts/network-down.sh [OPTIONS]
#
# Options:
#   --keep-crypto   Keep crypto material (organizations/ folder)
#   --keep-artifacts Keep channel artifacts
#   --soft          Only stop containers, keep everything else
#   --help          Show this help
#
# Examples:
#   bash scripts/network-down.sh              # full teardown
#   bash scripts/network-down.sh --soft       # stop only, keep data
#   bash scripts/network-down.sh --keep-crypto # clean all except certs
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
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
section() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
  echo -e "${WHITE}  $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
}

# ============================================================
# DEFAULTS
# ============================================================

KEEP_CRYPTO=false
KEEP_ARTIFACTS=false
SOFT=false

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
DOCKER_DIR="$BASE_DIR/docker"
ORGANIZATIONS="$BASE_DIR/organizations"
ARTIFACTS="$BASE_DIR/channel-artifacts"

# ============================================================
# PARSE ARGUMENTS
# ============================================================

usage() {
  echo ""
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --keep-crypto    Keep organizations/ crypto material"
  echo "  --keep-artifacts Keep channel-artifacts/ folder"
  echo "  --soft           Stop containers only, keep all data"
  echo "  --help           Show this help"
  echo ""
  echo "Examples:"
  echo "  $0                    # Full teardown — clean everything"
  echo "  $0 --soft             # Stop containers only"
  echo "  $0 --keep-crypto      # Clean all except crypto material"
  echo ""
  exit 1
}

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --keep-crypto)    KEEP_CRYPTO=true ;;
    --keep-artifacts) KEEP_ARTIFACTS=true ;;
    --soft)           SOFT=true ;;
    --help|-h)        usage ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
  shift
done

# ============================================================
# PRINT PLAN
# ============================================================

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}       EHR Blockchain Network — Shutdown            ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"

if [ "$SOFT" = true ]; then
  echo -e "  Mode     : ${YELLOW}SOFT (stop only)${NC}"
else
  echo -e "  Mode     : ${RED}FULL TEARDOWN${NC}"
  echo -e "  Crypto   : ${WHITE}$( [ "$KEEP_CRYPTO" = true ] && echo "KEEP" || echo "DELETE" )${NC}"
  echo -e "  Artifacts: ${WHITE}$( [ "$KEEP_ARTIFACTS" = true ] && echo "KEEP" || echo "DELETE" )${NC}"
fi
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

# ============================================================
# STEP 1: Stop and remove containers
# ============================================================

section "STEP 1: STOPPING CONTAINERS"

# Stop network containers
if [ -f "$DOCKER_DIR/docker-compose-network.yaml" ]; then
  log "Stopping network containers (peers, orderer, IPFS)..."
  docker compose -f "$DOCKER_DIR/docker-compose-network.yaml" down \
    $( [ "$SOFT" = false ] && echo "--volumes" ) \
    --remove-orphans 2>/dev/null || warn "Network compose down had warnings"
  success "Network containers stopped"
else
  warn "docker-compose-network.yaml not found — skipping"
fi

# Stop CA containers
if [ -f "$DOCKER_DIR/docker-compose-ca.yaml" ]; then
  log "Stopping CA containers..."
  docker compose -f "$DOCKER_DIR/docker-compose-ca.yaml" down \
    --remove-orphans 2>/dev/null || warn "CA compose down had warnings"
  success "CA containers stopped"
else
  warn "docker-compose-ca.yaml not found — skipping"
fi

# Remove the external network (created manually in network-up.sh)
if [ "$SOFT" = false ]; then
  if docker network inspect ehr_network &>/dev/null; then
    log "Removing ehr_network..."
    docker network rm ehr_network 2>/dev/null && \
      success "ehr_network removed" || \
      warn "Could not remove ehr_network — may still have attached containers"
  else
    log "ehr_network not found — already gone"
  fi
fi

# ============================================================
# STEP 2: Remove chaincode containers and images
# ============================================================

section "STEP 2: REMOVING CHAINCODE CONTAINERS & IMAGES"

# Remove chaincode docker containers (auto-created by Fabric)
CC_CONTAINERS=$(docker ps -aq --filter "name=dev-peer" 2>/dev/null)
if [ -n "$CC_CONTAINERS" ]; then
  log "Removing chaincode containers..."
  docker rm -f $CC_CONTAINERS 2>/dev/null || true
  success "Chaincode containers removed"
else
  log "No chaincode containers found"
fi

# Remove chaincode docker images
CC_IMAGES=$(docker images --filter "reference=dev-peer*" -q 2>/dev/null)
if [ -n "$CC_IMAGES" ]; then
  log "Removing chaincode images..."
  docker rmi -f $CC_IMAGES 2>/dev/null || true
  success "Chaincode images removed"
else
  log "No chaincode images found"
fi

if [ "$SOFT" = true ]; then
  echo ""
  success "════════════════════════════════════════════════════"
  success " Soft stop complete — data preserved"
  success " To restart: bash scripts/network-up.sh --skip-enroll"
  success "════════════════════════════════════════════════════"
  exit 0
fi

# ============================================================
# STEP 3: Remove docker volumes
# ============================================================

section "STEP 3: REMOVING DOCKER VOLUMES"

VOLUMES=(
  "docker_orderer.example.com"
  "docker_peer0.hospital.example.com"
  "docker_peer1.hospital.example.com"
  "docker_peer2.hospital.example.com"
  "docker_peer0.diagnostic.example.com"
  "docker_peer0.provider.example.com"
  "docker_ipfs_data"
  "docker_ipfs_export"
)

for VOL in "${VOLUMES[@]}"; do
  if docker volume inspect "$VOL" &>/dev/null; then
    docker volume rm "$VOL" 2>/dev/null && \
      success "  Removed volume: $VOL" || \
      warn "  Could not remove: $VOL"
  else
    log "  Volume not found (already gone): $VOL"
  fi
done

# ============================================================
# STEP 4: Clean channel artifacts
# ============================================================

if [ "$KEEP_ARTIFACTS" = false ]; then
  section "STEP 4: CLEANING CHANNEL ARTIFACTS"

  if [ -d "$ARTIFACTS" ]; then
    log "Removing channel-artifacts/..."
    rm -rf "$ARTIFACTS"
    mkdir -p "$ARTIFACTS"
    success "channel-artifacts/ cleaned"
  else
    log "channel-artifacts/ not found — skipping"
  fi

  # Clean log file
  [ -f "$BASE_DIR/log.txt" ] && rm -f "$BASE_DIR/log.txt" && \
    success "log.txt removed"
else
  warn "Keeping channel-artifacts/ (--keep-artifacts)"
fi

# ============================================================
# STEP 5: Clean crypto material
# ============================================================

if [ "$KEEP_CRYPTO" = false ]; then
  section "STEP 5: CLEANING CRYPTO MATERIAL"

  if [ -d "$ORGANIZATIONS" ]; then

    # Clean orderer org (keep ca/ folder structure for CA server)
    log "Cleaning orderer crypto..."
    sudo rm -rf "$ORGANIZATIONS/ordererOrganizations/example.com/orderers" 2>/dev/null || \
          rm -rf "$ORGANIZATIONS/ordererOrganizations/example.com/orderers"
    sudo rm -rf "$ORGANIZATIONS/ordererOrganizations/example.com/users" 2>/dev/null || \
          rm -rf "$ORGANIZATIONS/ordererOrganizations/example.com/users"
    sudo rm -rf "$ORGANIZATIONS/ordererOrganizations/example.com/msp" 2>/dev/null || \
          rm -rf "$ORGANIZATIONS/ordererOrganizations/example.com/msp"
    success "  Orderer crypto cleaned"

    # Clean peer orgs (keep ca/ folder for CA server restart)
    for ORG_DIR in \
      "$ORGANIZATIONS/peerOrganizations/hospital.example.com" \
      "$ORGANIZATIONS/peerOrganizations/diagnostic.example.com" \
      "$ORGANIZATIONS/peerOrganizations/provider.example.com"; do

      ORG_NAME=$(basename "$ORG_DIR")
      log "Cleaning $ORG_NAME crypto..."

      sudo rm -rf "$ORG_DIR/peers"  2>/dev/null || rm -rf "$ORG_DIR/peers"
      sudo rm -rf "$ORG_DIR/users"  2>/dev/null || rm -rf "$ORG_DIR/users"
      sudo rm -rf "$ORG_DIR/msp"    2>/dev/null || rm -rf "$ORG_DIR/msp"

      success "  $ORG_NAME crypto cleaned"
    done

    # Clean CA server data (DB and generated keys — forces fresh CA on next start)
    log "Cleaning CA server data..."
    for CA_DIR in \
      "$ORGANIZATIONS/ordererOrganizations/example.com/ca" \
      "$ORGANIZATIONS/peerOrganizations/hospital.example.com/ca" \
      "$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/ca" \
      "$ORGANIZATIONS/peerOrganizations/provider.example.com/ca"; do

      if [ -d "$CA_DIR" ]; then
        sudo rm -rf "$CA_DIR" 2>/dev/null || rm -rf "$CA_DIR"
        mkdir -p "$CA_DIR"
        success "  Cleaned: $CA_DIR"
      fi
    done

    success "All crypto material cleaned"
  else
    log "organizations/ not found — skipping"
  fi

else
  warn "Keeping crypto material (--keep-crypto)"
fi

# ============================================================
# STEP 6: Remove any leftover temp files
# ============================================================

section "STEP 6: FINAL CLEANUP"

# Remove fabric-ca temp dir
[ -d "/tmp/fabric-ca-temp" ] && rm -rf /tmp/fabric-ca-temp && \
  success "Removed /tmp/fabric-ca-temp"

# Remove any stray .block or .pb files in root
find "$BASE_DIR" -maxdepth 1 -name "*.block" -delete 2>/dev/null
find "$BASE_DIR" -maxdepth 1 -name "*.pb" -delete 2>/dev/null
find "$BASE_DIR" -maxdepth 1 -name "*.json" -name "config*" -delete 2>/dev/null

success "Temp files cleaned"

# ============================================================
# DONE
# ============================================================

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  EHR Network is fully DOWN and cleaned!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${WHITE}  To bring network back up:${NC}"
echo -e "  bash scripts/network-up.sh"
echo ""

# Final docker check
REMAINING=$(docker ps --filter "name=ehr" -q 2>/dev/null)
if [ -n "$REMAINING" ]; then
  warn "Some EHR containers still running:"
  docker ps --filter "name=ehr" --format "  {{.Names}}\t{{.Status}}"
else
  success "No EHR containers running"
fi
