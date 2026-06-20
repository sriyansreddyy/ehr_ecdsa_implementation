#!/usr/bin/env bash
#
# setAnchorPeer.sh - Set anchor peer for an org on the EHR channel
# Usage: bash scripts/setAnchorPeer.sh <org_num> <channel_name>
#
# Org nums:
#   1 = Hospital   (peer0) :7051
#   2 = Diagnostics (peer0) :8051
#   3 = Provider   (peer0) :11051
#

# ── Source helpers ────────────────────────────────────────────
TEST_NETWORK_HOME=${TEST_NETWORK_HOME:-$(cd "$(dirname "$0")/.." && pwd)}
. "${TEST_NETWORK_HOME}/scripts/utils.sh"
. "${TEST_NETWORK_HOME}/scripts/envVar.sh"
. "${TEST_NETWORK_HOME}/scripts/configUpdate.sh"

# ── Args ──────────────────────────────────────────────────────
ORG=$1
CHANNEL_NAME=$2

if [ -z "$ORG" ] || [ -z "$CHANNEL_NAME" ]; then
  echo "Usage: bash scripts/setAnchorPeer.sh <org_num> <channel_name>"
  echo "  1 = Hospital, 2 = Diagnostics, 3 = Provider"
  exit 1
fi

# ── Set peer env for this org ─────────────────────────────────
setGlobals $ORG

# ── Set FABRIC_CFG_PATH so peer binary can find core.yaml ─────
export FABRIC_CFG_PATH=${HOME}/Data/fabric-samples/config

# ── Resolve host/port and MSP ID for this org ─────────────────
if [ $ORG -eq 1 ]; then
  HOST="peer0.hospital.example.com"
  PORT=7051
  MSP_ID="HospitalMSP"
elif [ $ORG -eq 2 ]; then
  HOST="peer0.diagnostic.example.com"
  PORT=8051
  MSP_ID="DiagnosticsMSP"
elif [ $ORG -eq 3 ]; then
  HOST="peer0.provider.example.com"
  PORT=11051
  MSP_ID="ProviderMSP"
else
  errorln "Unknown org: $ORG. Use 1, 2, or 3."
  exit 1
fi

infoln "Setting anchor peer for ${MSP_ID} on channel ${CHANNEL_NAME}"
infoln "  Anchor: ${HOST}:${PORT}"

# ── Step 1: Fetch current channel config ─────────────────────
infoln "Fetching channel config..."
set -x
peer channel fetch config "${TEST_NETWORK_HOME}/channel-artifacts/config_block.pb" \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  -c $CHANNEL_NAME \
  --tls --cafile "$ORDERER_TLS_CA"
{ set +x; } 2>/dev/null

# ── Step 2: Decode config block to JSON ──────────────────────
infoln "Decoding config block..."
set -x
configtxlator proto_decode \
  --input  "${TEST_NETWORK_HOME}/channel-artifacts/config_block.pb" \
  --type   common.Block \
  --output "${TEST_NETWORK_HOME}/channel-artifacts/config_block.json"

jq .data.data[0].payload.data.config \
  "${TEST_NETWORK_HOME}/channel-artifacts/config_block.json" \
  > "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_config.json"
{ set +x; } 2>/dev/null

# ── Step 3: Inject anchor peer into modified config ───────────
infoln "Injecting anchor peer for ${MSP_ID}..."
set -x
jq \
  --arg HOST "$HOST" \
  --argjson PORT $PORT \
  '.channel_group.groups.Application.groups["'"${MSP_ID}"'"].values += {
    "AnchorPeers": {
      "mod_policy": "Admins",
      "value": {
        "anchor_peers": [{ "host": $HOST, "port": $PORT }]
      },
      "version": "0"
    }
  }' \
  "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_config.json" \
  > "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_modified_config.json"
res=$?
{ set +x; } 2>/dev/null
verifyResult $res "Failed to generate modified config JSON."

# ── Step 4: Compute config update envelope ───────────────────
infoln "Computing config update..."
set -x
configtxlator proto_encode \
  --input  "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_config.json" \
  --type   common.Config \
  --output "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_original.pb"

configtxlator proto_encode \
  --input  "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_modified_config.json" \
  --type   common.Config \
  --output "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_modified.pb"

configtxlator compute_update \
  --channel_id $CHANNEL_NAME \
  --original   "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_original.pb" \
  --updated    "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_modified.pb" \
  --output     "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_update.pb"

configtxlator proto_decode \
  --input  "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_update.pb" \
  --type   common.ConfigUpdate \
  --output "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_update.json"

echo \
  '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL_NAME'","type":2}},"data":{"config_update":'"$(cat "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_update.json")"'}}}' \
  | jq . \
  > "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_update_envelope.json"

configtxlator proto_encode \
  --input  "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_update_envelope.json" \
  --type   common.Envelope \
  --output "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_anchors.tx"
{ set +x; } 2>/dev/null

# ── Step 5: Submit anchor peer update ────────────────────────
infoln "Submitting anchor peer update..."
set -x
peer channel update \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  -c $CHANNEL_NAME \
  -f "${TEST_NETWORK_HOME}/channel-artifacts/${MSP_ID}_anchors.tx" \
  --tls --cafile "$ORDERER_TLS_CA"
res=$?
{ set +x; } 2>/dev/null
verifyResult $res "Anchor peer update failed for ${MSP_ID}."

successln "Anchor peer set for ${MSP_ID} → ${HOST}:${PORT} on channel '${CHANNEL_NAME}'"