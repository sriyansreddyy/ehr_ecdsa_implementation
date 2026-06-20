#!/bin/bash

# ============================================================
# dump_ledger.sh
# Fetches every block on ehrchannel, decodes to JSON,
# then prints a human-readable summary of every transaction.
#
# Usage:
#   cd ~/Data/fabric-samples/ehr_test_6/ehr-network
#   bash dump_ledger.sh
# ============================================================

cd ~/Data/fabric-samples/ehr_test_7/ehr-network

export FABRIC_CFG_PATH=~/Data/fabric-samples/config
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=HospitalMSP
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE=$(pwd)/organizations/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=$(pwd)/organizations/peerOrganizations/hospital.example.com/users/hospitaladmin/msp

ORDERER_TLS=$(pwd)/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/tlscacerts/tls-localhost-7054-ca-orderer.pem
CHANNEL=ehrchannel
OUT=ledger_dump

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

mkdir -p $OUT

# ── Get chain height ──────────────────────────────────────────

HEIGHT=$(peer channel getinfo -c $CHANNEL 2>/dev/null \
  | grep -o '"height":[0-9]*' | cut -d: -f2)

if [ -z "$HEIGHT" ]; then
  echo -e "${RED}ERROR: Could not get channel info. Is the peer running?${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}  EHR Ledger Dump — channel: $CHANNEL${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "  Total blocks : ${WHITE}$HEIGHT${NC}  (block 0 to $((HEIGHT-1)))"
echo -e "  Output dir   : ${WHITE}$OUT/${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"

# ── Fetch and decode all blocks ───────────────────────────────

echo ""
echo -e "${CYAN}Fetching blocks...${NC}"

for i in $(seq 0 $((HEIGHT-1))); do
  peer channel fetch $i $OUT/block_$i.pb \
    -c $CHANNEL \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls --cafile $ORDERER_TLS \
    2>/dev/null

  configtxlator proto_decode \
    --input  $OUT/block_$i.pb \
    --type   common.Block \
    --output $OUT/block_$i.json \
    2>/dev/null

  echo -e "  ${GREEN}✓${NC} Block $i → $OUT/block_$i.json"
done

# ── Print human-readable summary ─────────────────────────────

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}  LEDGER CONTENTS${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"

for i in $(seq 0 $((HEIGHT-1))); do
  f="$OUT/block_$i.json"
  [ ! -f "$f" ] && continue

  BLOCK_NUM=$(cat $f | jq -r '.header.number' 2>/dev/null)
  PREV_HASH=$(cat $f | jq -r '.header.previous_hash' 2>/dev/null | head -c 16)
  DATA_HASH=$(cat $f | jq -r '.header.data_hash' 2>/dev/null | head -c 16)

  echo ""
  echo -e "${CYAN}── Block $BLOCK_NUM ──────────────────────────────────────${NC}"
  echo -e "   prev_hash : ${PREV_HASH}..."
  echo -e "   data_hash : ${DATA_HASH}..."

  # Genesis block — config only
  if [ "$BLOCK_NUM" = "0" ]; then
    echo -e "   ${YELLOW}[Genesis block — channel configuration, no transactions]${NC}"
    continue
  fi

  TX_COUNT=$(cat $f | jq '.data.data | length' 2>/dev/null)
  echo -e "   txns      : $TX_COUNT"

  for j in $(seq 0 $((TX_COUNT-1))); do
    echo ""

    # TX ID
    TXID=$(cat $f | jq -r ".data.data[$j].payload.header.channel_header.tx_id" 2>/dev/null)
    echo -e "   ${WHITE}Transaction $j${NC}"
    echo -e "   TxID      : ${TXID}"

    # Timestamp
    TS=$(cat $f | jq -r ".data.data[$j].payload.header.channel_header.timestamp" 2>/dev/null)
    echo -e "   Timestamp : $TS"

    # Creator MSP
    MSP=$(cat $f | jq -r ".data.data[$j].payload.header.signature_header.creator.mspid" 2>/dev/null)
    echo -e "   Creator   : ${GREEN}$MSP${NC}"

    # Creator certificate CN
    CERT_B64=$(cat $f | jq -r ".data.data[$j].payload.header.signature_header.creator.id_bytes" 2>/dev/null)
    if [ -n "$CERT_B64" ] && [ "$CERT_B64" != "null" ]; then
      CN=$(echo "$CERT_B64" | base64 -d 2>/dev/null | \
        openssl x509 -noout -subject 2>/dev/null | grep -oP 'CN=\K[^,/]+')
      [ -n "$CN" ] && echo -e "   Identity  : ${GREEN}$CN${NC}"
    fi

    # Chaincode args
    ARGS=$(cat $f | jq -r ".data.data[$j].payload.data.actions[0].payload.chaincode_proposal_payload.input.chaincode_spec.input.args[]" 2>/dev/null \
      | while read arg; do
          decoded=$(echo "$arg" | base64 -d 2>/dev/null)
          printf "'%s' " "$decoded"
        done)
    echo -e "   Function  : ${YELLOW}$ARGS${NC}"

    # Read set
    READ_KEYS=$(cat $f | jq -r ".data.data[$j].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[] | select(.namespace != \"_lifecycle\") | .rwset.reads[]?.key" 2>/dev/null | tr '\n' ' ')
    [ -n "$READ_KEYS" ] && echo -e "   Reads     : $READ_KEYS"

    # Write set
    WRITE_KEYS=$(cat $f | jq -r ".data.data[$j].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[] | select(.namespace != \"_lifecycle\") | .rwset.writes[]?.key" 2>/dev/null | tr '\n' ' ')
    [ -n "$WRITE_KEYS" ] && echo -e "   Writes    : $WRITE_KEYS"

    # Decode written value — patient JSON
    WRITE_VAL=$(cat $f | jq -r ".data.data[$j].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[] | select(.namespace != \"_lifecycle\") | .rwset.writes[0].value" 2>/dev/null \
      | base64 -d 2>/dev/null)
    if [ -n "$WRITE_VAL" ]; then
      P_ID=$(echo "$WRITE_VAL" | jq -r '.patientId' 2>/dev/null)
      P_ST=$(echo "$WRITE_VAL" | jq -r '.status' 2>/dev/null)
      [ -n "$P_ID" ] && [ "$P_ID" != "null" ] && \
        echo -e "   Patient   : ${WHITE}$P_ID${NC} → ${GREEN}$P_ST${NC}"
    fi

    # Response status
    RESP=$(cat $f | jq -r ".data.data[$j].payload.data.actions[0].payload.action.proposal_response_payload.extension.response.status" 2>/dev/null)
    [ "$RESP" = "200" ] && \
      echo -e "   Response  : ${GREEN}$RESP OK${NC}" || \
      echo -e "   Response  : ${RED}$RESP${NC}"

    # Endorsers
    ENDORSERS=$(cat $f | jq -r ".data.data[$j].payload.data.actions[0].payload.action.endorsements[].endorser.mspid" 2>/dev/null | tr '\n' ' ')
    [ -n "$ENDORSERS" ] && echo -e "   Endorsed  : $ENDORSERS"

  done
done

# ── Footer ────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${WHITE}  Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "  Blocks      : ${WHITE}$HEIGHT${NC}"
echo -e "  Raw blocks  : ${CYAN}$OUT/block_N.pb${NC}"
echo -e "  Decoded JSON: ${CYAN}$OUT/block_N.json${NC}"
echo ""
echo -e "  Useful queries:"
echo -e "  ${CYAN}# See full patient JSON from block 5:${NC}"
echo -e "  cat $OUT/block_5.json | jq '.data.data[0].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[0].rwset.writes[0].value' -r | base64 -d | jq ."
echo ""
echo -e "  ${CYAN}# See caller certificate from block 5:${NC}"
echo -e "  cat $OUT/block_5.json | jq '.data.data[0].payload.header.signature_header.creator.id_bytes' -r | base64 -d | openssl x509 -noout -text"
echo ""
