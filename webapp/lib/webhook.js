/**
 * lib/webhook.js — fire-and-forget notification for new bookings/messages,
 * e.g. a Slack or Discord incoming webhook, so you don't have to keep
 * refreshing /admin. Optional — only runs if WEBHOOK_URL is set.
 */
const https = require("https");
const { URL } = require("url");

const WEBHOOK_URL = process.env.WEBHOOK_URL || "";

function notifyWebhook(message) {
  if (!WEBHOOK_URL) return;
  try {
    const url = new URL(WEBHOOK_URL);
    const body = JSON.stringify({ text: message, content: message });
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: 5000,
      },
      (res) => res.on("data", () => {})
    );
    req.on("error", () => {});
    req.on("timeout", () => req.destroy());
    req.write(body);
    req.end();
  } catch (e) {
    // malformed WEBHOOK_URL — ignore rather than crash the server
  }
}

module.exports = { notifyWebhook };
