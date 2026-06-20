'use strict';

// ── Role groups ───────────────────────────────────────────────────────────────

// All hospital/lab/provider staff — always have read access to visits and EHR
// Also includes 'patientService' — the patient-api service account that acts
// on behalf of authenticated patients (verified via SQLite + JWT off-chain)
const STAFF_ROLES = [
  'receptionist', 'admin', 'doctor', 'nurse', 'pharmacist',
  'medrecordofficer', 'labreceptionist', 'labtechnician', 'radiologist',
  'labsupervisor', 'labadmin', 'billingofficer', 'claimsauditor',
  'insuranceofficer', 'provideradmin',
  'patientService',   // patient-api service account — represents authenticated patients
];

// Doctor and nurse must have an explicit patient grant to access the EHR section.
// Assignment to a visit does NOT automatically grant EHR access.
const EHR_CONSENT_REQUIRED_ROLES = ['doctor', 'nurse'];

// Roles allowed to write/update EHR sections
const EHR_WRITE_ROLES = ['doctor', 'nurse', 'admin', 'patientService'];

// Ledger key prefixes shared across contracts
const ACCESS_PREFIX = 'ACCESS';
const EHR_PREFIX    = 'EHR';

const accessKey = (patientId) => `${ACCESS_PREFIX}:${patientId}`;
const ehrKey    = (patientId) => `${EHR_PREFIX}:${patientId}`;

// ── Identity helpers ──────────────────────────────────────────────────────────

/**
 * Extracts caller identity attributes from the client certificate.
 * - role      → embedded via --id.attrs "role=doctor:ecert" in enroll.sh
 * - patientId → embedded via --id.attrs "patientId=PAT-001:ecert" for patients
 */
function getCallerIdentity(ctx) {
  const id            = ctx.clientIdentity;
  const role          = id.getAttributeValue('role')      || '';
  const mspId         = id.getMSPID();
  const patientIdAttr = id.getAttributeValue('patientId') || '';

  // Extract CN from certificate subject as userId
  const idBytes = id.getID();
  const cnMatch = idBytes.match(/CN=([^,:/]+)/);
  const userId  = cnMatch ? cnMatch[1] : 'unknown';

  return { role, mspId, userId, patientIdAttr };
}

/**
 * Assert that the caller has one of the allowed roles.
 * Throws with a clear message if not.
 */
function requireRole(ctx, ...allowedRoles) {
  const { role, userId } = getCallerIdentity(ctx);
  if (!allowedRoles.includes(role)) {
    throw new Error(
      `Access denied: role '${role}' (user: ${userId}) is not permitted. ` +
      `Required: ${allowedRoles.join(' or ')}`
    );
  }
  return { role, userId };
}

/**
 * Assert that the caller belongs to one of the allowed MSPs.
 */
function requireMSP(ctx, ...allowedMSPs) {
  const { mspId, userId } = getCallerIdentity(ctx);
  if (!allowedMSPs.includes(mspId)) {
    throw new Error(
      `Access denied: MSP '${mspId}' (user: ${userId}) is not permitted.`
    );
  }
  return { mspId, userId };
}

// ── Access control check ──────────────────────────────────────────────────────

/**
 * Assert that the caller has read access to a patient's data.
 *
 * Rules (in order):
 *   1. Staff roles always allowed (doctor, nurse, receptionist, billing, lab etc.)
 *   2. Patient accessing own record always allowed
 *   3. Anyone else must have an active non-expired grant in ACCESS:<patientId>
 *
 * @param {Context} ctx
 * @param {string}  patientId  - whose data is being accessed
 * @param {string}  section    - 'ehr' | 'visits' | 'all'
 */
async function assertReadAccess(ctx, patientId, section) {
  const { role, userId } = getCallerIdentity(ctx);
  const sec = section || 'all';

  // Rule 1: staff + patientService always pass, EXCEPT doctor/nurse accessing
  // the 'ehr' section — they require an explicit patient consent grant.
  if (STAFF_ROLES.includes(role)) {
    if (EHR_CONSENT_REQUIRED_ROLES.includes(role) && sec === 'ehr') {
      // fall through to grant check below
    } else {
      return;
    }
  }

  // Rule 2: anyone else (e.g. third-party app, external researcher)
  // must have an explicit active grant on-chain
  const accessRecord = await getState(ctx, accessKey(patientId));
  if (!accessRecord || !accessRecord.grants || accessRecord.grants.length === 0) {
    throw new Error(
      `Access denied: no grants found for patient '${patientId}'`
    );
  }

  const nowIso = new Date().toISOString();
  const grant = accessRecord.grants.find(g =>
    g.granteeId === userId &&
    !g.revoked  &&
    (g.expiresAt === '' || g.expiresAt > nowIso) &&
    (g.sections.includes('all') || g.sections.includes(sec))
  );

  if (!grant) {
    throw new Error(
      `Access denied: '${userId}' does not have '${sec}' access to patient '${patientId}'`
    );
  }
}

/**
 * Assert that the caller can write to EHR sections.
 * Only EHR_WRITE_ROLES (doctor, nurse, admin, patientService) may update EHR content.
 * patientService is the patient-api service account — allows patients to update
 * their own emergency contact and contact info (enforced at API layer).
 * Doctor and nurse additionally require an active patient grant on the 'ehr' section.
 */
async function assertEHRWriteAccess(ctx, patientId) {
  const { role, userId } = getCallerIdentity(ctx);
  if (!EHR_WRITE_ROLES.includes(role)) {
    throw new Error(
      `Access denied: role '${role}' (user: ${userId}) cannot write to EHR. ` +
      `Allowed: ${EHR_WRITE_ROLES.join(', ')}`
    );
  }
  if (EHR_CONSENT_REQUIRED_ROLES.includes(role) && patientId) {
    await assertReadAccess(ctx, patientId, 'ehr');
  }
  return { role, userId };
}

// ── ID generators ─────────────────────────────────────────────────────────────

function makeVisitId(patientId, visitNumber) {
  return `${patientId}-V${visitNumber}`;
}

function makeLabRequestId(visitId, requestNumber) {
  return `${visitId}-L${requestNumber}`;
}

// ── Timestamp ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

// ── Ledger helpers ────────────────────────────────────────────────────────────

async function getState(ctx, key) {
  const bytes = await ctx.stub.getState(key);
  if (!bytes || bytes.length === 0) return null;
  return JSON.parse(bytes.toString('utf8'));
}

async function putState(ctx, key, obj) {
  obj.updatedAt = now();
  await ctx.stub.putState(key, Buffer.from(JSON.stringify(obj)));
  return obj;
}

async function getHistory(ctx, key) {
  const iterator = await ctx.stub.getHistoryForKey(key);
  const results  = [];
  while (true) {
    const result = await iterator.next();
    if (result.done) break;
    const record = {
      txId:      result.value.txId,
      timestamp: result.value.timestamp
        ? new Date(
            (result.value.timestamp.seconds.toNumber
              ? result.value.timestamp.seconds.toNumber()
              : Number(result.value.timestamp.seconds)) * 1000
          ).toISOString()
        : null,
      isDelete: result.value.isDelete,
      value:    result.value.value && result.value.value.length > 0
        ? JSON.parse(result.value.value.toString('utf8'))
        : null,
    };
    results.push(record);
  }
  await iterator.close();
  return results;
}

module.exports = {
  STAFF_ROLES,
  EHR_WRITE_ROLES,
  accessKey,
  ehrKey,
  getCallerIdentity,
  requireRole,
  requireMSP,
  assertReadAccess,
  assertEHRWriteAccess,
  makeVisitId,
  makeLabRequestId,
  now,
  getState,
  putState,
  getHistory,
};
