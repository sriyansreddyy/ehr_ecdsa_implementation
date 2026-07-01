'use strict';

const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const fs     = require('fs');
const path   = require('path');
const { execFile } = require('child_process');

const logger        = require('../config/logger');
const { authenticate } = require('../middleware/auth');
const { generateOtp, verifyOtp, hasPendingOtp } = require('../../../shared/otpStore');
const { sendOtpEmail }    = require('../../../shared/mailer');
const { enrollActorKey, fetchAndDecryptKey, actorKeyExists } = require('../../../shared/keyVault');

const DIAG_ROLES = ['labreceptionist', 'labtechnician', 'radiologist', 'labsupervisor', 'labadmin'];
const PROVIDER_ROLES = ['billingofficer', 'claimsauditor', 'insuranceofficer', 'provideradmin'];
const EXTORG_ROLES = [...DIAG_ROLES, ...PROVIDER_ROLES];

function getRoleDefaults(role) {
  if (DIAG_ROLES.includes(role)) {
    return { mspId: 'DiagnosticsMSP', peer: 'peer0' };
  }
  if (PROVIDER_ROLES.includes(role)) {
    return { mspId: 'ProviderMSP', peer: 'peer0' };
  }
  return { mspId: 'DiagnosticsMSP', peer: 'peer0' };
}

const USERS_FILE    = path.join(__dirname, '../../../shared/users.json');
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
  const defaults = getRoleDefaults(role);
  return jwt.sign(
    { userId, role, mspId: mspId || defaults.mspId, peer: peer || defaults.peer },
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
    const user  = USERS[username];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      logger.warn('Login step 1 failed — bad credentials', { username });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    return res.json({ success: true, message: 'Password validated. Proceed to email input.' });
  }
);


router.post('/send-otp',
  [body('username').trim().notEmpty(), body('email').isEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { username, email } = req.body;

    if (hasPendingOtp(username)) {
      return res.status(429).json({
        success: false,
        error: 'An OTP was already sent. Please wait for it to expire (5 min).',
      });
    }

    const otp = generateOtp(username);
    try {
      await sendOtpEmail(email, username, otp);
      logger.info('OTP sent', { username, email });
    } catch (err) {
      clearOtp(username);
      logger.error('Failed to send OTP email', { username, error: err.message });
      return res.status(500).json({ success: false, error: 'Failed to send OTP via Resend. Try again.' });
    }

    return res.json({
      success: true,
      data: {
        otpSent: true,
        maskedEmail: email.replace(/(?<=.{2}).(?=[^@]*@)/g, '*'),
      },
    });
  }
);


router.post('/verify-otp',
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { username, password, otp } = req.body;
    const result = verifyOtp(username, otp);

    if (!result.ok) {
      logger.warn('OTP verification failed', { username, reason: result.reason });
      return res.status(401).json({ success: false, error: result.reason });
    }

    const USERS = getUsers();
    const user  = USERS[username];
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });

    let privateKey = null;
    try {
      privateKey = await fetchAndDecryptKey(username, password);
    } catch (err) {
      logger.error('Supabase key vault decryption failed', { username, error: err.message });
      return res.status(500).json({ success: false, error: 'Failed to unlock private key from Vault. Enrollment missing or corrupted.' });
    }

    const token = issueToken(username, user.role, user.mspId, user.peer);
    logger.info('Login complete (OTP verified, Key Unlocked)', { username, role: user.role });

    return res.json({
      success: true,
      data: {
        token,
        privateKey, 
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        user: {
          username,
          role: user.role,
          ...getRoleDefaults(user.role),
          mspId: user.mspId || getRoleDefaults(user.role).mspId,
          peer: user.peer || getRoleDefaults(user.role).peer,
        },
      },
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

router.get('/staff', (req, res) => {
  const USERS = getUsers();
  const staff = Object.keys(USERS)
    .filter(u => EXTORG_ROLES.includes(USERS[u].role))
    .map(u => ({ username: u, role: USERS[u].role }));
  return res.json({ success: true, data: staff });
});

router.get('/users', authenticate, (req, res) => {
  const USERS = getUsers();
  const safe  = Object.keys(USERS).reduce((acc, key) => {
    const { password, ...rest } = USERS[key];
    acc[key] = { username: key, ...rest };
    return acc;
  }, {});
  return res.json({ success: true, data: Object.values(safe) });
});

router.post('/users', authenticate,
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
    body('role').notEmpty(),
    body('email').isEmail().withMessage('Valid email required'),
    body('pin').isLength({ min: 4, max: 8 }).withMessage('PIN must be 4–8 digits'),
  ],
  async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only admins can create users' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { username, password, role, email, pin } = req.body;
    if (!EXTORG_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Role must be one of: ${EXTORG_ROLES.join(', ')}`,
      });
    }
    const USERS = getUsers();
    if (USERS[username]) return res.status(400).json({ success: false, error: 'User already exists' });

    const { mspId, peer } = getRoleDefaults(role);

    const hash = await bcrypt.hash(password, 10);
    USERS[username] = { password: hash, role, mspId, peer, email };

    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2));
      logger.info('Created new user in users.json', { username, role, email });
    } catch (err) {
      logger.error('Failed to save user to users.json', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

    try {
      await enrollActorKey(username, pin);
      logger.info('ECDSA key enrolled in vault', { username });
    } catch (err) {
      try {
        delete USERS[username];
        fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2));
      } catch {}
      logger.error('Key vault enrollment failed', { username, error: err.message });
      return res.status(500).json({ success: false, error: 'Key vault enrollment failed: ' + err.message });
    }

    const scriptArgs = [
      '--org', 'hospital', '--username', username,
      '--password', password, '--type', 'client', '--role', role,
    ];

    execFile('bash', [ENROLL_SCRIPT, ...scriptArgs], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        try {
          delete USERS[username];
          fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2));
        } catch {}
        logger.error('Fabric CA enrollment failed', { username, error: err.message, stderr });
        return res.status(500).json({
          success: false,
          error: 'Fabric CA enrollment failed: ' + (stderr || err.message).split('\n')[0],
        });
      }
      logger.info('Fabric identity enrolled', { username, role });
      return res.status(201).json({
        success: true,
        data: { username, role, mspId, peer, email },
      });
    });
  }
);

router.post('/enroll-key', authenticate,
  [
    body('targetUser').trim().notEmpty(),
    body('pin').isLength({ min: 4, max: 8 }).withMessage('PIN must be 4–8 digits'),
  ],
  async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admins only' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { targetUser, pin } = req.body;

    const already = await actorKeyExists(targetUser);
    if (already) {
      return res.status(409).json({ success: false, error: `'${targetUser}' already has a key enrolled` });
    }

    try {
      const { publicKey } = await enrollActorKey(targetUser, pin);
      logger.info('Admin enrolled key for existing user', { targetUser, by: req.user.userId });
      return res.status(201).json({ success: true, data: { actorId: targetUser, publicKey } });
    } catch (err) {
      logger.error('enroll-key failed', { targetUser, error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);


async function verifyPin(req, res, next) {
  const encodedKey = req.headers['x-private-key'];
  if (encodedKey) {
    try {
      req.actorPrivateKey = Buffer.from(encodedKey, 'base64').toString('utf8');
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid x-private-key encoding' });
    }
    return next();
  }

  const pin = req.headers['x-actor-pin'];
  if (!pin) {
    return res.status(401).json({ success: false, error: 'X-Private-Key or X-Actor-Pin header required for signing operations' });
  }

  const actorId = req.user?.userId;
  if (!actorId) return res.status(401).json({ success: false, error: 'Not authenticated' });

  try {
    req.actorPrivateKey = await fetchAndDecryptKey(actorId, pin);
    next();
  } catch (err) {
    logger.warn('PIN verification failed', { actorId, error: err.message });
    return res.status(401).json({ success: false, error: 'Invalid PIN' });
  }
}

module.exports = router;
module.exports.verifyPin = verifyPin;
