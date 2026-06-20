#!/bin/bash
# ============================================================
# start_all.sh  —  Start all EHR backend APIs
#
# Opens every backend as a tab in a single gnome-terminal window.
#
# Usage:
#   bash start_all.sh        # npm start  (node)
#   bash start_all.sh --dev  # npm run dev (nodemon)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CMD="npm start"
[ "${1:-}" = "--dev" ] && CMD="npm run dev"

# ipfs-service first — all other APIs depend on it
ORDERED=(ipfs-service peer0-api peer1-api peer2-api extorg-api patient-api)

declare -A PORT=(
  [ipfs-service]=3006
  [peer0-api]=3001
  [peer1-api]=3002
  [peer2-api]=3003
  [extorg-api]=3004
  [patient-api]=3005
)

declare -A ROLE=(
  [ipfs-service]="IPFS service"
  [peer0-api]="Receptionist / Admin"
  [peer1-api]="Doctor"
  [peer2-api]="Nurse / Pharmacist / MedRecord"
  [extorg-api]="Lab / Claims"
  [patient-api]="Patient portal"
)

echo ""
echo "Starting EHR backends  ($CMD)"
echo "────────────────────────────────────────────────"

# Check node_modules and build the --tab arguments
TAB_ARGS=()

for name in "${ORDERED[@]}"; do
  dir="$SCRIPT_DIR/$name"

  if [ ! -d "$dir" ]; then
    echo "  ✗  $name — directory not found, skipping"
    continue
  fi

  if [ ! -d "$dir/node_modules" ]; then
    echo "  ⚠  $name — node_modules missing, running npm install..."
    (cd "$dir" && npm install --silent)
  fi

  port="${PORT[$name]}"
  role="${ROLE[$name]}"

  TAB_ARGS+=(
    --tab
    --title="$name :$port"
    --command="bash -c \"
      printf '\n  \033[1m%s\033[0m  —  %s\n' '$name' '$role'
      printf '  Port : %s\n\n' '$port'
      cd '$dir' && $CMD
      printf '\n  [process exited — press Enter to close]\n'
      read
    \""
  )

  echo "  ✓  $name  :$port  —  ${ROLE[$name]}"
done

echo "────────────────────────────────────────────────"

# Open all tabs in one window
gnome-terminal "${TAB_ARGS[@]}" 2>/dev/null

echo "All backends launched in one terminal window ($CMD)."
echo ""
