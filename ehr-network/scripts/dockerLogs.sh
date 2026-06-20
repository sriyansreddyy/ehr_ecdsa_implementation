#!/bin/bash

# ============================================================
# EHR Network - Transaction Log Watcher
# Shows only: endorsement, commit, ordering, chaincode logs
# Filters out: gossip, TLS handshake, keep-alive noise
# ============================================================

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
LOG_DIR="$BASE_DIR/logs"
mkdir -p $LOG_DIR

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m'

# ============================================================
# FILTER PATTERN
# Only show lines matching these keywords
# ============================================================

INCLUDE_PATTERN="Committed block|Validated block|callChaincode|ProcessProposal|broadcast|received request|ordering service|consenter"

EXCLUDE_PATTERN="gossip|Gossip|tls: bad|ServerHandshake|keep-alive|keepalive|heartbeat|membership|discovery|ConnectToPeer|DeadPeer|aliveMsgStore|certStore|requestStateInfo|stateInfo|pull|Push|Hello|PeerIdentity|forward|Forward|probe|Probe|qscc|_lifecycle|DeliverFiltered|context finished|context canceled|grpc.service=protos.Deliver"

# ============================================================
# CONTAINER DEFINITIONS
# ============================================================

declare -A CONTAINERS
declare -A COLORS
declare -A LOG_FILES

CONTAINERS[orderer]="docker-orderer.example.com-1"
CONTAINERS[hospital]="docker-peer0.hospital.example.com-1"
CONTAINERS[diagnostics]="docker-peer0.diagnostic.example.com-1"
CONTAINERS[provider]="docker-peer0.provider.example.com-1"

COLORS[orderer]="$BLUE"
COLORS[hospital]="$GREEN"
COLORS[diagnostics]="$CYAN"
COLORS[provider]="$MAGENTA"

for KEY in "${!CONTAINERS[@]}"; do
  LOG_FILES[$KEY]="$LOG_DIR/${KEY}.log"
done

is_running() {
  STATUS=$(docker inspect --format='{{.State.Status}}' $1 2>/dev/null)
  [ "$STATUS" == "running" ]
}

# ============================================================
# USAGE
# ============================================================

usage() {
  echo ""
  echo "Usage: $0 [MODE]"
  echo ""
  echo "Modes:"
  echo "  stream    Live stream filtered transaction logs (default)"
  echo "  save      Save filtered logs to files in background"
  echo "  snapshot  Save current logs once to files"
  echo "  tail      Tail saved log files"
  echo "  show      Show saved log for one container: $0 show hospital"
  echo "  clear     Clear all saved log files"
  echo "  raw       Stream raw unfiltered logs (all noise included)"
  echo ""
  exit 0
}

# ============================================================
# MODE: STREAM (filtered, live)
# ============================================================

stream_logs() {
  echo ""
  echo -e "${WHITE}  EHR Network — Transaction Log Stream${NC}"
  echo -e "${WHITE}  Showing: endorsement | commit | chaincode | ordering${NC}"
  echo -e "${WHITE}  Press Ctrl+C to stop.${NC}"
  echo ""
  echo -e "  ${BLUE}■ orderer${NC}   ${GREEN}■ hospital${NC}   ${CYAN}■ diagnostics${NC}   ${MAGENTA}■ provider${NC}"
  echo ""

  PIDS=()

  for KEY in orderer hospital diagnostics provider; do
    CONTAINER="${CONTAINERS[$KEY]}"
    COLOR="${COLORS[$KEY]}"
    LOG_FILE="${LOG_FILES[$KEY]}"
    > "$LOG_FILE"

    if is_running "$CONTAINER"; then
      (
        docker logs -f --timestamps $CONTAINER 2>&1 | \
        grep --line-buffered -E "callChaincode|Committed block|Validated block|broadcast|received envelope" | \
        grep --line-buffered -v -E "cscc|lscc|_lifecycle|qscc|cscc" | \
        while IFS= read -r line; do
          CLEAN=$(echo "$line" | sed 's/.*UTC [0-9a-f]* //')
          if echo "$CLEAN" | grep -q "Committed block"; then
            echo -e "${COLOR}[${KEY}]${NC} ${GREEN}${CLEAN}${NC}"
          elif echo "$CLEAN" | grep -q "callChaincode"; then
            echo -e "${COLOR}[${KEY}]${NC} ${YELLOW}${CLEAN}${NC}"
          elif echo "$CLEAN" | grep -q "Validated block"; then
            echo -e "${COLOR}[${KEY}]${NC} ${CYAN}${CLEAN}${NC}"
          else
            echo -e "${COLOR}[${KEY}]${NC} ${BLUE}${CLEAN}${NC}"
          fi
          echo "[$KEY] $CLEAN" >> "$LOG_FILE"
        done
      ) &
      PIDS+=($!)
      echo -e "  ${GREEN}✓${NC} Watching $KEY (${CONTAINER})"
    else
      echo -e "  ${RED}✗${NC} $KEY not running"
    fi
  done

  echo ""
  echo -e "${WHITE}  Waiting for transactions...${NC}"
  echo ""

  trap "kill ${PIDS[*]} 2>/dev/null; echo ''; echo -e '${WHITE}Stopped.${NC}'; exit 0" INT
  wait
}
# ============================================================
# MODE: SAVE (background, filtered)
# ============================================================

save_logs() {
  echo ""
  echo -e "${WHITE}Saving filtered transaction logs to $LOG_DIR/...${NC}"
  echo ""

  for KEY in orderer hospital diagnostics provider; do
    CONTAINER="${CONTAINERS[$KEY]}"
    LOG_FILE="${LOG_FILES[$KEY]}"
    > "$LOG_FILE"

    if is_running "$CONTAINER"; then
      docker logs -f --timestamps $CONTAINER 2>&1 | \
        grep -E "$INCLUDE_PATTERN" | \
        grep -v -E "$EXCLUDE_PATTERN" | \
        sed "s/^/[$KEY] /" >> "$LOG_FILE" &
      echo -e "  ${GREEN}✓${NC} $KEY → $LOG_FILE (PID: $!)"
    else
      echo -e "  ${RED}✗${NC} $KEY — not running"
    fi
  done

  echo ""
  echo -e "${WHITE}Use '$0 tail' to watch or '$0 show <name>' to view.${NC}"
}

# ============================================================
# MODE: SNAPSHOT
# ============================================================

snapshot_logs() {
  echo ""
  echo -e "${WHITE}Saving log snapshot...${NC}"
  echo ""

  for KEY in orderer hospital diagnostics provider; do
    CONTAINER="${CONTAINERS[$KEY]}"
    LOG_FILE="${LOG_FILES[$KEY]}"

    if is_running "$CONTAINER"; then
      docker logs --timestamps $CONTAINER 2>&1 | \
        grep -E "$INCLUDE_PATTERN" | \
        grep -v -E "$EXCLUDE_PATTERN" | \
        sed "s/^/[$KEY] /" > "$LOG_FILE"
      LINES=$(wc -l < "$LOG_FILE")
      echo -e "  ${GREEN}✓${NC} $KEY → $LOG_FILE (${LINES} lines)"
    else
      echo -e "  ${RED}✗${NC} $KEY — not running"
    fi
  done

  echo ""
  echo -e "${GREEN}Snapshot saved to $LOG_DIR/${NC}"
}

# ============================================================
# MODE: TAIL
# ============================================================

tail_logs() {
  echo ""
  echo -e "${WHITE}Tailing saved log files...${NC}"
  echo -e "${WHITE}Press Ctrl+C to stop.${NC}"
  echo ""

  TAIL_FILES=()
  for KEY in orderer hospital diagnostics provider; do
    LOG_FILE="${LOG_FILES[$KEY]}"
    if [ -f "$LOG_FILE" ]; then
      TAIL_FILES+=("$LOG_FILE")
      echo -e "  ${GREEN}✓${NC} $LOG_FILE"
    fi
  done

  [ ${#TAIL_FILES[@]} -eq 0 ] && \
    echo -e "${RED}No log files found. Run '$0 save' first.${NC}" && exit 1

  echo ""
  tail -f "${TAIL_FILES[@]}"
}

# ============================================================
# MODE: SHOW
# ============================================================

show_log() {
  local KEY=$1

  if [ -z "$KEY" ]; then
    echo "Available: orderer hospital diagnostics provider"
    read -p "Enter name: " KEY
  fi

  LOG_FILE="${LOG_FILES[$KEY]}"

  [ -z "$LOG_FILE" ] && \
    echo -e "${RED}Unknown: $KEY${NC}" && \
    echo "Available: orderer hospital diagnostics provider" && exit 1

  [ ! -f "$LOG_FILE" ] && \
    echo -e "${YELLOW}No log file found. Run '$0 snapshot' first.${NC}" && exit 1

  echo ""
  echo -e "${WHITE}=== $KEY logs ===${NC}"
  echo -e "${WHITE}File: $LOG_FILE${NC}"
  echo ""
  less +G "$LOG_FILE"
}

# ============================================================
# MODE: RAW (no filter)
# ============================================================

raw_logs() {
  echo ""
  echo -e "${WHITE}Streaming RAW logs (no filter)...${NC}"
  echo -e "${WHITE}Press Ctrl+C to stop.${NC}"
  echo ""

  PIDS=()
  for KEY in orderer hospital diagnostics provider; do
    CONTAINER="${CONTAINERS[$KEY]}"
    COLOR="${COLORS[$KEY]}"

    if is_running "$CONTAINER"; then
      docker logs -f --timestamps $CONTAINER 2>&1 | \
        sed "s/^/${COLOR}[${KEY}]${NC} /" &
      PIDS+=($!)
    fi
  done

  trap "kill ${PIDS[*]} 2>/dev/null; exit 0" INT
  wait
}

# ============================================================
# MODE: CLEAR
# ============================================================

clear_logs() {
  echo ""
  for KEY in orderer hospital diagnostics provider; do
    LOG_FILE="${LOG_FILES[$KEY]}"
    [ -f "$LOG_FILE" ] && > "$LOG_FILE" && \
      echo -e "  ${GREEN}✓${NC} Cleared: $LOG_FILE"
  done
  echo -e "${GREEN}Done.${NC}"
}

# ============================================================
# MAIN
# ============================================================

case "${1:-stream}" in
  stream)   stream_logs ;;
  save)     save_logs ;;
  snapshot) snapshot_logs ;;
  tail)     tail_logs ;;
  show)     show_log "$2" ;;
  clear)    clear_logs ;;
  raw)      raw_logs ;;
  --help|-h) usage ;;
  *)        echo "Unknown: $1"; usage ;;
esac