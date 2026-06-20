#!/usr/bin/env bash
#
# utils.sh - Logging helpers for EHR Fabric network scripts
#

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

infoln() {
  echo -e "${BLUE}[INFO]${NC} $@"
}

successln() {
  echo -e "${GREEN}[SUCCESS]${NC} $@"
}

warnln() {
  echo -e "${YELLOW}[WARN]${NC} $@"
}

errorln() {
  echo -e "${RED}[ERROR]${NC} $@" >&2
}

fatalln() {
  errorln "$@"
  exit 1
}
