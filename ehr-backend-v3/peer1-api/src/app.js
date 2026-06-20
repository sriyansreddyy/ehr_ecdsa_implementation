'use strict';

require('dotenv').config();
process.env.SERVICE_NAME = 'peer1-api';

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
const doctorRoutes = require('./routes/doctor');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(cors({ origin: '*', credentials: true }))
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({
  success: true, service: 'peer1-api', peer: 'peer1.hospital.example.com',
  roles: ['doctor'], status: 'ok', time: new Date().toISOString(),
}));

app.use('/auth',   authRoutes);
app.use('/doctor', doctorRoutes);

app.use((req, res) => res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.path}` }));
app.use(errorHandler);

async function start() {
  logger.info('Starting peer1-api...', {
    port: PORT,
    fabricBase: process.env.FABRIC_BASE_PATH,
    peer: process.env.PEER_ADDRESS || 'localhost:9051',
  });

  Object.entries(PEER_MAP).forEach(([role, cfg]) => {
    logger.info(`Role config: ${role}`, { peer: cfg.address, mspPath: cfg.mspPath });
  });

  await gateway.init();

  const server = app.listen(PORT, () => {
    logger.info(`peer1-api listening on :${PORT}`);
    logger.info('Routes: POST /auth/login, GET /auth/me');
    logger.info('Routes: GET  /doctor/visits/:id');
    logger.info('Routes: GET  /doctor/visits/:id/history');
    logger.info('Routes: GET  /doctor/visits/:id/prescription');
    logger.info('Routes: PUT  /doctor/visits/:id/diagnosis');
    logger.info('Routes: PUT  /doctor/visits/:id/prescription');
    logger.info('Routes: PUT  /doctor/visits/:id/forward/nurse');
    logger.info('Routes: PUT  /doctor/visits/:id/forward/lab');
    logger.info('Routes: PUT  /doctor/visits/:id/finalize');
    logger.info('Routes: PUT  /doctor/visits/:id/assign/nurse');
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
