'use strict';

/**
 * otpStore.js
 * -----------
 * In-memory OTP store with TTL and brute-force protection.
 *
 * Each entry:  { hash, expiresAt, attempts }
 *
 * We store the HASH of the OTP (SHA-256), not the OTP itself,
 * so even if someone reads server memory they can't extract live OTPs.
 *
 * TTL:      5 minutes
 * Max tries: 3  (then the entry is deleted — actor must request a new OTP)
 */

const crypto = require('crypto');

const OTP_TTL_MS   = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

// Map<userId, { hash, expiresAt, attempts }>
const store = new Map();

// Purge expired entries every 10 minutes (housekeeping)
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(userId);
  }
}, 10 * 60 * 1000).unref(); // .unref() so this timer doesn't keep the process alive

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * generateOtp(userId)
 * --------------------
 * Creates a fresh 6-digit OTP for the user, replaces any previous one,
 * and returns the plaintext OTP (to be emailed — stored only as hash).
 */
function generateOtp(userId) {
  // Cryptographically random 6-digit number (000000–999999)
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  store.set(userId, {
    hash:      hashOtp(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts:  0,
  });
  return otp;
}

function clearOtp(userId) {
  store.delete(userId);
}

/**
 * verifyOtp(userId, candidateOtp)
 * --------------------------------
 * Returns { ok: true } on success.
 * Returns { ok: false, reason: '...' } on failure.
 * Deletes the entry on success or after MAX_ATTEMPTS failures.
 */
function verifyOtp(userId, candidateOtp) {
  const entry = store.get(userId);

  if (!entry) {
    return { ok: false, reason: 'No OTP found. Request a new one.' };
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(userId);
    return { ok: false, reason: 'OTP expired. Request a new one.' };
  }

  entry.attempts += 1;

  const match = crypto.timingSafeEqual(
    Buffer.from(hashOtp(candidateOtp), 'hex'),
    Buffer.from(entry.hash, 'hex')
  );

  if (match) {
    store.delete(userId); // one-time use
    return { ok: true };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(userId);
    return { ok: false, reason: 'Too many attempts. Request a new OTP.' };
  }

  const remaining = MAX_ATTEMPTS - entry.attempts;
  return { ok: false, reason: `Incorrect OTP. ${remaining} attempt(s) remaining.` };
}

/**
 * hasPendingOtp(userId)
 * ----------------------
 * True if a non-expired OTP exists for this user.
 * Used to prevent OTP spam (don't send a new one if one is still valid).
 */
function hasPendingOtp(userId) {
  const entry = store.get(userId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(userId);
    return false;
  }
  return true;
}

module.exports = { generateOtp, verifyOtp, hasPendingOtp, clearOtp };