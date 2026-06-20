#!/usr/bin/env bash
#
# configUpdate.sh - Channel config fetch and update helpers
# Requires: peer, configtxlator, jq
#

# fetchChannelConfig <org_num> <channel_name> <output_json>
fetchChannelConfig() {
  local ORG=$1
  local CHANNEL=$2
  local OUTPUT=$3

  setGlobals $ORG

  infoln "Fetching channel config block for channel: $CHANNEL"
  set -x
  peer channel fetch config channel-artifacts/config_block.pb \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    -c $CHANNEL \
    --tls --cafile "$ORDERER_CA"
  { set +x; } 2>/dev/null

  infoln "Decoding config block to JSON"
  set -x
  configtxlator proto_decode \
    --input channel-artifacts/config_block.pb \
    --type common.Block \
    --output channel-artifacts/config_block.json

  jq .data.data[0].payload.data.config \
    channel-artifacts/config_block.json > "$OUTPUT"
  { set +x; } 2>/dev/null
}

# createConfigUpdate <channel> <original_json> <modified_json> <output_tx>
createConfigUpdate() {
  local CHANNEL=$1
  local ORIGINAL=$2
  local MODIFIED=$3
  local OUTPUT=$4

  set -x
  configtxlator proto_encode \
    --input "$ORIGINAL" \
    --type common.Config \
    --output channel-artifacts/original_config.pb

  configtxlator proto_encode \
    --input "$MODIFIED" \
    --type common.Config \
    --output channel-artifacts/modified_config.pb

  configtxlator compute_update \
    --channel_id $CHANNEL \
    --original channel-artifacts/original_config.pb \
    --updated  channel-artifacts/modified_config.pb \
    --output   channel-artifacts/config_update.pb

  configtxlator proto_decode \
    --input channel-artifacts/config_update.pb \
    --type common.ConfigUpdate \
    --output channel-artifacts/config_update.json

  echo '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL'","type":2}},"data":{"config_update":'$(cat channel-artifacts/config_update.json)'}}}' \
    | jq . > channel-artifacts/config_update_in_envelope.json

  configtxlator proto_encode \
    --input channel-artifacts/config_update_in_envelope.json \
    --type common.Envelope \
    --output "$OUTPUT"
  { set +x; } 2>/dev/null
}
