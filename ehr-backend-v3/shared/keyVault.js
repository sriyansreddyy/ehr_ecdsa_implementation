'use strict';

/**
 * keyVault.js
 * -----------
 * Replaces the old local_keystore PEM-on-disk approach.
 *
 * What it does:
 *  - Generates EC keypairs (prime256v1) for each actor
 *  - Encrypts the private key with AES-256-GCM, keyed by PBKDF2(actorPIN, salt)
 *  - Stores { encrypted_private_key, iv, salt, public_key } in Supabase
 *  - Decrypts on demand — the plaintext private key only exists in memory
 *    for the duration of one signing operation, then is GC'd
 *
 * Supabase table required (run this SQL in your Supabase SQL editor):
 *
 *   create table actor_keys (
 *     actor_id           text primary key,
 *     public_key         text not null,
 *     encrypted_priv_key text not null,
 *     iv                 text not null,
 *     salt               text not null,
 *     created_at         timestamptz default now()
 *   );
 *
 * .env vars required (add to every peer's .env):
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJ...          ← use the service_role key, NOT anon
 *   VAULT_PBKDF2_ITERATIONS=200000
 */

const crypto = require('crypto');
const https  = require('https');

// ── Supabase REST helper (no SDK needed, saves a dependency) ──────────────────

function supabaseRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url     = new URL(process.env.SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path:     `/rest/v1/${path}`,
      method,
      headers: {
        'apikey':        process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        method === 'POST' ? 'return=representation' : '',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Supabase ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Supabase parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

const ITERATIONS = parseInt(process.env.VAULT_PBKDF2_ITERATIONS || '200000', 10);
const KEY_LEN    = 32; // AES-256
const DIGEST     = 'sha256';

/**
 * Derives a 256-bit AES key from the actor's PIN using PBKDF2.
 * The PIN is intentionally short (6+ digits), so PBKDF2 with high
 * iteration count is essential to make brute-force expensive.
 */
function deriveKey(pin, salt) {
  return crypto.pbkdf2Sync(
    pin,
    salt,
    ITERATIONS,
    KEY_LEN,
    DIGEST
  );
}

function encryptPrivateKey(privateKeyPem, pin) {
  const salt       = crypto.randomBytes(32);          // 256-bit salt
  const iv         = crypto.randomBytes(12);           // 96-bit IV for GCM
  const aesKey     = deriveKey(pin, salt);
  const cipher     = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const encrypted  = Buffer.concat([
    cipher.update(privateKeyPem, 'utf8'),
    cipher.final(),
  ]);
  const authTag    = cipher.getAuthTag();              // 128-bit GCM auth tag

  // Pack everything into one base64 blob: tag(16) + ciphertext
  const cipherBlob = Buffer.concat([authTag, encrypted]).toString('base64');

  return {
    cipherBlob,
    iv:   iv.toString('hex'),
    salt: salt.toString('hex'),
  };
}

function decryptPrivateKey(cipherBlob, iv, salt, pin) {
  const aesKey    = deriveKey(pin, Buffer.from(salt, 'hex'));
  const raw       = Buffer.from(cipherBlob, 'base64');
  const authTag   = raw.subarray(0, 16);
  const encrypted = raw.subarray(16);
  const ivBuf     = Buffer.from(iv, 'hex');

  const decipher  = crypto.createDecipheriv('aes-256-gcm', aesKey, ivBuf);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),                                // throws if PIN is wrong
    ]);
    return decrypted.toString('utf8');
  } catch {
    // GCM authentication failed — wrong PIN or tampered ciphertext
    throw new Error('PIN incorrect or key data corrupted');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * enrollActorKey(actorId, pin)
 * ----------------------------
 * Called once per actor (at registration/setup time by an admin).
 * Generates a fresh EC keypair, encrypts the private key with the actor's
 * PIN, and uploads both to Supabase.
 *
 * Throws if the actor already has a key (idempotency guard).
 */
async function enrollActorKey(actorId, pin) {
  if (!actorId || !pin) throw new Error('actorId and pin are required');

  // Check if actor already enrolled
  const existing = await supabaseRequest(
    'GET',
    `actor_keys?actor_id=eq.${encodeURIComponent(actorId)}&select=actor_id`
  );
  if (existing.length > 0) {
    throw new Error(`Actor '${actorId}' already has a key enrolled`);
  }

  // Generate EC keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Encrypt private key with PIN
  const { cipherBlob, iv, salt } = encryptPrivateKey(privateKey, pin);

  // Upload to Supabase
  await supabaseRequest('POST', 'actor_keys', {
    actor_id:           actorId,
    public_key:         publicKey,
    encrypted_priv_key: cipherBlob,
    iv,
    salt,
  });

  return { actorId, publicKey }; // never return the private key
}

/**
 * getPublicKey(actorId)
 * ----------------------
 * Fetches the actor's public key from Supabase.
 * Public keys are not secret — no PIN required.
 */
async function getPublicKey(actorId) {
  const rows = await supabaseRequest(
    'GET',
    `actor_keys?actor_id=eq.${encodeURIComponent(actorId)}&select=public_key`
  );
  if (!rows.length) throw new Error(`No key found for actor '${actorId}'`);
  return rows[0].public_key;
}

/**
 * fetchAndDecryptKey(actorId, pin)
 * ---------------------------------
 * Fetches the encrypted private key blob from Supabase and decrypts it
 * in memory using the actor's PIN. Returns the plaintext PEM string.
 *
 * IMPORTANT: The caller is responsible for using the returned key and
 * letting it go out of scope immediately. Do NOT store it anywhere.
 *
 * Throws 'PIN incorrect or key data corrupted' if the PIN is wrong
 * (GCM auth tag mismatch — no information about which it was).
 */
async function fetchAndDecryptKey(actorId, pin) {
  if (!actorId || !pin) throw new Error('actorId and pin are required');

  const rows = await supabaseRequest(
    'GET',
    `actor_keys?actor_id=eq.${encodeURIComponent(actorId)}&select=encrypted_priv_key,iv,salt`
  );
  if (!rows.length) throw new Error(`No key found for actor '${actorId}'`);

  const { encrypted_priv_key, iv, salt } = rows[0];
  return decryptPrivateKey(encrypted_priv_key, iv, salt, pin);
  // plaintext PEM returned — exists only in the caller's local scope
}

/**
 * actorKeyExists(actorId)
 * -----------------------
 * Returns true if the actor has been enrolled, false otherwise.
 */
async function actorKeyExists(actorId) {
  const rows = await supabaseRequest(
    'GET',
    `actor_keys?actor_id=eq.${encodeURIComponent(actorId)}&select=actor_id`
  );
  return rows.length > 0;
}

module.exports = {
  enrollActorKey,
  fetchAndDecryptKey,
  getPublicKey,
  actorKeyExists,
};