'use strict';

require('dotenv').config();
process.env.SERVICE_NAME = 'peer0-api';

const express    = require('express');
const cors    = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const logger         = require('./config/logger');
const gateway        = require('./fabric/gatewayManager');
const { PEER_MAP, _base } = require('./fabric/peerRouter');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes    = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const visitRoutes   = require('./routes/visits');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*', credentials: true }))
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({
  success: true, service: 'peer0-api', peer: 'peer0.hospital.example.com',
  roles: ['receptionist', 'admin'], status: 'ok', time: new Date().toISOString(),
}));

app.use('/auth',     authRoutes);
app.use('/patients', patientRoutes);
app.use('/visits',   visitRoutes);

app.use((req, res) => res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.path}` }));
app.use(errorHandler);

async function start() {
  logger.info('Starting peer0-api...', {
    port: PORT,
    fabricBase: process.env.FABRIC_BASE_PATH,
    peer: process.env.PEER_ADDRESS || 'localhost:7051',
  });

  // Log resolved MSP paths
  Object.entries(PEER_MAP).forEach(([role, cfg]) => {
    logger.info(`Role config: ${role}`, { peer: cfg.address, mspPath: cfg.mspPath });
  });

  await gateway.init();

  const server = app.listen(PORT, () => {
    logger.info(`peer0-api listening on :${PORT}`);
    logger.info('Routes: POST /auth/login, GET /auth/me');
    logger.info('Routes: POST /patients, GET /patients/:id, GET /patients/:id/visits');
    logger.info('Routes: PUT /patients/:id (update info)');
    logger.info('Routes: POST /visits, PUT /visits/:id/doctor, PUT /visits/:id/nurse');
    logger.info('Routes: PUT /visits/:id/discharge, GET /visits/:id, GET /visits/:id/history');
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
