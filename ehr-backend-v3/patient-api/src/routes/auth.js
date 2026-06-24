'use strict';

/**
 * auth.js — Patient registration and login with 2-step OTP verification
 *
 * POST /auth/register     — create patient account
 * POST /auth/login        — Step 1: patientId + password → send OTP email
 * POST /auth/verify-otp   — Step 2: patientId + otp → issue JWT
 * GET  /auth/me           — return current patient info from JWT
 * PUT  /auth/password     — change password (requires current password)
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const path   = require('path');
const fs     = require('fs');
const { body, validationResult } = require('express-validator');

const { authenticate } = require('../middleware/auth');
const { wrap }      = require('../middleware/errorHandler');
const logger        = require('../config/logger');
const { generateOtp, verifyOtp, hasPendingOtp } = require('../../../shared/otpStore');
const { sendOtpEmail } = require('../../../shared/mailer');

const SALT_ROUNDS = 10;
const USERS_FILE = path.join(__dirname, '../../../shared/users.json');

function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (err) {
    logger.error('Could not read users.json', err);
    return {};
  }
}

function issueToken(patientId) {
  return jwt.sign(
    { patientId, role: 'patient' },
    process.env.JWT_SECRET || 'test-secret-key-123', // Added fallback secret for testing
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// ── POST /auth/register ──────────────────────────────────────────────────────
router.post('/register',
  [
    body('patientId').trim().notEmpty().withMessage('patientId required'),
    body('password').isLength({ min: 6 }).withMessage('password must be at least 6 characters'),
    body('email').optional().isEmail(),
    body('phone').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId, password, email = '', phone = '' } = req.body;

    // Hash password and store in memory (in production, would be database)
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    
    // Store in a temporary in-memory registry for this session
    // In production, this should be persisted to a database
    if (!global.patientRegistry) {
      global.patientRegistry = {};
    }
    
    global.patientRegistry[patientId] = {
      password: hashedPassword,
      email,
      phone,
      createdAt: new Date().toISOString()
    };

    const token = issueToken(patientId);
    logger.info('Patient registered', { patientId, email });

    return res.status(201).json({
      success: true,
      data: {
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        patient: { patientId, email, phone },
      },
    });
  })
);

// ── Step 1: POST /auth/login ──────────────────────────────────────────────────
// Password check → send OTP email
router.post('/login',
  [
    body('patientId').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId, password } = req.body;

    // Try to find patient in registry first, then in users.json (for staff accounts)
    let patientData = null;
    let email = null;

    // Check in-memory registry (registered patients)
    if (global.patientRegistry && global.patientRegistry[patientId]) {
      patientData = global.patientRegistry[patientId];
      email = patientData.email;
    } else {
      // Check users.json (fallback for test accounts)
      const USERS = getUsers();
      if (USERS[patientId]) {
        patientData = USERS[patientId];
        email = USERS[patientId].email;
      }
    }

    // Verify password
    if (!patientData || !(await bcrypt.compare(password, patientData.password))) {
      logger.warn('Patient login step 1 failed — bad credentials', { patientId });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Patient must have email registered
    if (!email) {
      logger.error('Patient has no email registered', { patientId });
      return res.status(500).json({ success: false, error: 'No email on file for this account. Contact support.' });
    }

    // Throttle: don't send another OTP if one is still valid
    if (hasPendingOtp(patientId)) {
      return res.status(429).json({
        success: false,
        error: 'An OTP was already sent. Please wait for it to expire (5 min) before requesting another.',
      });
    }

    // Generate OTP and email it
    const otp = generateOtp(patientId);
    try {
      await sendOtpEmail(email, patientId, otp);
      logger.info('OTP sent to patient', { patientId, email });
    } catch (err) {
      logger.error('Failed to send OTP email', { patientId, error: err.message });
      return res.status(500).json({ success: false, error: 'Failed to send OTP. Try again.' });
    }

    // Tell frontend to show OTP entry screen — do NOT issue JWT yet
    return res.json({
      success: true,
      data: {
        otpSent: true,
        maskedEmail: email.replace(/(?<=.{2}).(?=[^@]*@)/g, '*'),
      },
    });
  })
);

// ── Step 2: POST /auth/verify-otp ────────────────────────────────────────────
// OTP verification → issue JWT
router.post('/verify-otp',
  [
    body('patientId').trim().notEmpty(),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId, otp } = req.body;
    const result = verifyOtp(patientId, otp);

    if (!result.ok) {
      logger.warn('Patient OTP verification failed', { patientId, reason: result.reason });
      return res.status(401).json({ success: false, error: result.reason });
    }

    // OTP passed — issue JWT
    const token = issueToken(patientId);
    logger.info('Patient login complete (OTP verified)', { patientId });

    return res.json({
      success: true,
      data: {
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        patient: { patientId },
      },
    });
  })
);

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  // Return patient info from token
  let patientData = null;
  
  // Check registry first
  if (global.patientRegistry && global.patientRegistry[req.patient.patientId]) {
    patientData = global.patientRegistry[req.patient.patientId];
  } else {
    // Check users.json
    const USERS = getUsers();
    if (USERS[req.patient.patientId]) {
      patientData = USERS[req.patient.patientId];
    }
  }

  return res.json({
    success: true,
    data: {
      patientId: req.patient.patientId,
      email: patientData?.email || '',
      phone: patientData?.phone || '',
      createdAt: patientData?.createdAt || new Date().toISOString(),
    },
  });
});

// ── PUT /auth/password ────────────────────────────────────────────────────────
router.put('/password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 }),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const { patientId } = req.patient;

    // Get current patient data
    let patientData = null;
    if (global.patientRegistry && global.patientRegistry[patientId]) {
      patientData = global.patientRegistry[patientId];
    } else {
      const USERS = getUsers();
      if (USERS[patientId]) {
        patientData = USERS[patientId];
      }
    }

    if (!patientData) {
      return res.status(401).json({ success: false, error: 'Patient not found' });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, patientData.password);
    if (!passwordMatch) {
      logger.warn('Password change failed — invalid current password', { patientId });
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    // Hash new password and update
    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    if (!global.patientRegistry) global.patientRegistry = {};
    if (!global.patientRegistry[patientId]) global.patientRegistry[patientId] = patientData;
    global.patientRegistry[patientId].password = hashedNewPassword;

    logger.info('Patient password changed', { patientId });
    return res.json({ success: true, data: { message: 'Password updated successfully' } });
  })
);

module.exports = router;