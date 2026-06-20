'use strict';

const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const logger = require('../config/logger');
const { authenticate } = require('../middleware/auth');

const fs = require('fs');
const path = require('path');
const USERS_FILE = path.join(__dirname, '../../../shared/users.json');

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
    { userId, role, mspId: mspId || 'HospitalMSP', peer: peer || 'peer2' },
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
              user: { username, role: user.role, mspId: user.mspId || 'HospitalMSP', peer: user.peer || 'peer2' } },
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

module.exports = router;
