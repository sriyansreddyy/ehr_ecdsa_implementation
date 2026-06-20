'use strict';

require('dotenv').config();
process.env.SERVICE_NAME = 'extorg-api';

const express   = require('express');
const cors    = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const logger          = require('./config/logger');
const gateway         = require('./fabric/gatewayManager');
const { PEER_MAP, _base } = require('./fabric/peerRouter');
const { errorHandler }= require('./middleware/errorHandler');

const authRoutes   = require('./routes/auth');
const labRoutes    = require('./routes/lab');
const claimsRoutes = require('./routes/claims');

const app  = express();
const PORT = process.env.PORT || 3004;

app.use(cors({ origin: '*', credentials: true }))
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({
  success: true,
  service: 'extorg-api',
  orgs: ['DiagnosticsMSP', 'ProviderMSP'],
  peers: ['peer0.diagnostic.example.com', 'peer0.provider.example.com'],
  roles: {
    diagnostics: ['labreceptionist', 'labtechnician', 'radiologist', 'labsupervisor', 'labadmin'],
    provider:    ['billingofficer', 'claimsauditor', 'insuranceofficer', 'provideradmin'],
  },
  status: 'ok',
  time: new Date().toISOString(),
}));

app.use('/auth',   authRoutes);
app.use('/lab',    labRoutes);
app.use('/claims', claimsRoutes);

app.use((req, res) => res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.path}` }));
app.use(errorHandler);

async function start() {
  logger.info('Starting extorg-api...', {
    port: PORT,
    fabricBase: process.env.FABRIC_BASE_PATH,
    diagPeer: process.env.DIAG_PEER_ADDRESS || 'localhost:8051',
    provPeer: process.env.PROV_PEER_ADDRESS || 'localhost:11051',
  });

  Object.entries(PEER_MAP).forEach(([role, cfg]) => {
    logger.info(`Role config: ${role}`, { peer: cfg.address, mspId: cfg.mspId, mspPath: cfg.mspPath });
  });

  await gateway.init();

  const server = app.listen(PORT, () => {
    logger.info(`extorg-api listening on :${PORT}`);
    logger.info('── Lab routes (DiagnosticsMSP) ──');
    logger.info('GET  /lab/visits/:id');
    logger.info('GET  /lab/visits/:id/request/:reqId');
    logger.info('PUT  /lab/visits/:id/request/:reqId/acknowledge');
    logger.info('PUT  /lab/visits/:id/request/:reqId/submit');
    logger.info('PUT  /lab/visits/:id/request/:reqId/approve');
    logger.info('PUT  /lab/visits/:id/request/:reqId/return');
    logger.info('── Claims routes (ProviderMSP) ──');
    logger.info('GET  /claims/visits/:id');
    logger.info('GET  /claims/visits/:id/history');
    logger.info('POST /claims/visits/:id/submit');
    logger.info('PUT  /claims/visits/:id/audit');
    logger.info('PUT  /claims/visits/:id/process');
  });

  const shutdown = async (sig) => {
    logger.info(`${sig} — shutting down`);
    server.close(async () => { await gateway.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

if (require.main === module) {
  start().catch(err => { logger.error('Startup failed', { error: err.message }); process.exit(1); });
}

module.exports = { app, start };
