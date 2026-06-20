'use strict';

/**
 * database.js — SQLite patient store
 *
 * Stores patient credentials for application-level auth only.
 * Nothing here goes on blockchain — this is purely for
 * patient login (patientId + password → JWT).
 *
 * Schema:
 *   patients (patientId, passwordHash, email, phone, createdAt, updatedAt)
 */

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');
const logger   = require('../config/logger');

const DB_PATH = process.env.SQLITE_PATH || './data/patients.db';

const dataDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  logger.info('Created data directory', { dir: dataDir });
}

const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS patients (
    patientId    TEXT PRIMARY KEY,
    passwordHash TEXT NOT NULL,
    email        TEXT DEFAULT '',
    phone        TEXT DEFAULT '',
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  );
`);

logger.info('SQLite ready', { path: path.resolve(DB_PATH) });

function createPatient({ patientId, passwordHash, email = '', phone = '' }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO patients (patientId, passwordHash, email, phone, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(patientId, passwordHash, email, phone, now, now);
  return getPatient(patientId);
}

function getPatient(patientId) {
  return db.prepare('SELECT * FROM patients WHERE patientId = ?').get(patientId);
}

function patientExists(patientId) {
  return !!db.prepare('SELECT patientId FROM patients WHERE patientId = ?').get(patientId);
}

function updatePatientContact({ patientId, email, phone }) {
  const now = new Date().toISOString();
  db.prepare('UPDATE patients SET email=?, phone=?, updatedAt=? WHERE patientId=?')
    .run(email, phone, now, patientId);
  return getPatient(patientId);
}

function updatePassword({ patientId, passwordHash }) {
  const now = new Date().toISOString();
  db.prepare('UPDATE patients SET passwordHash=?, updatedAt=? WHERE patientId=?')
    .run(passwordHash, now, patientId);
}

module.exports = { createPatient, getPatient, patientExists, updatePatientContact, updatePassword };
