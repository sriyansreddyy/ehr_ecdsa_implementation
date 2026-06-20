'use strict';

const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const logger = require('../config/logger');
const { authenticate } = require('../middleware/auth');

const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const USERS_FILE   = path.join(__dirname, '../../../shared/users.json');
const ENROLL_SCRIPT = path.resolve(__dirname, '../../../../ehr-network/scripts/enrollregisteruser.sh');

function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (err) {
    logger.error('Could not read users.json', err);
    return {};
  }
}

function issueToken(userId, role, mspId, peer) {
  return jwt.sign(
    { userId, role, mspId: mspId || 'HospitalMSP', peer: peer || 'peer0' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

router.post('/login',
  [body('username').trim().notEmpty(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { username, password } = req.body;
    const USERS = getUsers();
    const user = USERS[username];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      logger.warn('Login failed', { username });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = issueToken(username, user.role, user.mspId, user.peer);
    logger.info('Login OK', { username, role: user.role });
    return res.json({
      success: true,
      data: { token, expiresIn: process.env.JWT_EXPIRES_IN || '8h',
              user: { username, role: user.role, mspId: user.mspId || 'HospitalMSP', peer: user.peer || 'peer0' } },
    });
  }
);

router.get('/me', authenticate, (req, res) => {
  const { userId, role, mspId, peer, iat, exp } = req.user;
  return res.json({ success: true, data: {
    userId, role, mspId, peer,
    issuedAt:  new Date(iat * 1000).toISOString(),
    expiresAt: new Date(exp * 1000).toISOString(),
  }});
});

// ── Public: List Clinical Staff (for Patients) ──────────────
router.get('/staff', (req, res) => {
  const USERS = getUsers();
  const staff = Object.keys(USERS)
    .filter(username => ['doctor', 'nurse', 'pharmacist', 'medrecordofficer'].includes(USERS[username].role))
    .map(username => ({
      username,
      role: USERS[username].role
    }));
  return res.json({ success: true, data: staff });
});

// ── Admin: Manage Users ──────────────────────────────────────
router.get('/users', authenticate, (req, res) => {
  const USERS = getUsers();
  const safeUsers = Object.keys(USERS).reduce((acc, key) => {
    const { password, ...rest } = USERS[key];
    acc[key] = { username: key, ...rest };
    return acc;
  }, {});
  return res.json({ success: true, data: Object.values(safeUsers) });
});

router.post('/users', authenticate, [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
    body('role').notEmpty()
  ], async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Only admins can create users' });
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { username, password, role } = req.body;
  const USERS = getUsers();
  if (USERS[username]) return res.status(400).json({ success: false, error: 'User already exists' });

  // Determine peer mapping depending on hospital role
  let peer = 'peer0';
  if (['doctor'].includes(role)) peer = 'peer1';
  if (['nurse', 'pharmacist', 'medrecordofficer'].includes(role)) peer = 'peer2';

  const hash = await bcrypt.hash(password, 10);
  USERS[username] = { password: hash, role, mspId: 'HospitalMSP', peer };

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2));
    logger.info('Created new user in users.json', { username, role });
  } catch (err) {
    logger.error('Failed to save user to users.json', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }

  // Enroll the user's Fabric CA identity so their MSP directory is created
  const scriptArgs = [
    '--org', 'hospital',
    '--username', username,
    '--password', password,
    '--type', 'client',
    '--role', role
  ];

  execFile('bash', [ENROLL_SCRIPT, ...scriptArgs], { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      // Rollback: remove user from users.json so both stores stay consistent
      try {
        const current = getUsers();
        delete current[username];
        fs.writeFileSync(USERS_FILE, JSON.stringify(current, null, 2));
        logger.warn('Rolled back users.json after enrollment failure', { username });
      } catch (rollbackErr) {
        logger.error('Rollback failed — users.json may be inconsistent', { username, rollbackErr: rollbackErr.message });
      }
      logger.error('Fabric CA enrollment failed', { username, error: err.message, stderr });
      return res.status(500).json({
        success: false,
        error: 'Fabric CA enrollment failed. User not created. Details: ' + (stderr || err.message).split('\n')[0],
      });
    }

    logger.info('Fabric identity enrolled successfully', { username, role });
    return res.status(201).json({ success: true, data: { username, role, mspId: 'HospitalMSP', peer } });
  });
});

module.exports = router;

