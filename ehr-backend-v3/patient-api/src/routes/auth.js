'use strict';

/**
 * auth.js — Patient registration and login
 *
 * POST /auth/register  — create patient account (called by receptionist flow
 * OR patient sets their own password after receiving patientId)
 * POST /auth/login     — patientId + password → JWT
 * GET  /auth/me        — return current patient info from JWT
 * PUT  /auth/password  — change password (requires current password)
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

// ==========================================
// DB COMMENTED OUT FOR LOCAL BYPASS
// ==========================================
// const db            = require('../db/database');

const { authenticate } = require('../middleware/auth');
const { wrap }      = require('../middleware/errorHandler');
const logger        = require('../config/logger');

const SALT_ROUNDS = 10;

function issueToken(patientId) {
  return jwt.sign(
    { patientId, role: 'patient' },
    process.env.JWT_SECRET || 'test-secret-key-123', // Added fallback secret for testing
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// ── POST /auth/register ───────────────────────────────────────────────────────
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

    // ==========================================
    // LOCAL BYPASS: FAKE REGISTRATION
    // ==========================================
    const token = issueToken(patientId);
    logger.info('Patient registered (BYPASS)', { patientId });

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

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login',
  [
    body('patientId').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { patientId } = req.body;

    // ==========================================
    // LOCAL BYPASS: FAKE LOGIN WITHOUT DATABASE
    // ==========================================
    const token = issueToken(patientId);
    logger.info('Login OK (BYPASS)', { patientId });

    return res.json({
      success: true,
      message: "Local E2E Test: Bypassing SQLite DB",
      data: {
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        patient: { patientId: patientId, email: 'bypass@test.com', phone: '555-0000' },
      },
    });
  })
);

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  // ==========================================
  // LOCAL BYPASS: FAKE USER DATA
  // ==========================================
  return res.json({
    success: true,
    data: {
      patientId: req.patient.patientId,
      email:     'bypass@test.com',
      phone:     '555-0000',
      createdAt: new Date().toISOString(),
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

    // ==========================================
    // LOCAL BYPASS: FAKE PASSWORD CHANGE
    // ==========================================
    logger.info('Password changed (BYPASS)', { patientId: req.patient.patientId });
    return res.json({ success: true, data: { message: 'Password updated' } });
  })
);

module.exports = router;