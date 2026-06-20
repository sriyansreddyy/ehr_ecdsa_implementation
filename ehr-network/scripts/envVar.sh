#!/usr/bin/env bash
#
# envVar.sh - Environment variables for EHR Hyperledger Fabric Network
#
# Organizations:
#   1 = Hospital   → peer0 (Auth/Reception), peer1 (Doctor), peer2 (Nurse/Pharma)
#   2 = Diagnostics → peer0 (Lab)
#   3 = Provider   → peer0 (Insurance)
#
# Hospital peer numbers:
#   1 = peer0.hospital (Auth/Reception)  port 7051
#   4 = peer1.hospital (Doctor)          port 9051
#   5 = peer2.hospital (Nurse/Pharma)    port 10051
#

export TEST_NETWORK_HOME=$(pwd)
export CORE_PEER_TLS_ENABLED=true

# ── Orderer ──────────────────────────────────────────────────
export ORDERER_CA=${TEST_NETWORK_HOME}/organizations/ordererOrganizations/example.com/ca/ca-cert.pem
export ORDERER_TLS_CA=${TEST_NETWORK_HOME}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/tlscacerts/tls-localhost-7054-ca-orderer.pem

# ── Peer TLS root certs ───────────────────────────────────────
export PEER0_HOSPITAL_CA=${TEST_NETWORK_HOME}/organizations/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt
export PEER1_HOSPITAL_CA=${TEST_NETWORK_HOME}/organizations/peerOrganizations/hospital.example.com/peers/peer1.hospital.example.com/tls/ca.crt
export PEER2_HOSPITAL_CA=${TEST_NETWORK_HOME}/organizations/peerOrganizations/hospital.example.com/peers/peer2.hospital.example.com/tls/ca.crt
export PEER0_DIAGNOSTICS_CA=${TEST_NETWORK_HOME}/organizations/peerOrganizations/diagnostic.example.com/peers/peer0.diagnostic.example.com/tls/ca.crt
export PEER0_PROVIDER_CA=${TEST_NETWORK_HOME}/organizations/peerOrganizations/provider.example.com/peers/peer0.provider.example.com/tls/ca.crt

# ── Admin MSP paths ───────────────────────────────────────────
export HOSPITAL_ADMIN_MSP=${TEST_NETWORK_HOME}/organizations/peerOrganizations/hospital.example.com/users/hospitaladmin/msp
export DIAGNOSTICS_ADMIN_MSP=${TEST_NETWORK_HOME}/organizations/peerOrganizations/diagnostic.example.com/users/labadmin/msp
export PROVIDER_ADMIN_MSP=${TEST_NETWORK_HOME}/organizations/peerOrganizations/provider.example.com/users/provideradmin/msp

# ============================================================
# setGlobals <ORG_NUM>
#
# 1 = Hospital peer0  (Auth/Reception)   port 7051
# 2 = Diagnostics     (Lab)              port 8051
# 3 = Provider        (Insurance)        port 11051
# 4 = Hospital peer1  (Doctor)           port 9051
# 5 = Hospital peer2  (Nurse/Pharma)     port 10051
# ============================================================

setGlobals() {
  local USING_ORG=""
  if [ -z "$OVERRIDE_ORG" ]; then
    USING_ORG=$1
  else
    USING_ORG="${OVERRIDE_ORG}"
  fi
  infoln "Using org ${USING_ORG}"

  if [ $USING_ORG -eq 1 ]; then
    # Hospital — peer0 (Auth/Reception)
    export CORE_PEER_LOCALMSPID="HospitalMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_HOSPITAL_CA
    export CORE_PEER_MSPCONFIGPATH=$HOSPITAL_ADMIN_MSP
    export CORE_PEER_ADDRESS=localhost:7051

  elif [ $USING_ORG -eq 2 ]; then
    # Diagnostics — peer0 (Lab)
    export CORE_PEER_LOCALMSPID="DiagnosticsMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_DIAGNOSTICS_CA
    export CORE_PEER_MSPCONFIGPATH=$DIAGNOSTICS_ADMIN_MSP
    export CORE_PEER_ADDRESS=localhost:8051

  elif [ $USING_ORG -eq 3 ]; then
    # Provider — peer0 (Insurance)
    export CORE_PEER_LOCALMSPID="ProviderMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_PROVIDER_CA
    export CORE_PEER_MSPCONFIGPATH=$PROVIDER_ADMIN_MSP
    export CORE_PEER_ADDRESS=localhost:11051

  elif [ $USING_ORG -eq 4 ]; then
    # Hospital — peer1 (Doctor)
    export CORE_PEER_LOCALMSPID="HospitalMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER1_HOSPITAL_CA
    export CORE_PEER_MSPCONFIGPATH=$HOSPITAL_ADMIN_MSP
    export CORE_PEER_ADDRESS=localhost:9051

  elif [ $USING_ORG -eq 5 ]; then
    # Hospital — peer2 (Nurse/Pharmacist)
    export CORE_PEER_LOCALMSPID="HospitalMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER2_HOSPITAL_CA
    export CORE_PEER_MSPCONFIGPATH=$HOSPITAL_ADMIN_MSP
    export CORE_PEER_ADDRESS=localhost:10051

  else
    errorln "Unknown org: $USING_ORG"
    errorln "Valid values:"
    errorln "  1 = Hospital peer0  (Auth/Reception) :7051"
    errorln "  2 = Diagnostics     (Lab)            :8051"
    errorln "  3 = Provider        (Insurance)      :11051"
    errorln "  4 = Hospital peer1  (Doctor)         :9051"
    errorln "  5 = Hospital peer2  (Nurse/Pharma)   :10051"
    exit 1
  fi

  if [ "${VERBOSE}" = "true" ]; then
    env | grep CORE
  fi
}

# ============================================================
# parsePeerConnectionParameters <org1> <org2> ...
# Builds --peerAddresses and --tlsRootCertFiles flags
# ============================================================

parsePeerConnectionParameters() {
  PEER_CONN_PARMS=()
  PEERS=""
  while [ "$#" -gt 0 ]; do
    setGlobals $1
    case $1 in
      1) CA=$PEER0_HOSPITAL_CA ;;
      2) CA=$PEER0_DIAGNOSTICS_CA ;;
      3) CA=$PEER0_PROVIDER_CA ;;
      4) CA=$PEER1_HOSPITAL_CA ;;
      5) CA=$PEER2_HOSPITAL_CA ;;
    esac
    [ -z "$PEERS" ] && PEERS="peer-org$1" || PEERS="$PEERS peer-org$1"
    PEER_CONN_PARMS+=( --peerAddresses $CORE_PEER_ADDRESS --tlsRootCertFiles "$CA" )
    shift
  done
}

verifyResult() {
  if [ $1 -ne 0 ]; then
    fatalln "$2"
  fi
}