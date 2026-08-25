/**
 * lib/email.js — sends quote/invoice emails two possible ways:
 *
 * 1) SMTP via your own Google Workspace mailbox (recommended if you
 *    already have Workspace, like TheHubVisionary does). Set:
 *      SMTP_USER = the full Workspace address to send from
 *                  (e.g. info@thehubvisionary.com)
 *      SMTP_PASS = a Gmail "App Password" for that account — NOT the
 *                  normal login password. Generate one at
 *                  myaccount.google.com/apppasswords (requires 2-Step
 *                  Verification to be turned on for that account).
 *    Optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default
 *    465), SMTP_FROM (defaults to SMTP_USER — lets you send *as*
 *    info@thehubvisionary.com while authenticating with a different
 *    mailbox, if your Workspace allows "send as").
 *
 * 2) Resend API (https://resend.com) — an alternative if you'd rather
 *    not use your Workspace mailbox directly. Set RESEND_API_KEY and
 *    EMAIL_FROM (must be on a domain verified in Resend's dashboard).
 *
 * If SMTP_USER/SMTP_PASS are set, that's used. Otherwise, if
 * RESEND_API_KEY is set, that's used. If neither is configured,
 * sendEmail() just reports itself as not-configured rather than
 * failing loudly — quotes/invoices still work fine via WhatsApp and
 * direct download either way.
 */
const https = require("https");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  // not installed (or npm install hasn't been run) — SMTP sending is
  // disabled but the Resend path below still works if configured
}

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "TheHubVisionary <onboarding@resend.dev>";

function smtpAvailable() {
  return Boolean(nodemailer && SMTP_USER && SMTP_PASS);
}

function isEmailConfigured() {
  return smtpAvailable() || Boolean(RESEND_API_KEY);
}

let cachedTransport = null;
function getSmtpTransport() {
  if (!smtpAvailable()) return null;
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465 (implicit TLS), false for 587 (STARTTLS)
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return cachedTransport;
}

function sendViaSmtp(opts) {
  return new Promise((resolve) => {
    const transport = getSmtpTransport();
    if (!transport) return resolve({ ok: false, reason: "SMTP is not configured on this server." });

    const mail = {
      from: SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachmentBuffer) {
      mail.attachments = [{ filename: opts.attachmentName || "attachment.pdf", content: opts.attachmentBuffer }];
    }

    transport.sendMail(mail, (err) => {
      if (err) return resolve({ ok: false, reason: "SMTP error: " + err.message });
      resolve({ ok: true });
    });
  });
}

function sendViaResend(opts) {
  return new Promise((resolve) => {
    const payload = {
      from: EMAIL_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachmentBuffer) {
      payload.attachments = [
        {
          filename: opts.attachmentName || "attachment.pdf",
          content: opts.attachmentBuffer.toString("base64"),
        },
      ];
    }
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, reason: `Email provider returned ${res.statusCode}` });
          }
        });
      }
    );
    req.on("error", () => resolve({ ok: false, reason: "Network error sending email." }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, reason: "Email request timed out." });
    });
    req.write(body);
    req.end();
  });
}

/**
 * @param {Object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {Buffer} [opts.attachmentBuffer]
 * @param {string} [opts.attachmentName]
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
function sendEmail(opts) {
  if (smtpAvailable()) return sendViaSmtp(opts);
  if (RESEND_API_KEY) return sendViaResend(opts);
  return Promise.resolve({
    ok: false,
    reason: "Email is not configured on this server. Set SMTP_USER/SMTP_PASS (Google Workspace) or RESEND_API_KEY.",
  });
}

module.exports = { sendEmail, isEmailConfigured };
