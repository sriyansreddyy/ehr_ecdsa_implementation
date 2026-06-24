'use strict';

/**
 * mailer.js
 * ---------
 * Sends OTP emails via the Resend API (https://resend.com).
 * Free tier: 3,000 emails/month, no credit card required.
 *
 * .env vars required:
 *   RESEND_API_KEY=re_xxxxxxxxxxxx
 *   MAIL_FROM=noreply@yourdomain.com   ← must be a verified domain in Resend
 *                                         OR use onboarding@resend.dev for testing
 */

const https = require('https');

/**
 * sendOtpEmail(toEmail, actorId, otp)
 * ------------------------------------
 * Sends a styled OTP email. Returns true on success, throws on failure.
 */
async function sendOtpEmail(toEmail, actorId, otp) {
  const from    = process.env.MAIL_FROM || 'onboarding@resend.dev';
  const apiKey  = process.env.RESEND_API_KEY;

  if (!apiKey) throw new Error('RESEND_API_KEY not set in environment');

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#0f172a;margin-bottom:8px">EHR Hospital Portal</h2>
      <p style="color:#475569;margin-bottom:24px">
        A sign-in attempt was made for account <strong>${actorId}</strong>.
      </p>
      <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
        <p style="color:#64748b;font-size:13px;margin:0 0 8px">Your one-time passcode</p>
        <p style="font-size:40px;font-weight:700;letter-spacing:12px;color:#0f172a;margin:0">
          ${otp}
        </p>
      </div>
      <p style="color:#94a3b8;font-size:12px">
        This code expires in <strong>5 minutes</strong>. If you did not request this,
        please contact your hospital IT administrator immediately.
      </p>
    </div>
  `;

  const body = JSON.stringify({
    from,
    to:      [toEmail],
    subject: `${otp} — EHR Portal sign-in code`,
    html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path:     '/emails',
        method:   'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve(true);
          } else {
            reject(new Error(`Resend API error ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendOtpEmail };