'use strict';

/**
 * ipfsClient.js — Thin client for ipfs-service
 *
 * patient-api never talks to Kubo directly.
 * It calls ipfs-service (port 3006) which wraps Kubo.
 */

const axios        = require('axios');
const NodeFormData = require('form-data');
const logger       = require('../config/logger');

const BASE = process.env.IPFS_SERVICE_URL  || 'http://localhost:3006';
const KEY  = process.env.IPFS_SERVICE_KEY  || '';

const client = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: { 'X-IPFS-Key': KEY },
});

// Fetch JSON from IPFS by CID
async function fetchByCID(cid) {
  const res = await client.get(`/fetch/${cid}`);
  return res.data.data;
}

// Pin a JSON object to IPFS, return CID
async function pinJSON(json, filename) {
  const res = await client.post('/pin', { json, filename });
  return res.data.cid;
}

async function initEHR(patientId, demographics) {
  const res = await client.post('/ehr/init', { patientId, demographics });
  return { cid: res.data.cid, ehr: res.data.ehr };
}

async function uploadFile(buffer, filename) {
  const form = new NodeFormData();
  form.append('file', buffer, { filename });
  const res = await client.post('/upload', form, {
    headers: form.getHeaders(),
  });
  return { cid: res.data.cid };
}

module.exports = { fetchByCID, pinJSON, initEHR, uploadFile };
