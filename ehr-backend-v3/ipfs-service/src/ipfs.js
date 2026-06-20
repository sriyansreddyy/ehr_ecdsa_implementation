'use strict';

/**
 * ipfs.js — Wrapper around Kubo IPFS HTTP API
 *
 * Kubo exposes a JSON-RPC style HTTP API at port 5001.
 * All operations use POST requests (Kubo's design).
 *
 * Key endpoints used:
 *   POST /api/v0/add          — pin a file/JSON, returns CID
 *   POST /api/v0/cat?arg=CID  — fetch content by CID
 *   POST /api/v0/pin/add      — explicitly pin a CID
 *   POST /api/v0/pin/rm       — unpin a CID
 *   POST /api/v0/id           — health check
 */

const axios  = require('axios');
const FormData = require('form-data');
const logger = require('./logger');

const IPFS_API = process.env.IPFS_API_URL || 'http://localhost:5001';

// ── Health check ─────────────────────────────────────────────────────────────

async function checkHealth() {
  const res = await axios.post(`${IPFS_API}/api/v0/id`, null, { timeout: 5000 });
  return {
    nodeId:  res.data.ID,
    version: res.data.AgentVersion,
    online:  true,
  };
}

// ── Pin JSON to IPFS ──────────────────────────────────────────────────────────

/**
 * Pins a JSON object to IPFS.
 * Returns the CID (Content Identifier) of the pinned content.
 *
 * @param {Object} jsonObj  - The JSON to pin
 * @param {string} filename - Optional filename label (for IPFS metadata)
 * @returns {string} CID
 */
async function pinJSON(jsonObj, filename) {
  const content = JSON.stringify(jsonObj, null, 2);
  const fname   = filename || `ehr-${Date.now()}.json`;

  const form = new FormData();
  form.append('file', Buffer.from(content, 'utf8'), {
    filename:    fname,
    contentType: 'application/json',
  });

  const res = await axios.post(
    `${IPFS_API}/api/v0/add?pin=true&cid-version=1`,
    form,
    {
      headers: form.getHeaders(),
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength:    Infinity,
    }
  );

  const cid = res.data.Hash;
  logger.info('Pinned JSON to IPFS', { cid, size: res.data.Size, filename: fname });
  return cid;
}

// ── Fetch JSON from IPFS ──────────────────────────────────────────────────────

/**
 * Fetches and parses JSON stored at a given CID.
 *
 * @param {string} cid - IPFS Content Identifier
 * @returns {Object} Parsed JSON object
 */
async function fetchJSON(cid) {
  if (!cid || cid.trim() === '') {
    throw new Error('CID is required');
  }

  const res = await axios.post(
    `${IPFS_API}/api/v0/cat?arg=${encodeURIComponent(cid)}`,
    null,
    {
      timeout: 30000,
      responseType: 'text',
    }
  );

  let parsed;
  try {
    parsed = JSON.parse(res.data);
  } catch (e) {
    throw new Error(`Content at CID ${cid} is not valid JSON: ${e.message}`);
  }

  logger.info('Fetched JSON from IPFS', { cid });
  return parsed;
}

// ── Unpin (optional cleanup) ──────────────────────────────────────────────────

/**
 * Unpins a CID from the local IPFS node.
 * Content remains accessible on the IPFS network until garbage collected.
 * In EHR context: old CIDs (visit history) are kept pinned for audit purposes.
 *
 * @param {string} cid
 */
async function unpin(cid) {
  await axios.post(
    `${IPFS_API}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`,
    null,
    { timeout: 10000 }
  );
  logger.info('Unpinned CID from IPFS', { cid });
}

// ── List pinned CIDs (debug/admin) ───────────────────────────────────────────

async function listPins() {
  const res = await axios.post(
    `${IPFS_API}/api/v0/pin/ls?type=recursive`,
    null,
    { timeout: 10000 }
  );
  return Object.keys(res.data.Keys || {});
}

/**
 * Pins a binary file to IPFS.
 *
 * @param {Buffer} buffer - File content
 * @param {string} filename - Filename
 * @param {string} contentType - e.g. 'image/jpeg'
 * @returns {string} CID
 */
async function pinFile(buffer, filename, contentType) {
  const form = new FormData();
  form.append('file', buffer, {
    filename:    filename,
    contentType: contentType,
  });

  const res = await axios.post(
    `${IPFS_API}/api/v0/add?pin=true&cid-version=1`,
    form,
    {
      headers: form.getHeaders(),
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength:    Infinity,
    }
  );

  const cid = res.data.Hash;
  logger.info('Pinned binary file to IPFS', { cid, filename });
  return cid;
}

module.exports = { checkHealth, pinJSON, fetchJSON, unpin, listPins, pinFile };
