'use strict';

require('dotenv').config();
process.env.SERVICE_NAME = 'patient-api';

const express   = require('express');
const cors    = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const logger        = require('./config/logger');
const gateway       = require('./fabric/gatewayManager');
const { PEER_MAP }  = require('./fabric/peerRouter');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes    = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const ehrRoutes     = require('./routes/ehr');
const ocrRoutes     = require('./routes/ocr');
const visitRoutes   = require('./routes/visits');
const accessRoutes      = require('./routes/access');
const signatureRoutes   = require('./routes/signatures');

const app  = express();
const PORT = process.env.PORT || 3005;

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }))
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
app.use(rateLimit({
  windowMs:        60_000,
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  success: true,
  service: 'patient-api',
  port:    PORT,
  roles:   ['patient'],
  auth:    'SQLite + JWT (application-level)',
  fabric:  'patientService identity (HospitalMSP)',
  status:  'ok',
  time:    new Date().toISOString(),
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',    authRoutes);     // register, login, /me, change password
app.use('/profile', profileRoutes);  // on-chain patient demographics
app.use('/ehr',     ehrRoutes);      // EHR template (IPFS content)
app.use('/visits',  visitRoutes);    // visit history + clinical detail
app.use('/access',     accessRoutes);     // grant/revoke/list access
app.use('/ocr',        ocrRoutes);        // OCR document processing
app.use('/signatures', signatureRoutes); // cryptographic tx audit + aggregate hash

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.path}` })
);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  logger.info('Starting patient-api...', {
    port:    PORT,
    fabricBase: process.env.FABRIC_BASE_PATH,
    peer:    process.env.PEER_ADDRESS || 'localhost:7051',
    ipfs:    process.env.IPFS_SERVICE_URL || 'http://localhost:3006',
  });

  // Log MSP paths for diagnostics
  Object.entries(PEER_MAP).forEach(([role, cfg]) => {
    logger.info('Role config', { role, peer: cfg.address, mspPath: cfg.mspPath });
  });

  // Connect to Fabric via patientService identity
  await gateway.init();

  const server = app.listen(PORT, () => {
    logger.info(`patient-api listening on :${PORT}`);
    logger.info('Routes:');
    logger.info('  POST   /auth/register      — create patient account');
    logger.info('  POST   /auth/login         — patientId + password → JWT');
    logger.info('  GET    /auth/me            — current patient info');
    logger.info('  PUT    /auth/password      — change password');
    logger.info('  GET    /profile            — on-chain patient record');
    logger.info('  GET    /profile/history    — blockchain tx history');
    logger.info('  GET    /ehr               — full EHR from IPFS');
    logger.info('  GET    /ehr/history        — all CID versions');
    logger.info('  PUT    /ehr/contact        — update emergency contact');
    logger.info('  GET    /visits             — all visits (on-chain)');
    logger.info('  GET    /visits/:id         — visit + IPFS clinical content');
    logger.info('  GET    /visits/:id/history — blockchain tx history');
    logger.info('  GET    /visits/:id/cids    — IPFS CID history');
    logger.info('  POST   /access/grant       — grant access to staff');
    logger.info('  DELETE /access/revoke/:id  — revoke access');
    logger.info('  GET    /access             — all grants + audit log');
    logger.info('  GET    /access/active      — active grants only');
    logger.info('  GET    /access/log         — full audit log');
    logger.info('  GET    /access/check/:id   — check if someone has access');
  });

  const shutdown = async (sig) => {
    logger.info(`${sig} — shutting down`);
    server.close(async () => {
      await gateway.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

if (require.main === module) {
  start().catch(err => {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { app, start };
