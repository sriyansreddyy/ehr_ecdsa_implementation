#!/usr/bin/env bash
#
# createChannel.sh - Create EHR channel and join all peers
#
# Usage:
#   ./scripts/createChannel.sh [OPTIONS]
#
# Options:
#   --channel   Channel name (default: ehrchannel)
#   --orgs      Comma-separated org numbers to join (default: 1,2,3,4,5)
#               1=Hospital peer0, 2=Diagnostics, 3=Provider,
#               4=Hospital peer1, 5=Hospital peer2
#   --delay     Delay between retries in seconds (default: 3)
#   --retry     Max retry attempts (default: 5)
#   --verbose   Enable verbose output
#
# Examples:
#   ./scripts/createChannel.sh
#   ./scripts/createChannel.sh --channel ehrchannel --orgs 1,2,3,4,5
#   ./scripts/createChannel.sh --channel ehrchannel --orgs 1,4,5
#

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
. "$SCRIPT_DIR/utils.sh"
. "$SCRIPT_DIR/envVar.sh"

# ============================================================
# DEFAULTS
# ============================================================

CHANNEL_NAME="ehrchannel"
ORGS_TO_JOIN="1,2,3,4,5"
DELAY=3
MAX_RETRY=5
VERBOSE=false

# ============================================================
# PARSE ARGUMENTS
# ============================================================

usage() {
  echo ""
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --channel   Channel name (default: ehrchannel)"
  echo "  --orgs      Comma-separated org numbers (default: 1,2,3,4,5)"
  echo "              1=Hospital peer0 (Auth)   :7051"
  echo "              2=Diagnostics (Lab)        :8051"
  echo "              3=Provider (Insurance)     :11051"
  echo "              4=Hospital peer1 (Doctor)  :9051"
  echo "              5=Hospital peer2 (Nurse)   :10051"
  echo "  --delay     Retry delay in seconds (default: 3)"
  echo "  --retry     Max retries (default: 5)"
  echo "  --verbose   Verbose mode"
  echo ""
  exit 1
}

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --channel)  CHANNEL_NAME="$2"; shift ;;
    --orgs)     ORGS_TO_JOIN="$2"; shift ;;
    --delay)    DELAY="$2";        shift ;;
    --retry)    MAX_RETRY="$2";    shift ;;
    --verbose)  VERBOSE=true ;;
    --help|-h)  usage ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
  shift
done

# ============================================================
# PATHS
# ============================================================

CONFIGTX_PATH=${PWD}/configtx
PEER_CFG_PATH=${HOME}/Data/fabric-samples/config
ORDERER_TLS_DIR=${TEST_NETWORK_HOME}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls

[ ! -d "channel-artifacts" ] && mkdir -p channel-artifacts

IFS=',' read -ra ORG_LIST <<< "$ORGS_TO_JOIN"

# ============================================================
# PRINT SUMMARY
# ============================================================

org_name() {
  case $1 in
    1) echo "Hospital-peer0 (Auth/Reception)" ;;
    2) echo "Diagnostics (Lab)" ;;
    3) echo "Provider (Insurance)" ;;
    4) echo "Hospital-peer1 (Doctor)" ;;
    5) echo "Hospital-peer2 (Nurse/Pharma)" ;;
    *) echo "Unknown-$1" ;;
  esac
}

echo ""
echo "════════════════════════════════════════════════════"
echo "  EHR Network - Channel Setup"
echo "════════════════════════════════════════════════════"
echo "  Channel  : $CHANNEL_NAME"
echo "  Peers    :"
for ORG in "${ORG_LIST[@]}"; do
  echo "    [$ORG] $(org_name $ORG)"
done
echo "  Delay    : ${DELAY}s"
echo "  Retries  : $MAX_RETRY"
echo "════════════════════════════════════════════════════"
echo ""

# ============================================================
# STEP 1: Generate channel genesis block
# ============================================================

createChannelGenesisBlock() {
  which configtxgen || fatalln "configtxgen not found. Add fabric bin to PATH."

  infoln "Generating channel genesis block: ${CHANNEL_NAME}.block"
  export FABRIC_CFG_PATH=$CONFIGTX_PATH

  set -x
  configtxgen \
    -profile EHRChannel \
    -outputBlock ./channel-artifacts/${CHANNEL_NAME}.block \
    -channelID $CHANNEL_NAME
  res=$?
  { set +x; } 2>/dev/null

  verifyResult $res "Failed to generate channel genesis block."
  successln "Genesis block generated: channel-artifacts/${CHANNEL_NAME}.block"
}

# ============================================================
# STEP 2: Submit genesis block to orderer via osnadmin
# ============================================================

createChannel() {
  infoln "Submitting genesis block to orderer via osnadmin..."

  local rc=1
  local COUNTER=1

  while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
    sleep $DELAY
    set -x
    osnadmin channel join \
      --channelID    $CHANNEL_NAME \
      --config-block ./channel-artifacts/${CHANNEL_NAME}.block \
      -o             localhost:7053 \
      --ca-file      "${ORDERER_TLS_DIR}/tlscacerts/tls-localhost-7054-ca-orderer.pem" \
      --client-cert  "${ORDERER_TLS_DIR}/server.crt" \
      --client-key   "${ORDERER_TLS_DIR}/server.key" \
      >&log.txt
    res=$?
    { set +x; } 2>/dev/null

    if grep -q "channel already exists" log.txt 2>/dev/null; then
      infoln "Channel already exists on orderer — skipping"
      rc=0
    else
      rc=$res
    fi
    COUNTER=$(( COUNTER + 1 ))
  done

  cat log.txt
  verifyResult $rc "Channel creation failed after $MAX_RETRY attempts."
}

# ============================================================
# STEP 3: Join a peer to the channel
# ============================================================

joinChannel() {
  local ORG_NUM=$1
  infoln "  Joining $(org_name $ORG_NUM) (org $ORG_NUM)..."

  setGlobals $ORG_NUM
  export FABRIC_CFG_PATH=$PEER_CFG_PATH

  local rc=1
  local COUNTER=1

  while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
    sleep $DELAY
    set -x
    peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block >&log.txt
    res=$?
    { set +x; } 2>/dev/null
    rc=$res
    COUNTER=$(( COUNTER + 1 ))
  done

  cat log.txt
  verifyResult $rc "$(org_name $ORG_NUM) failed to join '${CHANNEL_NAME}' after $MAX_RETRY attempts."
  successln "  $(org_name $ORG_NUM) joined channel '${CHANNEL_NAME}'"
}

# ============================================================
# MAIN
# ============================================================

infoln "Step 1: Generating channel genesis block"
createChannelGenesisBlock

infoln "Step 2: Creating channel on orderer"
createChannel
successln "Channel '${CHANNEL_NAME}' created on orderer"

infoln "Step 3: Joining peers to channel"
for ORG in "${ORG_LIST[@]}"; do
  joinChannel $ORG
done

echo ""
successln "════════════════════════════════════════════════════"
successln " Channel '${CHANNEL_NAME}' setup complete!"
successln " Peers joined:"
for ORG in "${ORG_LIST[@]}"; do
  successln "   [$ORG] $(org_name $ORG)"
done
successln "════════════════════════════════════════════════════"
successln ""
successln " Next: Set anchor peers"
successln "   ./scripts/setAnchorPeer.sh 1 $CHANNEL_NAME"
successln "   ./scripts/setAnchorPeer.sh 2 $CHANNEL_NAME"
successln "   ./scripts/setAnchorPeer.sh 3 $CHANNEL_NAME"
