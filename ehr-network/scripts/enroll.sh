#!/bin/bash

set -e

# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
ORGANIZATIONS="$BASE_DIR/organizations"

CA_ORDERER_TLS="$ORGANIZATIONS/ordererOrganizations/example.com/ca/ca-cert.pem"
CA_HOSPITAL_TLS="$ORGANIZATIONS/peerOrganizations/hospital.example.com/ca/ca-cert.pem"
CA_DIAGNOSTICS_TLS="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com/ca/ca-cert.pem"
CA_PROVIDER_TLS="$ORGANIZATIONS/peerOrganizations/provider.example.com/ca/ca-cert.pem"

# ============================================================
# HELPER FUNCTIONS
# ============================================================

enroll_identity() {
  local CA_URL=$1
  local MSP_DIR=$2
  local USER=$3
  local PASSWORD=$4
  local TLS_CERT=$5
  local CA_NAME=$6

  echo ">>> Enrolling: $USER at $CA_URL (CA: $CA_NAME)"
  fabric-ca-client enroll \
    -u https://$USER:$PASSWORD@$CA_URL \
    --caname $CA_NAME \
    --tls.certfiles $TLS_CERT \
    -M $MSP_DIR
  echo "✓ Enrolled: $USER"
}

register_identity() {
  local CA_URL=$1
  local ADMIN_MSP=$2
  local USER=$3
  local PASSWORD=$4
  local TYPE=$5
  local TLS_CERT=$6
  local CA_NAME=$7
  local ATTRS=${8:-""}

  echo ">>> Registering: $USER ($TYPE) attrs=[$ATTRS]"

  ATTR_FLAG=""
  [ -n "$ATTRS" ] && ATTR_FLAG="--id.attrs $ATTRS"

  FABRIC_CA_CLIENT_HOME=$ADMIN_MSP \
  fabric-ca-client register \
    --caname $CA_NAME \
    --id.name $USER \
    --id.secret $PASSWORD \
    --id.type $TYPE \
    $ATTR_FLAG \
    --tls.certfiles $TLS_CERT \
    -u https://$CA_URL
  echo "✓ Registered: $USER"
}

# Write config.yaml using actual cert filename in cacerts/
write_config_yaml() {
  local MSP_DIR=$1
  local CERT_FILENAME=$2

  cat > "$MSP_DIR/config.yaml" <<EOF
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/${CERT_FILENAME}
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/${CERT_FILENAME}
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/${CERT_FILENAME}
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/${CERT_FILENAME}
    OrganizationalUnitIdentifier: orderer
EOF
  echo "✓ config.yaml → $MSP_DIR"
}

# Write config.yaml by auto-detecting cert filename in cacerts/
write_config_yaml_auto() {
  local MSP_DIR=$1
  local CERT_FILE
  CERT_FILE=$(ls "$MSP_DIR/cacerts/" 2>/dev/null | head -1)
  if [ -n "$CERT_FILE" ]; then
    write_config_yaml "$MSP_DIR" "$CERT_FILE"
  else
    echo "⚠ No cacert found in $MSP_DIR/cacerts/ — skipping config.yaml"
  fi
}

create_ou_config() {
  local MSP_DIR=$1
  local DOMAIN=$2
  local CA_CERT=$3

  mkdir -p $MSP_DIR/cacerts
  cp $CA_CERT $MSP_DIR/cacerts/ca.${DOMAIN}-cert.pem
  write_config_yaml "$MSP_DIR" "ca.${DOMAIN}-cert.pem"
}

# Enroll a peer's MSP + TLS in one call
# enroll_peer <CA_URL> <ORG_DIR> <PEER_NAME> <PEER_PW> <CA_TLS> <CA_NAME> <CERT_FILENAME>
enroll_peer() {
  local CA_URL=$1
  local ORG_DIR=$2
  local PEER_NAME=$3
  local PEER_PW=$4
  local CA_TLS=$5
  local CA_NAME=$6
  local CERT_FILENAME=$7

  # MSP
  enroll_identity \
    $CA_URL \
    "$ORG_DIR/peers/$PEER_NAME/msp" \
    "$PEER_NAME" "$PEER_PW" \
    $CA_TLS $CA_NAME

  write_config_yaml \
    "$ORG_DIR/peers/$PEER_NAME/msp" \
    "$CERT_FILENAME"

  # TLS
  echo ">>> Enrolling TLS for $PEER_NAME"
  FABRIC_CA_CLIENT_HOME="$ORG_DIR/users/admin" \
  fabric-ca-client enroll \
    -u https://$PEER_NAME:$PEER_PW@$CA_URL \
    --caname $CA_NAME \
    -M "$ORG_DIR/peers/$PEER_NAME/tls" \
    --enrollment.profile tls \
    --csr.hosts $PEER_NAME \
    --csr.hosts localhost \
    --tls.certfiles $CA_TLS

  local TLS_DIR="$ORG_DIR/peers/$PEER_NAME/tls"
  cp $TLS_DIR/signcerts/*.pem  $TLS_DIR/server.crt
  cp $TLS_DIR/keystore/*_sk    $TLS_DIR/server.key
  cp $TLS_DIR/tlscacerts/*.pem $TLS_DIR/ca.crt
  echo "✓ TLS enrolled for $PEER_NAME"
}

# ============================================================
# ORDERER ORGANIZATION
# ============================================================

echo ""
echo "========================================"
echo " ENROLLING ORDERER ORGANIZATION"
echo "========================================"

ORDERER_ORG="$ORGANIZATIONS/ordererOrganizations/example.com"
ORDERER_CA_URL="localhost:7054"
ORDERER_CA_NAME="ca-orderer"

enroll_identity \
  $ORDERER_CA_URL \
  "$ORDERER_ORG/users/admin/msp" \
  "admin" "adminpw" \
  $CA_ORDERER_TLS \
  $ORDERER_CA_NAME

register_identity \
  $ORDERER_CA_URL \
  "$ORDERER_ORG/users/admin" \
  "orderer.example.com" "ordererpw" \
  "orderer" \
  $CA_ORDERER_TLS $ORDERER_CA_NAME

enroll_identity \
  $ORDERER_CA_URL \
  "$ORDERER_ORG/orderers/orderer.example.com/msp" \
  "orderer.example.com" "ordererpw" \
  $CA_ORDERER_TLS \
  $ORDERER_CA_NAME

write_config_yaml \
  "$ORDERER_ORG/orderers/orderer.example.com/msp" \
  "ca.example.com-cert.pem"

echo ">>> Enrolling Orderer TLS"
FABRIC_CA_CLIENT_HOME="$ORDERER_ORG/users/admin" \
fabric-ca-client enroll \
  -u https://orderer.example.com:ordererpw@$ORDERER_CA_URL \
  --caname $ORDERER_CA_NAME \
  -M "$ORDERER_ORG/orderers/orderer.example.com/tls" \
  --enrollment.profile tls \
  --csr.hosts orderer.example.com \
  --csr.hosts localhost \
  --tls.certfiles $CA_ORDERER_TLS

TLS_DIR="$ORDERER_ORG/orderers/orderer.example.com/tls"
cp $TLS_DIR/signcerts/*.pem $TLS_DIR/server.crt
cp $TLS_DIR/keystore/*_sk  $TLS_DIR/server.key
cp $TLS_DIR/tlscacerts/*.pem $TLS_DIR/ca.crt
echo "✓ Orderer TLS enrolled"

create_ou_config "$ORDERER_ORG/msp" "example.com" $CA_ORDERER_TLS
mkdir -p "$ORDERER_ORG/msp/tlscacerts"
cp "$ORDERER_ORG/orderers/orderer.example.com/tls/tlscacerts/"*.pem \
   "$ORDERER_ORG/msp/tlscacerts/tlsca.example.com-cert.pem"
echo "✓ Orderer org MSP tlscacerts populated"

# ============================================================
# HOSPITAL ORGANIZATION
# ============================================================

echo ""
echo "========================================"
echo " ENROLLING HOSPITAL ORGANIZATION"
echo "========================================"

HOSPITAL_ORG="$ORGANIZATIONS/peerOrganizations/hospital.example.com"
HOSPITAL_CA_URL="localhost:7055"
HOSPITAL_CA_NAME="ca-hospital"

# ── Enroll CA admin ──
enroll_identity \
  $HOSPITAL_CA_URL \
  "$HOSPITAL_ORG/users/admin/msp" \
  "admin" "adminpw" \
  $CA_HOSPITAL_TLS \
  $HOSPITAL_CA_NAME

# ── Register peers ──
# peer0 = Auth / Reception peer (VM1)
register_identity \
  $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "peer0.hospital.example.com" "peer0pw" "peer" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME

# peer1 = Doctor peer (VM2 later, localhost for now)
register_identity \
  $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "peer1.hospital.example.com" "peer1pw" "peer" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME

# peer2 = Nurse + Pharmacist peer (VM3 later, localhost for now)
register_identity \
  $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "peer2.hospital.example.com" "peer2pw" "peer" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME

# ── Register users with role attributes ──
register_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "receptionist"     "recpw"      "client" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "role=receptionist:ecert"

register_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "doctor"           "docpw"      "client" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "role=doctor:ecert"

register_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "nurse"            "nursepw"    "client" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "role=nurse:ecert"

register_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "pharmacist"       "pharmpw"    "client" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "role=pharmacist:ecert"

register_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "medrecordofficer" "medpw"      "client" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "role=medrecordofficer:ecert"

register_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "hospitaladmin"    "hadminpw"   "admin" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "role=admin:ecert"

# ── Register patientService — ONE service account used by patient-api ────────
# patient-api authenticates real patients via SQLite + JWT off-chain,
# then signs blockchain transactions using this single service identity.
# This avoids enrolling one Fabric identity per patient (impractical at scale).
register_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/admin" \
  "patientService"   "patientservicepw" "client" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "role=patientService:ecert"

# ── Enroll peers (MSP + TLS) ──
enroll_peer \
  $HOSPITAL_CA_URL $HOSPITAL_ORG \
  "peer0.hospital.example.com" "peer0pw" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "ca.hospital.example.com-cert.pem"

enroll_peer \
  $HOSPITAL_CA_URL $HOSPITAL_ORG \
  "peer1.hospital.example.com" "peer1pw" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "ca.hospital.example.com-cert.pem"

enroll_peer \
  $HOSPITAL_CA_URL $HOSPITAL_ORG \
  "peer2.hospital.example.com" "peer2pw" \
  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME \
  "ca.hospital.example.com-cert.pem"

# ── Enroll users ──
enroll_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/receptionist/msp"     "receptionist"     "recpw"    $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME
enroll_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/doctor/msp"           "doctor"           "docpw"    $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME
enroll_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/nurse/msp"            "nurse"            "nursepw"  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME
enroll_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/pharmacist/msp"       "pharmacist"       "pharmpw"  $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME
enroll_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/medrecordofficer/msp" "medrecordofficer" "medpw"    $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME
enroll_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/hospitaladmin/msp"    "hospitaladmin"    "hadminpw"         $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME
enroll_identity $HOSPITAL_CA_URL "$HOSPITAL_ORG/users/patientService/msp"  "patientService"   "patientservicepw" $CA_HOSPITAL_TLS $HOSPITAL_CA_NAME

# ── Write config.yaml for all user MSPs ──
for USER in receptionist doctor nurse pharmacist medrecordofficer hospitaladmin patientService admin; do
  write_config_yaml_auto "$HOSPITAL_ORG/users/$USER/msp"
done

# ── Org-level MSP ──
create_ou_config "$HOSPITAL_ORG/msp" "hospital.example.com" $CA_HOSPITAL_TLS
mkdir -p "$HOSPITAL_ORG/msp/tlscacerts"
cp "$HOSPITAL_ORG/peers/peer0.hospital.example.com/tls/tlscacerts/"*.pem \
   "$HOSPITAL_ORG/msp/tlscacerts/tlsca.hospital.example.com-cert.pem"
echo "✓ Hospital org MSP tlscacerts populated"

# ============================================================
# DIAGNOSTICS ORGANIZATION
# ============================================================

echo ""
echo "========================================"
echo " ENROLLING DIAGNOSTICS ORGANIZATION"
echo "========================================"

DIAG_ORG="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com"
DIAG_CA_URL="localhost:7056"
DIAG_CA_NAME="ca-diagnostics"

enroll_identity \
  $DIAG_CA_URL \
  "$DIAG_ORG/users/admin/msp" \
  "admin" "adminpw" \
  $CA_DIAGNOSTICS_TLS \
  $DIAG_CA_NAME

register_identity \
  $DIAG_CA_URL "$DIAG_ORG/users/admin" \
  "peer0.diagnostic.example.com" "diag0pw" "peer" \
  $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME

register_identity $DIAG_CA_URL "$DIAG_ORG/users/admin" \
  "labreceptionist" "labrecpw"   "client" \
  $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME \
  "role=labreceptionist:ecert"

register_identity $DIAG_CA_URL "$DIAG_ORG/users/admin" \
  "labtechnician"   "labpw"      "client" \
  $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME \
  "role=labtechnician:ecert"

register_identity $DIAG_CA_URL "$DIAG_ORG/users/admin" \
  "labsupervisor"   "labsuppw"   "client" \
  $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME \
  "role=labsupervisor:ecert"

register_identity $DIAG_CA_URL "$DIAG_ORG/users/admin" \
  "radiologist"     "radpw"      "client" \
  $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME \
  "role=radiologist:ecert"

register_identity $DIAG_CA_URL "$DIAG_ORG/users/admin" \
  "labadmin"        "labadminpw" "admin" \
  $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME \
  "role=admin:ecert"

enroll_peer \
  $DIAG_CA_URL $DIAG_ORG \
  "peer0.diagnostic.example.com" "diag0pw" \
  $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME \
  "ca.diagnostic.example.com-cert.pem"

enroll_identity $DIAG_CA_URL "$DIAG_ORG/users/labreceptionist/msp" "labreceptionist" "labrecpw"   $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME
enroll_identity $DIAG_CA_URL "$DIAG_ORG/users/labtechnician/msp"   "labtechnician"   "labpw"      $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME
enroll_identity $DIAG_CA_URL "$DIAG_ORG/users/labsupervisor/msp"   "labsupervisor"   "labsuppw"   $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME
enroll_identity $DIAG_CA_URL "$DIAG_ORG/users/radiologist/msp"     "radiologist"     "radpw"      $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME
enroll_identity $DIAG_CA_URL "$DIAG_ORG/users/labadmin/msp"        "labadmin"        "labadminpw" $CA_DIAGNOSTICS_TLS $DIAG_CA_NAME

for USER in labreceptionist labtechnician labsupervisor radiologist labadmin admin; do
  write_config_yaml_auto "$DIAG_ORG/users/$USER/msp"
done

create_ou_config "$DIAG_ORG/msp" "diagnostic.example.com" $CA_DIAGNOSTICS_TLS
mkdir -p "$DIAG_ORG/msp/tlscacerts"
cp "$DIAG_ORG/peers/peer0.diagnostic.example.com/tls/tlscacerts/"*.pem \
   "$DIAG_ORG/msp/tlscacerts/tlsca.diagnostic.example.com-cert.pem"
echo "✓ Diagnostics org MSP tlscacerts populated"

# ============================================================
# PROVIDER ORGANIZATION
# ============================================================

echo ""
echo "========================================"
echo " ENROLLING PROVIDER ORGANIZATION"
echo "========================================"

PROV_ORG="$ORGANIZATIONS/peerOrganizations/provider.example.com"
PROV_CA_URL="localhost:7057"
PROV_CA_NAME="ca-provider"

enroll_identity \
  $PROV_CA_URL \
  "$PROV_ORG/users/admin/msp" \
  "admin" "adminpw" \
  $CA_PROVIDER_TLS \
  $PROV_CA_NAME

register_identity \
  $PROV_CA_URL "$PROV_ORG/users/admin" \
  "peer0.provider.example.com" "prov0pw" "peer" \
  $CA_PROVIDER_TLS $PROV_CA_NAME

register_identity $PROV_CA_URL "$PROV_ORG/users/admin" \
  "billingofficer"    "billpw"       "client" \
  $CA_PROVIDER_TLS $PROV_CA_NAME \
  "role=billingofficer:ecert"

register_identity $PROV_CA_URL "$PROV_ORG/users/admin" \
  "claimsauditor"     "claimaudpw"   "client" \
  $CA_PROVIDER_TLS $PROV_CA_NAME \
  "role=claimsauditor:ecert"

register_identity $PROV_CA_URL "$PROV_ORG/users/admin" \
  "insuranceofficer"  "inspw"        "client" \
  $CA_PROVIDER_TLS $PROV_CA_NAME \
  "role=insuranceofficer:ecert"

register_identity $PROV_CA_URL "$PROV_ORG/users/admin" \
  "provideradmin"     "provadminpw"  "admin" \
  $CA_PROVIDER_TLS $PROV_CA_NAME \
  "role=admin:ecert"

enroll_peer \
  $PROV_CA_URL $PROV_ORG \
  "peer0.provider.example.com" "prov0pw" \
  $CA_PROVIDER_TLS $PROV_CA_NAME \
  "ca.provider.example.com-cert.pem"

enroll_identity $PROV_CA_URL "$PROV_ORG/users/billingofficer/msp"   "billingofficer"   "billpw"      $CA_PROVIDER_TLS $PROV_CA_NAME
enroll_identity $PROV_CA_URL "$PROV_ORG/users/claimsauditor/msp"    "claimsauditor"    "claimaudpw"  $CA_PROVIDER_TLS $PROV_CA_NAME
enroll_identity $PROV_CA_URL "$PROV_ORG/users/insuranceofficer/msp" "insuranceofficer" "inspw"       $CA_PROVIDER_TLS $PROV_CA_NAME
enroll_identity $PROV_CA_URL "$PROV_ORG/users/provideradmin/msp"    "provideradmin"    "provadminpw" $CA_PROVIDER_TLS $PROV_CA_NAME

for USER in billingofficer claimsauditor insuranceofficer provideradmin admin; do
  write_config_yaml_auto "$PROV_ORG/users/$USER/msp"
done

create_ou_config "$PROV_ORG/msp" "provider.example.com" $CA_PROVIDER_TLS
mkdir -p "$PROV_ORG/msp/tlscacerts"
cp "$PROV_ORG/peers/peer0.provider.example.com/tls/tlscacerts/"*.pem \
   "$PROV_ORG/msp/tlscacerts/tlsca.provider.example.com-cert.pem"
echo "✓ Provider org MSP tlscacerts populated"

# ============================================================
echo ""
echo "========================================"
echo " ALL IDENTITIES ENROLLED SUCCESSFULLY"
echo "========================================"
echo ""
echo "Hospital peers enrolled:"
echo "  peer0.hospital  → Auth / Reception peer  (port 7051)"
echo "  peer1.hospital  → Doctor peer             (port 9051)"
echo "  peer2.hospital  → Nurse + Pharmacist peer (port 10051)"
echo ""
echo "Role attributes embedded in certs:"
echo "  receptionist     → role=receptionist    [connects to peer0]"
echo "  doctor           → role=doctor          [connects to peer1]"
echo "  nurse            → role=nurse           [connects to peer2]"
echo "  pharmacist       → role=pharmacist      [connects to peer2]"
echo "  medrecordofficer → role=medrecordofficer [connects to peer1]"
echo "  hospitaladmin    → role=admin           [connects to peer0]"
echo "  patientService   → role=patientService  [used by patient-api — signs on behalf of patients]"
echo "  labreceptionist  → role=labreceptionist"
echo "  labtechnician    → role=labtechnician"
echo "  labsupervisor    → role=labsupervisor"
echo "  radiologist      → role=radiologist"
echo "  billingofficer   → role=billingofficer"
echo "  claimsauditor    → role=claimsauditor"
echo "  insuranceofficer → role=insuranceofficer"
echo ""