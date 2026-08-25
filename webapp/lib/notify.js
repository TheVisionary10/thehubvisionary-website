/**
 * lib/notify.js — notifies YOU (the business owner) the moment a callout
 * booking or quote request comes in, by email and/or SMS, with the key
 * details right there so you don't have to open the admin panel just to
 * see what came in — though it links there for the full picture.
 *
 * Both channels are independent and optional:
 *
 *  EMAIL — reuses whatever's already configured in lib/email.js (your
 *  Google Workspace SMTP, or Resend). Sent to ADMIN_NOTIFY_EMAIL if set,
 *  otherwise falls back to the "email" address in your site settings.
 *
 *  SMS — via Africa's Talking (africastalking.com), the standard SMS
 *  gateway for Kenyan businesses — the same kind of service your own
 *  "Bulk SMS Services" offering sets up for clients. Set AT_USERNAME and
 *  AT_API_KEY (from your Africa's Talking dashboard) to enable it. Sent
 *  to ADMIN_NOTIFY_PHONE if set, otherwise your site's primary phone
 *  number. Optional AT_SENDER_ID if you have an approved sender ID;
 *  otherwise Africa's Talking uses a shared shortcode.
 *
 * Neither channel is required — if nothing is configured, notifyAdmin()
 * simply does nothing (silently), and bookings/quotes still work fine;
 * you'd just rely on checking /admin or the Slack/Discord webhook
 * (lib/webhook.js) instead.
 */
const https = require("https");
const querystring = require("querystring");
const { sendEmail, isEmailConfigured } = require("./email");

const AT_USERNAME = process.env.AT_USERNAME || "";
const AT_API_KEY = process.env.AT_API_KEY || "";
const AT_SENDER_ID = process.env.AT_SENDER_ID || "";

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "";
const ADMIN_NOTIFY_PHONE = process.env.ADMIN_NOTIFY_PHONE || "";

function smsConfigured() {
  return Boolean(AT_USERNAME && AT_API_KEY);
}

function isNotifyConfigured() {
  return isEmailConfigured() || smsConfigured();
}

/** Best-effort conversion of common Kenyan phone formats to E.164
 * (+254...), which Africa's Talking requires. */
function normalizeKenyanPhone(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+254")) return digits;
  if (digits.startsWith("254")) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+254" + digits.slice(1);
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return "+254" + digits;
  return digits.startsWith("+") ? digits : null; // unrecognized shape — don't guess further
}

function sendSMS(to, message) {
  return new Promise((resolve) => {
    if (!smsConfigured()) return resolve({ ok: false, reason: "SMS is not configured on this server." });
    const toNorm = normalizeKenyanPhone(to);
    if (!toNorm) return resolve({ ok: false, reason: "Notification phone number isn't in a recognizable format." });

    const params = { username: AT_USERNAME, to: toNorm, message: String(message).slice(0, 459) };
    if (AT_SENDER_ID) params.from = AT_SENDER_ID;
    const body = querystring.stringify(params);

    const req = https.request(
      {
        hostname: "api.africastalking.com",
        path: "/version1/messaging",
        method: "POST",
        headers: {
          apiKey: AT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 8000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, reason: `SMS provider returned HTTP ${res.statusCode}` });
          }
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, reason: "Network error sending SMS: " + e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, reason: "SMS request timed out." });
    });
    req.write(body);
    req.end();
  });
}

/**
 * Notifies the admin of a new booking or quote via whichever of
 * email/SMS are configured. Never throws — a notification failure
 * should never break the booking/quote flow itself.
 *
 * @param {Object} opts
 * @param {string} opts.subject - email subject line
 * @param {string} opts.emailHtml - full HTML email body (can be detailed)
 * @param {string} opts.smsText - short plain-text SMS body (keep under ~300 chars)
 * @param {Object} opts.settings - site settings.json contents, used as a fallback
 *   destination when ADMIN_NOTIFY_EMAIL/ADMIN_NOTIFY_PHONE aren't set
 * @returns {Promise<{emailSent: boolean, smsSent: boolean}>}
 */
async function notifyAdmin({ subject, emailHtml, smsText, settings }) {
  const results = { emailSent: false, smsSent: false };

  try {
    const toEmail = ADMIN_NOTIFY_EMAIL || (settings && settings.email) || "";
    if (toEmail && isEmailConfigured()) {
      const r = await sendEmail({ to: toEmail, subject, html: emailHtml });
      results.emailSent = r.ok;
    }
  } catch (e) {
    // never let a notification failure affect the booking/quote itself
  }

  try {
    const toPhone = ADMIN_NOTIFY_PHONE || (settings && settings.phone1) || "";
    if (toPhone && smsConfigured()) {
      const r = await sendSMS(toPhone, smsText);
      results.smsSent = r.ok;
    }
  } catch (e) {
    // same — swallow, never break the request
  }

  return results;
}

module.exports = { notifyAdmin, sendSMS, smsConfigured, isNotifyConfigured, normalizeKenyanPhone };
