'use strict';

const { Contract } = require('fabric-contract-api');
const {
  requireRole,
  now,
  getState,
  putState,
} = require('./accessControl');
const { visitKey, VISIT_STATUS } = require('./visitContract');

// ─────────────────────────────────────────────────────────────────────────────
// ClaimsContract — insurance claim lifecycle.
//
// Claim metadata (claimId, claimAmount, decision, reason) stays ON-CHAIN
// because insurance auditors need tamper-proof immutable claim records.
// The full visit clinical content (evidence for the claim) is in IPFS via visitCID.
// ─────────────────────────────────────────────────────────────────────────────

class ClaimsContract extends Contract {
  constructor() {
    super('ClaimsContract');
  }

  // ── SubmitClaim ───────────────────────────────────────────────────────────
  // Billing officer submits an insurance claim.
  // visitCID optional: backend may update IPFS JSON to log this event.
  async SubmitClaim(ctx, visitId, claimId, claimAmount, visitCID) {
    const { userId } = requireRole(ctx, 'billingofficer');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (visit.status !== VISIT_STATUS.RECORD_FINALIZED) {
      throw new Error(`Visit must be RECORD_FINALIZED to submit claim. Current: '${visit.status}'`);
    }
    if (!claimId || !claimAmount) throw new Error('claimId and claimAmount required');

    const amount = parseFloat(claimAmount);
    if (isNaN(amount) || amount <= 0) throw new Error('claimAmount must be a positive number');

    visit.claimId          = claimId;
    visit.claimAmount      = amount;
    visit.claimSubmittedBy = userId;
    visit.claimStatus      = 'SUBMITTED';
    visit.status           = VISIT_STATUS.CLAIM_SUBMITTED;

    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'CLAIM_SUBMITTED' });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── AuditClaim ────────────────────────────────────────────────────────────
  // Claims auditor reviews the claim. Status → CLAIM_UNDER_AUDIT.
  async AuditClaim(ctx, visitId, auditNotes, visitCID) {
    const { userId } = requireRole(ctx, 'claimsauditor');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (visit.status !== VISIT_STATUS.CLAIM_SUBMITTED) {
      throw new Error(`Claim must be CLAIM_SUBMITTED to audit. Current: '${visit.status}'`);
    }
    if (!auditNotes || auditNotes.trim() === '') throw new Error('auditNotes required');

    visit.auditedBy   = userId;
    visit.auditNotes  = auditNotes;
    visit.claimStatus = 'UNDER_AUDIT';
    visit.status      = VISIT_STATUS.CLAIM_UNDER_AUDIT;

    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: 'CLAIM_AUDITED' });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }

  // ── ProcessClaim ──────────────────────────────────────────────────────────
  // Insurance officer approves or rejects. decision: 'APPROVED' | 'REJECTED'.
  async ProcessClaim(ctx, visitId, decision, reason, visitCID) {
    const { userId } = requireRole(ctx, 'insuranceofficer');

    const visit = await getState(ctx, visitKey(visitId));
    if (!visit) throw new Error(`Visit not found: ${visitId}`);

    if (visit.status !== VISIT_STATUS.CLAIM_UNDER_AUDIT) {
      throw new Error(`Claim must be CLAIM_UNDER_AUDIT. Current: '${visit.status}'`);
    }

    const dec = decision.toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(dec)) {
      throw new Error('decision must be APPROVED or REJECTED');
    }
    if (dec === 'REJECTED' && (!reason || reason.trim() === '')) {
      throw new Error('Rejection reason is required');
    }

    visit.processedBy = userId;
    visit.claimReason = reason || '';
    visit.claimStatus = dec;
    visit.status      = dec === 'APPROVED'
      ? VISIT_STATUS.CLAIM_APPROVED
      : VISIT_STATUS.CLAIM_REJECTED;

    if (visitCID) {
      visit.cidHistory.push({ cid: visitCID, updatedBy: userId, updatedAt: now(), reason: `CLAIM_${dec}` });
      visit.visitCID = visitCID;
    }

    await putState(ctx, visitKey(visitId), visit);
    return JSON.stringify(visit);
  }
}

module.exports = { ClaimsContract };
