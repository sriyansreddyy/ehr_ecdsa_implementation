'use strict';

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const logger    = require('./logger');
const ipfs      = require('./ipfs');
const routes    = require('./routes');
const { requireApiKey, errorHandler } = require('./middleware');

const app  = express();
const PORT = process.env.PORT || 3006;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: process.env.MAX_BODY_SIZE || '5mb' }));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
app.use(rateLimit({
  windowMs:        60_000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ── Public route — no API key required ───────────────────────────────────────

app.get('/health', async (req, res) => {
  try {
    const info = await ipfs.checkHealth();
    return res.json({
      success: true,
      service: 'ipfs-service',
      port:    PORT,
      ipfsApi: process.env.IPFS_API_URL || 'http://localhost:5001',
      ipfs:    info,
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      service: 'ipfs-service',
      error:   'IPFS node unreachable',
      detail:  err.message,
    });
  }
});

// ── Protected routes — require X-IPFS-Key header ─────────────────────────────

app.use('/', requireApiKey, routes);

// ── 404 ───────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Not found: ${req.method} ${req.path}`,
  });
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info('ipfs-service started', {
    port:    PORT,
    ipfsApi: process.env.IPFS_API_URL  || 'http://localhost:5001',
    gateway: process.env.IPFS_GATEWAY_URL || 'http://localhost:8090',
  });
  logger.info('Routes:');
  logger.info('  GET  /health       — IPFS node status (no auth)');
  logger.info('  POST /pin          — pin any JSON, returns CID');
  logger.info('  GET  /fetch/:cid   — fetch JSON by CID');
  logger.info('  POST /ehr/init     — pin empty EHR template');
  logger.info('  POST /visit/init   — pin empty visit JSON');
  logger.info('  POST /unpin        — unpin a CID (admin only)');
  logger.info('  GET  /pins         — list all pinned CIDs (debug)');
});

module.exports = app;
