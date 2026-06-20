'use strict';

const { Contract } = require('fabric-contract-api');
const {
  requireRole,
  assertEHRWriteAccess,
  assertReadAccess,
  getCallerIdentity,
  ehrKey,
  now,
  getState,
  putState,
  getHistory,
} = require('./accessControl');

class EhrContract extends Contract {
  constructor() {
    super('EhrContract');
  }

  // ── InitEHR ───────────────────────────────────────────────────────────────
  // Called once when a patient is registered.
  // Receptionist/admin pins an empty EHR JSON to IPFS and stores the CID here.
  //
  // Args:
  //   patientId  - e.g. "PAT-001"
  //   initialCID - IPFS CID of the empty EHR JSON template
  async InitEHR(ctx, patientId, initialCID) {
    requireRole(ctx, 'receptionist', 'admin');

    if (!patientId || !initialCID) {
      throw new Error('patientId and initialCID are required');
    }

    // Must not already exist
    const existing = await getState(ctx, ehrKey(patientId));
    if (existing) {
      throw new Error(`EHR already initialised for patient: ${patientId}`);
    }

    const { userId } = getCallerIdentity(ctx);

    const ehr = {
      patientId,
      currentCID: initialCID,      // latest IPFS CID
      cidHistory: [                 // immutable audit of every version
        {
          cid:       initialCID,
          updatedBy: userId,
          updatedAt: now(),
          reason:    'EHR_INITIALISED',
          section:   'all',
        },
      ],
      createdAt:  now(),
      updatedAt:  now(),
    };

    await putState(ctx, ehrKey(patientId), ehr);
    return JSON.stringify(ehr);
  }

  // ── UpdateEHRCID ──────────────────────────────────────────────────────────
  // Called by doctor or nurse after they modify the EHR JSON in IPFS.
  // Backend flow:
  //   1. fetch currentCID → get JSON from IPFS
  //   2. update section(s) in JSON
  //   3. pin updated JSON to IPFS → newCID
  //   4. call UpdateEHRCID(patientId, newCID, section, reason)
  //
  // Args:
  //   patientId - patient whose EHR was updated
  //   newCID    - IPFS CID of the updated EHR JSON
  //   section   - which section was updated ('allergies' | 'chronicConditions' |
  //               'ongoingMedications' | 'surgicalHistory' | 'familyHistory' |
  //               'immunizations' | 'emergencyContact' | 'demographics' | 'all')
  //   reason    - short human-readable note  (optional)
  async UpdateEHRCID(ctx, patientId, newCID, section, reason) {
    const { userId } = await assertEHRWriteAccess(ctx, patientId);

    if (!patientId || !newCID) {
      throw new Error('patientId and newCID are required');
    }

    const ehr = await getState(ctx, ehrKey(patientId));
    if (!ehr) throw new Error(`EHR not found for patient: ${patientId}`);

    // Append old CID to history before replacing
    ehr.cidHistory.push({
      cid:       newCID,
      updatedBy: userId,
      updatedAt: now(),
      reason:    reason || '',
      section:   section || 'unspecified',
    });

    ehr.currentCID = newCID;

    await putState(ctx, ehrKey(patientId), ehr);
    return JSON.stringify(ehr);
  }

  // ── GetCurrentCID ─────────────────────────────────────────────────────────
  // Returns the current IPFS CID for a patient's EHR.
  // Caller must be staff or have an active 'ehr' grant.
  // Backend uses this CID to fetch the actual JSON from IPFS.
  async GetCurrentCID(ctx, patientId) {
    await assertReadAccess(ctx, patientId, 'ehr');

    const ehr = await getState(ctx, ehrKey(patientId));
    if (!ehr) throw new Error(`EHR not found for patient: ${patientId}`);

    return JSON.stringify({ patientId, currentCID: ehr.currentCID });
  }

  // ── GetEHRCIDHistory ──────────────────────────────────────────────────────
  // Returns the full list of all CIDs this patient's EHR has ever had.
  // Each entry: { cid, updatedBy, updatedAt, section, reason }
  async GetEHRCIDHistory(ctx, patientId) {
    await assertReadAccess(ctx, patientId, 'ehr');

    const ehr = await getState(ctx, ehrKey(patientId));
    if (!ehr) throw new Error(`EHR not found for patient: ${patientId}`);

    return JSON.stringify(ehr.cidHistory);
  }

  // ── GetEHRRecord ──────────────────────────────────────────────────────────
  // Returns the full on-chain EHR record (CID + history metadata).
  // Does NOT return the actual EHR content — that lives in IPFS.
  async GetEHRRecord(ctx, patientId) {
    await assertReadAccess(ctx, patientId, 'ehr');

    const ehr = await getState(ctx, ehrKey(patientId));
    if (!ehr) throw new Error(`EHR not found for patient: ${patientId}`);

    return JSON.stringify(ehr);
  }

  // ── GetEHRBlockHistory ────────────────────────────────────────────────────
  // Full blockchain transaction history of the EHR record key.
  // Useful for auditing every chaincode transaction that touched this EHR.
  async GetEHRBlockHistory(ctx, patientId) {
    await assertReadAccess(ctx, patientId, 'ehr');

    const history = await getHistory(ctx, ehrKey(patientId));
    return JSON.stringify(history);
  }
}

module.exports = { EhrContract };
