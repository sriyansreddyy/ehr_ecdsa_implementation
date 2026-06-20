#!/bin/bash

set -e

# ============================================================
# USAGE
# ============================================================

usage() {
  echo ""
  echo "Usage: $0 --org <org> --username <name> --password <pass> --type <type> [--role <role>]"
  echo ""
  echo "Options:"
  echo "  --org       Organization: hospital | diagnostics | provider"
  echo "  --username  Username to register"
  echo "  --password  Password for the user"
  echo "  --type      Identity type: client | admin | peer"
  echo "  --role      Role attribute embedded in cert (e.g. doctor, nurse, pharmacist)"
  echo ""
  echo "Examples:"
  echo "  $0 --org hospital --username newdoctor --password docpw123 --type client --role doctor"
  echo "  $0 --org diagnostics --username labmanager --password lmpw123 --type admin"
  echo "  $0 --org provider --username auditor2 --password audpw123 --type client"
  echo ""
  exit 1
}

# ============================================================
# PARSE ARGUMENTS
# ============================================================

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --org)      ORG="$2";        shift ;;
    --username) USERNAME="$2";   shift ;;
    --password) PASSWORD="$2";   shift ;;
    --type)     ID_TYPE="$2";    shift ;;
    --role)     ROLE_ATTR="$2";  shift ;;
    --help|-h)  usage ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
  shift
done

# ============================================================
# VALIDATE ARGUMENTS
# ============================================================

if [ -z "$ORG" ] || [ -z "$USERNAME" ] || [ -z "$PASSWORD" ] || [ -z "$ID_TYPE" ]; then
  echo "Error: All arguments are required."
  usage
fi

case $ORG in
  hospital|diagnostics|provider) ;;
  *)
    echo "Error: --org must be one of: hospital | diagnostics | provider"
    usage
    ;;
esac

case $ID_TYPE in
  client|admin|peer) ;;
  *)
    echo "Error: --type must be one of: client | admin | peer"
    usage
    ;;
esac

# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
ORGANIZATIONS="$BASE_DIR/organizations"
TEMP_HOME=/tmp/fabric-ca-temp

case $ORG in
  hospital)
    ORG_DOMAIN="hospital.example.com"
    ORG_DIR="$ORGANIZATIONS/peerOrganizations/hospital.example.com"
    CA_PORT="7055"
    CA_NAME="ca-hospital"
    ;;
  diagnostics)
    ORG_DOMAIN="diagnostic.example.com"
    ORG_DIR="$ORGANIZATIONS/peerOrganizations/diagnostic.example.com"
    CA_PORT="7056"
    CA_NAME="ca-diagnostics"
    ;;
  provider)
    ORG_DOMAIN="provider.example.com"
    ORG_DIR="$ORGANIZATIONS/peerOrganizations/provider.example.com"
    CA_PORT="7057"
    CA_NAME="ca-provider"
    ;;
esac

CA_URL="localhost:$CA_PORT"
CA_TLS_CERT="$ORG_DIR/ca/ca-cert.pem"
CA_CERT_FILE="ca.${ORG_DOMAIN}-cert.pem"
MSP_DIR="$ORG_DIR/users/$USERNAME/msp"

# ============================================================
# SUMMARY
# ============================================================

echo ""
echo "========================================"
echo "  EHR Network - Register & Enroll User"
echo "========================================"
echo "  Organization : $ORG ($ORG_DOMAIN)"
echo "  Username     : $USERNAME"
echo "  Type         : $ID_TYPE"
echo "  CA           : $CA_NAME @ $CA_URL"
echo "  MSP Output   : $MSP_DIR"
echo "========================================"

# ============================================================
# STEP 1: Enroll CA admin into temp home
# ============================================================

echo ""
echo ">>> Authenticating as CA admin..."
rm -rf $TEMP_HOME && mkdir -p $TEMP_HOME

fabric-ca-client enroll \
  -u https://admin:adminpw@$CA_URL \
  --caname $CA_NAME \
  --tls.certfiles $CA_TLS_CERT \
  --home $TEMP_HOME \
  -M $TEMP_HOME/msp

echo "✓ CA admin authenticated"

# ============================================================
# STEP 2: Register
# ============================================================

echo ""
echo ">>> Registering $USERNAME as $ID_TYPE..."

ATTR_FLAG=""
if [ -n "$ROLE_ATTR" ]; then
  ATTR_FLAG="--id.attrs role=${ROLE_ATTR}:ecert"
  echo ">>> Embedding role attribute: role=${ROLE_ATTR}:ecert"
fi

fabric-ca-client register \
  --caname $CA_NAME \
  --id.name $USERNAME \
  --id.secret $PASSWORD \
  --id.type $ID_TYPE \
  $ATTR_FLAG \
  --tls.certfiles $CA_TLS_CERT \
  --home $TEMP_HOME \
  -u https://$CA_URL

echo "✓ Registered: $USERNAME"

# ============================================================
# STEP 3: Enroll
# ============================================================

echo ""
echo ">>> Enrolling $USERNAME..."
mkdir -p $MSP_DIR

fabric-ca-client enroll \
  -u https://$USERNAME:$PASSWORD@$CA_URL \
  --caname $CA_NAME \
  --tls.certfiles $CA_TLS_CERT \
  --home $TEMP_HOME \
  -M $MSP_DIR

echo "✓ Enrolled: $USERNAME"

# ============================================================
# STEP 4: Copy CA cert and create config.yaml
# ============================================================

mkdir -p $MSP_DIR/cacerts
cp $ORG_DIR/msp/cacerts/$CA_CERT_FILE $MSP_DIR/cacerts/

cat > "$MSP_DIR/config.yaml" <<EOF
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/${CA_CERT_FILE}
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/${CA_CERT_FILE}
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/${CA_CERT_FILE}
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/${CA_CERT_FILE}
    OrganizationalUnitIdentifier: orderer
EOF

echo "✓ MSP config.yaml created"

# ============================================================
# DONE
# ============================================================

echo ""
echo "========================================"
echo "  User enrolled successfully!"
echo "========================================"
echo "  MSP  : $MSP_DIR"
echo "  Cert : $MSP_DIR/signcerts/cert.pem"
echo "  Key  : $MSP_DIR/keystore/"
echo ""
openssl x509 -noout -subject -in $MSP_DIR/signcerts/cert.pem
echo "========================================"