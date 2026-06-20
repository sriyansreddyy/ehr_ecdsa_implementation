'use strict';

require('dotenv').config();
process.env.SERVICE_NAME = 'peer2-api';

const express   = require('express');
const cors    = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const logger          = require('./config/logger');
const gateway         = require('./fabric/gatewayManager');
const { PEER_MAP, _base } = require('./fabric/peerRouter');
const { errorHandler }= require('./middleware/errorHandler');

const authRoutes       = require('./routes/auth');
const nurseRoutes      = require('./routes/nurse');
const pharmacistRoutes = require('./routes/pharmacist');
const recordRoutes     = require('./routes/records');

const app  = express();
const PORT = process.env.PORT || 3003;

app.use(cors({ origin: '*', credentials: true }))
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({
  success: true, service: 'peer2-api', peer: 'peer2.hospital.example.com',
  roles: ['nurse', 'pharmacist', 'medrecordofficer'], status: 'ok',
  time: new Date().toISOString(),
}));

app.use('/auth',        authRoutes);
app.use('/nurse',       nurseRoutes);
app.use('/pharmacist',  pharmacistRoutes);
app.use('/records',     recordRoutes);

app.use((req, res) => res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.path}` }));
app.use(errorHandler);

async function start() {
  logger.info('Starting peer2-api...', {
    port: PORT,
    fabricBase: process.env.FABRIC_BASE_PATH,
    peer: process.env.PEER_ADDRESS || 'localhost:10051',
  });

  Object.entries(PEER_MAP).forEach(([role, cfg]) => {
    logger.info(`Role config: ${role}`, { peer: cfg.address, mspPath: cfg.mspPath });
  });

  await gateway.init();

  const server = app.listen(PORT, () => {
    logger.info(`peer2-api listening on :${PORT}`);
    logger.info('Routes: POST /auth/login, GET /auth/me');
    logger.info('Routes: GET  /nurse/visits/:id');
    logger.info('Routes: PUT  /nurse/visits/:id/vitals');
    logger.info('Routes: POST /nurse/visits/:id/carenote');
    logger.info('Routes: PUT  /nurse/visits/:id/forward/doctor');
    logger.info('Routes: GET  /pharmacist/visits/:id');
    logger.info('Routes: GET  /pharmacist/visits/:id/prescription');
    logger.info('Routes: PUT  /pharmacist/visits/:id/dispense');
    logger.info('Routes: GET  /records/visits/:id');
    logger.info('Routes: PUT  /records/visits/:id/finalize');
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
