#!/bin/bash
# ============================================================
# ehr_explorer.sh  —  EHR Ledger Explorer
#
# Auto-syncs new blocks from the live peer on every run
# (incremental — only fetches blocks not yet cached), then
# prints a full on-chain audit: blocks → transactions → state.
#
# World state is queried LIVE from the peer when online
# (always current), and falls back to block write-set replay
# when the peer is unreachable (offline mode).
#
# Usage:
#   bash ehr_explorer.sh              # auto-sync + full view
#   bash ehr_explorer.sh --dump       # + save output to file
#   bash ehr_explorer.sh --state      # only current world state
#   bash ehr_explorer.sh --blocks     # only block/tx log
#   bash ehr_explorer.sh --force      # re-fetch ALL blocks from scratch
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Flags ────────────────────────────────────────────────────
DO_FORCE=false
DO_DUMP=false
SHOW_BLOCKS=true
SHOW_STATE=true

for arg in "$@"; do
  case $arg in
    --force)  DO_FORCE=true ;;
    --dump)   DO_DUMP=true ;;
    --state)  SHOW_BLOCKS=false; SHOW_STATE=true ;;
    --blocks) SHOW_BLOCKS=true;  SHOW_STATE=false ;;
  esac
done

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
NC='\033[0m'

OUT=ledger_dump
mkdir -p "$OUT"

DUMP_FILE=""
if $DO_DUMP; then
  DUMP_FILE="$OUT/ehr_explorer_$(date +%Y%m%d_%H%M%S).txt"
fi

_print() {
  printf "%b\n" "$*"
  if $DO_DUMP; then
    printf "%b\n" "$*" | sed 's/\x1b\[[0-9;]*m//g' >> "$DUMP_FILE"
  fi
}

# ── Fabric env (needed for peer CLI) ─────────────────────────
export FABRIC_CFG_PATH=~/Data/fabric-samples/config
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=HospitalMSP
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE=$(pwd)/organizations/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=$(pwd)/organizations/peerOrganizations/hospital.example.com/users/hospitaladmin/msp

ORDERER_TLS=$(pwd)/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/tlscacerts/tls-localhost-7054-ca-orderer.pem
CHANNEL=ehrchannel

# ── Auto-sync: fetch only new blocks ─────────────────────────
HEIGHT=$(peer channel getinfo -c $CHANNEL 2>/dev/null \
  | grep -o '"height":[0-9]*' | cut -d: -f2 || true)

PEER_ONLINE=false

if [ -z "$HEIGHT" ]; then
  if [ -z "$(ls $OUT/block_*.json 2>/dev/null)" ]; then
    _print "${RED}ERROR: Peer unreachable and no cached blocks in $OUT/.${NC}"
    _print "Start the network with: bash scripts/network-up.sh"
    exit 1
  fi
  _print "${YELLOW}⚠ Peer unreachable — using cached blocks (offline mode)${NC}"
else
  PEER_ONLINE=true
  # Find highest locally cached block number
  MAX_LOCAL=-1
  for f in "$OUT"/block_*.json; do
    [ -f "$f" ] || continue
    n=$(basename "$f" | grep -oP '\d+')
    [ "$n" -gt "$MAX_LOCAL" ] && MAX_LOCAL=$n
  done

  NEED_FROM=$(( MAX_LOCAL + 1 ))
  NEED_TO=$(( HEIGHT - 1 ))

  if $DO_FORCE; then
    NEED_FROM=0
    _print "${CYAN}--force: re-fetching all $HEIGHT block(s)...${NC}"
  fi

  if [ "$NEED_FROM" -le "$NEED_TO" ]; then
    NEW_COUNT=$(( NEED_TO - NEED_FROM + 1 ))
    _print "${CYAN}Syncing ${WHITE}$NEW_COUNT${CYAN} new block(s) ($NEED_FROM → $NEED_TO)...${NC}"
    for i in $(seq "$NEED_FROM" "$NEED_TO"); do
      peer channel fetch $i "$OUT/block_$i.pb" \
        -c $CHANNEL -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com \
        --tls --cafile $ORDERER_TLS 2>/dev/null
      configtxlator proto_decode \
        --input "$OUT/block_$i.pb" --type common.Block \
        --output "$OUT/block_$i.json" 2>/dev/null
      _print "  ${GREEN}✓${NC} Block $i"
    done
  else
    _print "${GREEN}Already up to date${NC}  (${WHITE}$HEIGHT${NC} blocks cached)"
  fi
fi

# ── Load sorted block files ───────────────────────────────────
mapfile -t BLOCK_FILES < <(ls "$OUT"/block_*.json 2>/dev/null | sort -t_ -k2 -n)
TOTAL_BLOCKS=${#BLOCK_FILES[@]}

if [ "$TOTAL_BLOCKS" -eq 0 ]; then
  _print "${RED}No block JSON files found in $OUT/.${NC}"
  exit 1
fi

TOTAL_TXS=0
for f in "${BLOCK_FILES[@]}"; do
  n=$(jq '.data.data | length' "$f" 2>/dev/null || echo 0)
  TOTAL_TXS=$(( TOTAL_TXS + n ))
done
TOTAL_TXS=$(( TOTAL_TXS - 1 ))   # subtract genesis config tx

CHAIN_HEIGHT=$(jq -r '.header.number' "${BLOCK_FILES[-1]}" 2>/dev/null)

# ── Header banner ─────────────────────────────────────────────
_print ""
_print "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
_print "${BLUE}║${WHITE}          EHR Blockchain Explorer — ehrchannel           ${BLUE}║${NC}"
_print "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
_print ""
_print "  ${DIM}Channel   :${NC} ${WHITE}ehrchannel${NC}"
_print "  ${DIM}Blocks    :${NC} ${WHITE}$TOTAL_BLOCKS${NC}  (0 – $CHAIN_HEIGHT)"
_print "  ${DIM}Txns      :${NC} ${WHITE}$TOTAL_TXS${NC}"
_print "  ${DIM}Cache dir :${NC} ${WHITE}$OUT/${NC}"
if $DO_DUMP; then
  _print "  ${DIM}Dump file :${NC} ${CYAN}$DUMP_FILE${NC}"
fi
_print ""

# ── Helpers ───────────────────────────────────────────────────
decode_b64_json() {
  local b64="$1"
  [ -z "$b64" ] || [ "$b64" = "null" ] && return
  echo "$b64" | base64 -d 2>/dev/null
}

declare -A STATE_MAP
declare -A STATE_DELETED

collect_writes() {
  local f="$1" j="$2"
  while IFS=$'\t' read -r wkey wval wdel; do
    [ -z "$wkey" ] && continue
    STATE_MAP["$wkey"]="$wval"
    if [ "$wdel" = "true" ]; then
      STATE_DELETED["$wkey"]=1
    else
      unset "STATE_DELETED[$wkey]" 2>/dev/null || true
    fi
  done < <(jq -r \
    ".data.data[$j].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[] \
     | select(.namespace != \"_lifecycle\") \
     | .rwset.writes[] \
     | [.key, .value, (.is_delete | tostring)] | @tsv" \
    "$f" 2>/dev/null || true)
}

# ── Block / Transaction Log ───────────────────────────────────
if $SHOW_BLOCKS; then
  _print "${BLUE}══════════════════════════════════════════════════════════${NC}"
  _print "${WHITE}  BLOCK & TRANSACTION LOG${NC}"
  _print "${BLUE}══════════════════════════════════════════════════════════${NC}"

  for f in "${BLOCK_FILES[@]}"; do
    BNUM=$(jq -r '.header.number' "$f" 2>/dev/null)
    PREV=$(jq -r '.header.previous_hash' "$f" 2>/dev/null | cut -c1-20)
    DHASH=$(jq -r '.header.data_hash'    "$f" 2>/dev/null | cut -c1-20)
    TX_COUNT=$(jq '.data.data | length'  "$f" 2>/dev/null)

    _print ""
    _print "${CYAN}┌─ Block ${WHITE}#${BNUM}${CYAN} ──────────────────────────────────────────────${NC}"
    _print "${CYAN}│${NC}  prev_hash : ${DIM}${PREV}...${NC}"
    _print "${CYAN}│${NC}  data_hash : ${DIM}${DHASH}...${NC}"

    if [ "$BNUM" = "0" ]; then
      _print "${CYAN}│${NC}  ${YELLOW}[Genesis block — channel configuration]${NC}"
      _print "${CYAN}└──────────────────────────────────────────────────────────${NC}"
      continue
    fi

    _print "${CYAN}│${NC}  txns      : ${WHITE}$TX_COUNT${NC}"

    for j in $(seq 0 $(( TX_COUNT - 1 ))); do
      TXID=$(jq -r ".data.data[$j].payload.header.channel_header.tx_id" "$f" 2>/dev/null)
      TS=$(jq -r   ".data.data[$j].payload.header.channel_header.timestamp" "$f" 2>/dev/null)
      MSP=$(jq -r  ".data.data[$j].payload.header.signature_header.creator.mspid" "$f" 2>/dev/null)

      CERT_B64=$(jq -r ".data.data[$j].payload.header.signature_header.creator.id_bytes" "$f" 2>/dev/null)
      CN=""
      if [ -n "$CERT_B64" ] && [ "$CERT_B64" != "null" ]; then
        CN=$(echo "$CERT_B64" | base64 -d 2>/dev/null | \
          openssl x509 -noout -subject 2>/dev/null | grep -oP 'CN=\K[^,/]+' || true)
      fi

      FN_B64=$(jq -r ".data.data[$j].payload.data.actions[0].payload.chaincode_proposal_payload.input.chaincode_spec.input.args[0]" "$f" 2>/dev/null)
      FN=$(echo "$FN_B64" | base64 -d 2>/dev/null || true)

      EXTRA_ARGS=$(jq -r ".data.data[$j].payload.data.actions[0].payload.chaincode_proposal_payload.input.chaincode_spec.input.args[1:][]" "$f" 2>/dev/null \
        | while IFS= read -r a; do echo "$a" | base64 -d 2>/dev/null; printf " "; done || true)

      RESP_STATUS=$(jq -r ".data.data[$j].payload.data.actions[0].payload.action.proposal_response_payload.extension.response.status" "$f" 2>/dev/null)

      ENDORSERS=$(jq -r ".data.data[$j].payload.data.actions[0].payload.action.endorsements[].endorser" "$f" 2>/dev/null \
        | while IFS= read -r e; do
            echo "$e" | base64 -d 2>/dev/null | python3 -c "
import sys
d = sys.stdin.buffer.read()
try:
    i = 0
    while i < len(d):
        if d[i] == 0x0a:
            l = d[i+1]
            print(d[i+2:i+2+l].decode('utf-8', errors='ignore'))
            break
        i += 1
except: pass
" 2>/dev/null
          done | tr '\n' ' ' || true)

      READ_KEYS=$(jq -r ".data.data[$j].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[] | select(.namespace != \"_lifecycle\") | .rwset.reads[]?.key" "$f" 2>/dev/null | tr '\n' '  ' || true)
      WRITE_KEYS=$(jq -r ".data.data[$j].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[] | select(.namespace != \"_lifecycle\") | .rwset.writes[]?.key" "$f" 2>/dev/null | tr '\n' '  ' || true)

      _print "${CYAN}│${NC}"
      _print "${CYAN}│  ${WHITE}Tx #$j${NC}"
      _print "${CYAN}│${NC}  TxID      : ${DIM}$TXID${NC}"
      _print "${CYAN}│${NC}  Time      : ${WHITE}$TS${NC}"
      _print "${CYAN}│${NC}  Creator   : ${GREEN}$MSP${NC}  ${DIM}($CN)${NC}"
      _print "${CYAN}│${NC}  Function  : ${YELLOW}$FN${NC}  ${DIM}$EXTRA_ARGS${NC}"
      [ -n "$READ_KEYS"  ] && _print "${CYAN}│${NC}  Reads     : ${DIM}$READ_KEYS${NC}"
      [ -n "$WRITE_KEYS" ] && _print "${CYAN}│${NC}  Writes    : ${WHITE}$WRITE_KEYS${NC}"
      [ -n "$ENDORSERS"  ] && _print "${CYAN}│${NC}  Endorsed  : ${DIM}$ENDORSERS${NC}"
      if [ "$RESP_STATUS" = "200" ]; then
        _print "${CYAN}│${NC}  Response  : ${GREEN}200 OK${NC}"
      else
        _print "${CYAN}│${NC}  Response  : ${RED}$RESP_STATUS${NC}"
      fi

      collect_writes "$f" "$j"
    done

    _print "${CYAN}└──────────────────────────────────────────────────────────${NC}"
  done

else
  # Build STATE_MAP without printing blocks
  for f in "${BLOCK_FILES[@]}"; do
    TX_COUNT=$(jq '.data.data | length' "$f" 2>/dev/null)
    for j in $(seq 0 $(( TX_COUNT - 1 ))); do
      collect_writes "$f" "$j"
    done
  done
fi

# ── Helpers: print a single JSON record ──────────────────────
print_record() {
  local label="$1" color="$2" json="$3"
  _print ""
  _print "  ${color}┌─ ${label}${NC}"
  if [ -z "$json" ] || ! echo "$json" | jq . >/dev/null 2>&1; then
    _print "  │  ${DIM}(no value / not decodable)${NC}"
  else
    while IFS= read -r line; do
      _print "  │  ${DIM}$line${NC}"
    done < <(echo "$json" | jq -r '
      to_entries[] |
      if (.value | type) == "array" then
        if (.value | length) == 0 then "\(.key)  :  []"
        else
          "\(.key)  :",
          (.value[] | "    → " + (if type == "object" then tojson else tostring end))
        end
      elif (.value | type) == "object" then
        "\(.key)  :",
        (.value | to_entries[] | "    \(.key): \(.value)")
      else "\(.key)  :  \(.value)"
      end
    ' 2>/dev/null)
  fi
  _print "  └──"
}

# ── Peer chaincode query shorthand ───────────────────────────
cc_query() {
  peer chaincode query -C "$CHANNEL" -n ehr -c "$1" 2>/dev/null
}

# ── Current World State ───────────────────────────────────────
if $SHOW_STATE; then
  _print ""
  _print "${BLUE}══════════════════════════════════════════════════════════${NC}"

  if $PEER_ONLINE; then
    _print "${WHITE}  CURRENT WORLD STATE  ${GREEN}[live — queried from ledger]${NC}"
    _print "${BLUE}══════════════════════════════════════════════════════════${NC}"

    # ── PATIENT RECORDS ──────────────────────────────────────
    PATIENTS_JSON=$(cc_query '{"Args":["PatientContract:ListAllPatients"]}')
    N_PATIENTS=$(echo "$PATIENTS_JSON" | jq 'length' 2>/dev/null || echo 0)
    _print ""
    _print "  ${GREEN}▶ PATIENT RECORDS${NC}"
    if [ "$N_PATIENTS" -gt 0 ] 2>/dev/null; then
      while IFS= read -r patient; do
        pid=$(echo "$patient" | jq -r '.patientId' 2>/dev/null)
        print_record "PATIENT:$pid" "$GREEN" "$patient"
      done < <(echo "$PATIENTS_JSON" | jq -c '.[]' 2>/dev/null)
    else
      _print "  ${DIM}(none)${NC}"
    fi

    # ── EHR DOCUMENTS ────────────────────────────────────────
    _print ""
    _print "  ${MAGENTA}▶ EHR DOCUMENTS${NC}"
    N_EHR=0
    while IFS= read -r pid; do
      [ -z "$pid" ] && continue
      ehr=$(cc_query "{\"Args\":[\"EhrContract:GetEHRRecord\",\"$pid\"]}")
      [ -z "$ehr" ] && continue
      print_record "EHR:$pid" "$MAGENTA" "$ehr"
      N_EHR=$(( N_EHR + 1 ))
    done < <(echo "$PATIENTS_JSON" | jq -r '.[].patientId' 2>/dev/null)
    [ "$N_EHR" -eq 0 ] && _print "  ${DIM}(none)${NC}"

    # ── VISIT RECORDS ────────────────────────────────────────
    VISITS_JSON=$(cc_query '{"Args":["VisitContract:ListAllVisits"]}')
    N_VISITS=$(echo "$VISITS_JSON" | jq 'length' 2>/dev/null || echo 0)
    _print ""
    _print "  ${CYAN}▶ VISIT RECORDS${NC}"
    if [ "$N_VISITS" -gt 0 ] 2>/dev/null; then
      while IFS= read -r visit; do
        vid=$(echo "$visit" | jq -r '.visitId' 2>/dev/null)
        print_record "VISIT:$vid" "$CYAN" "$visit"
      done < <(echo "$VISITS_JSON" | jq -c '.[]' 2>/dev/null)
    else
      _print "  ${DIM}(none)${NC}"
    fi

    # ── ACCESS CONTROL ────────────────────────────────────────
    _print ""
    _print "  ${YELLOW}▶ ACCESS CONTROL${NC}"
    N_ACCESS=0
    while IFS= read -r pid; do
      [ -z "$pid" ] && continue
      acc=$(cc_query "{\"Args\":[\"AccessContract:GetAccessList\",\"$pid\"]}")
      [ -z "$acc" ] && continue
      # skip if no grants and no audit log
      has_data=$(echo "$acc" | jq '(.grants | length) + (.auditLog | length)' 2>/dev/null || echo 0)
      [ "$has_data" -eq 0 ] && continue
      print_record "ACCESS:$pid" "$YELLOW" "$acc"
      N_ACCESS=$(( N_ACCESS + 1 ))
    done < <(echo "$PATIENTS_JSON" | jq -r '.[].patientId' 2>/dev/null)
    [ "$N_ACCESS" -eq 0 ] && _print "  ${DIM}(none)${NC}"

  else
    # ── Offline: reconstruct from block write sets ────────────
    _print "${WHITE}  CURRENT WORLD STATE  ${YELLOW}[offline — reconstructed from cached blocks]${NC}"
    _print "${BLUE}══════════════════════════════════════════════════════════${NC}"

    mapfile -t SORTED_KEYS < <(printf '%s\n' "${!STATE_MAP[@]}" | sort)
    PREV_PREFIX=""
    N_PATIENTS=0; N_VISITS=0; N_EHR=0; N_ACCESS=0

    for key in "${SORTED_KEYS[@]}"; do
      PREFIX="${key%%:*}"
      ID="${key#*:}"

      if [ "$PREFIX" != "$PREV_PREFIX" ]; then
        _print ""
        case "$PREFIX" in
          PATIENT) _print "  ${GREEN}▶ PATIENT RECORDS${NC}" ;;
          VISIT)   _print "  ${CYAN}▶ VISIT RECORDS${NC}" ;;
          EHR)     _print "  ${MAGENTA}▶ EHR DOCUMENTS${NC}" ;;
          ACCESS)  _print "  ${YELLOW}▶ ACCESS CONTROL${NC}" ;;
          *)       _print "  ${WHITE}▶ $PREFIX${NC}" ;;
        esac
        PREV_PREFIX="$PREFIX"
      fi

      if [ -n "${STATE_DELETED[$key]+_}" ]; then
        _print "  ${RED}[DELETED]${NC}  $key"
        continue
      fi

      case "$PREFIX" in
        PATIENT) COLOR="$GREEN";   N_PATIENTS=$(( N_PATIENTS + 1 )) ;;
        VISIT)   COLOR="$CYAN";    N_VISITS=$(( N_VISITS + 1 )) ;;
        EHR)     COLOR="$MAGENTA"; N_EHR=$(( N_EHR + 1 )) ;;
        ACCESS)  COLOR="$YELLOW";  N_ACCESS=$(( N_ACCESS + 1 )) ;;
        *)       COLOR="$WHITE" ;;
      esac

      DECODED=$(decode_b64_json "${STATE_MAP[$key]}")
      print_record "$key" "$COLOR" "$DECODED"
    done
  fi

  _print ""
  _print "${BLUE}══════════════════════════════════════════════════════════${NC}"
  _print "${WHITE}  WORLD STATE SUMMARY${NC}"
  _print "${BLUE}══════════════════════════════════════════════════════════${NC}"
  _print ""
  _print "  ${GREEN}Patients     :${NC} ${WHITE}${N_PATIENTS:-0}${NC}"
  _print "  ${CYAN}Visits       :${NC} ${WHITE}${N_VISITS:-0}${NC}"
  _print "  ${MAGENTA}EHR docs     :${NC} ${WHITE}${N_EHR:-0}${NC}"
  _print "  ${YELLOW}Access logs  :${NC} ${WHITE}${N_ACCESS:-0}${NC}"
fi

# ── Footer ────────────────────────────────────────────────────
_print ""
_print "${BLUE}══════════════════════════════════════════════════════════${NC}"
_print "${WHITE}  Quick tips${NC}"
_print "${BLUE}══════════════════════════════════════════════════════════${NC}"
_print ""
_print "  ${CYAN}# Decode write value from block 5:${NC}"
_print "  cat $OUT/block_5.json | jq -r '.data.data[0].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.writes[0].value' | base64 -d | jq ."
_print ""
_print "  ${CYAN}# Inspect creator certificate from block 5:${NC}"
_print "  cat $OUT/block_5.json | jq -r '.data.data[0].payload.header.signature_header.creator.id_bytes' | base64 -d | openssl x509 -noout -text"
_print ""
if $DO_DUMP; then
  _print "  ${GREEN}Full dump saved to: $DUMP_FILE${NC}"
  _print ""
fi
