/**
 * lib/security.js — everything defensive in one place.
 */
const crypto = require("crypto");
const { readJSON, FILES } = require("./store");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "changeme";

// ---------- response helpers ----------

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    // Every API response reflects live, admin-editable data (services,
    // settings, socials, etc.) — never let a browser or intermediate CDN
    // cache a stale copy after an edit.
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/**
 * Security headers applied to every response. Content-Security-Policy is
 * deliberately strict on script-src (no 'unsafe-inline') — every <script>
 * in this app lives in an external .js file for exactly this reason.
 * style-src allows 'unsafe-inline' because the SPA sets some layout via
 * inline style="" attributes; tightening that further would mean moving
 * every dynamic style into CSS classes, which isn't worth the fragility
 * it would add to a site this size.
 */
function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
}

// ---------- body parsing ----------

function readBody(req, limitBytes = 1e6) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// ---------- rate limiting (in-memory, per IP+key) ----------

const hitLog = new Map();
function rateLimited(ip, key, maxHits, windowMs) {
  const now = Date.now();
  const logKey = ip + ":" + key;
  const hits = (hitLog.get(logKey) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  hitLog.set(logKey, hits);
  return hits.length > maxHits;
}

/** Read-only check — does NOT record a hit. Used to test "already locked
 * out?" without every legitimate request itself counting against the cap. */
function isLockedOut(ip, key, maxHits, windowMs) {
  const now = Date.now();
  const hits = (hitLog.get(ip + ":" + key) || []).filter((t) => now - t < windowMs);
  return hits.length >= maxHits;
}

/** Records one hit against a key without returning a limited/not-limited
 * verdict — used to log a failure separately from checking the cap. */
function recordHit(ip, key, windowMs) {
  const now = Date.now();
  const logKey = ip + ":" + key;
  const hits = (hitLog.get(logKey) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  hitLog.set(logKey, hits);
}

// periodic cleanup so this Map doesn't grow forever on a long-running process
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of hitLog.entries()) {
    const fresh = hits.filter((t) => now - t < 30 * 60 * 1000);
    if (fresh.length === 0) hitLog.delete(key);
    else hitLog.set(key, fresh);
  }
}, 10 * 60 * 1000).unref();

// ---------- admin auth (with brute-force lockout) ----------

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // still run a comparison of equal length to keep timing consistent
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkBasicAuth(req) {
  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch (e) {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx === -1) return false;
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  return timingSafeEqual(user, ADMIN_USER) && timingSafeEqual(pass, ADMIN_PASS);
}

const ADMIN_LOCKOUT_MAX = 12;
const ADMIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

function requireAuth(req, res, ip) {
  // Lock out an IP after repeated FAILED attempts — blunts brute-forcing
  // the admin password. This only counts wrong credentials, never
  // successful requests, so normal admin use (which fires many requests
  // per page load) never trips it on its own.
  if (isLockedOut(ip, "admin-auth-fail", ADMIN_LOCKOUT_MAX, ADMIN_LOCKOUT_WINDOW_MS)) {
    res.writeHead(429, { "Content-Type": "text/plain" });
    res.end("Too many failed login attempts. Try again later.");
    return false;
  }
  if (checkBasicAuth(req)) return true;
  recordHit(ip, "admin-auth-fail", ADMIN_LOCKOUT_WINDOW_MS);
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="TheHubVisionary Admin"',
    "Content-Type": "text/plain",
  });
  res.end("Authentication required");
  return false;
}

// ---------- validation ----------

const STATUS_VALUES = ["new", "contacted", "done"];

function validateStatus(value) {
  return STATUS_VALUES.includes(value) ? value : null;
}

function isValidPhone(phone) {
  return /^[0-9+ ()-]{7,20}$/.test(String(phone || "").trim());
}

function validateBooking(body) {
  const errors = [];
  const name = (body.name || "").toString().trim();
  const phone = (body.phone || "").toString().trim();
  const service = (body.service || "").toString().trim();
  const county = (body.county || "").toString().trim();

  if (!name || name.length < 2) errors.push("Please add your name.");
  if (!isValidPhone(phone)) errors.push("Please add a valid phone number.");
  if (!service) errors.push("Please choose a service.");
  if (!county) errors.push("Please choose a county.");
  else {
    const known = readJSON(FILES.counties, []);
    if (!known.find((c) => c.name.toLowerCase() === county.toLowerCase())) {
      errors.push("Please choose a valid county from the list.");
    }
  }
  if ((body.message || "").length > 2000) errors.push("Message is too long.");

  return errors;
}

function validateContact(body) {
  const errors = [];
  const name = (body.name || "").toString().trim();
  const message = (body.message || "").toString().trim();
  const phone = (body.phone || "").toString().trim();

  if (!name || name.length < 2) errors.push("Please add your name.");
  if (!isValidPhone(phone)) errors.push("Please add a valid phone number.");
  if (!message || message.length < 3) errors.push("Please add a short message.");
  if (message.length > 2000) errors.push("Message is too long.");

  return errors;
}

// Matches the .slice(0, 20) applied to accepted quotes downstream — capping
// here too means a request with a huge items array (still possible within
// the request body's overall byte cap, e.g. thousands of tiny objects) only
// costs a slice, not a full validation pass over every element.
const MAX_QUOTE_ITEMS = 20;

function validateQuoteRequest(body) {
  const errors = [];
  const name = (body.name || "").toString().trim();
  const phone = (body.phone || "").toString().trim();
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.slice(0, MAX_QUOTE_ITEMS);

  if (!name || name.length < 2) errors.push("Please add your name.");
  if (!isValidPhone(phone)) errors.push("Please add a valid phone number.");
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.push("Please add a valid email or leave it blank.");
  if (!items.length) errors.push("Add at least one service to the quote.");
  if (rawItems.length > MAX_QUOTE_ITEMS) errors.push(`Please limit a single quote to ${MAX_QUOTE_ITEMS} services.`);
  items.forEach((it, i) => {
    if (!it.description) errors.push(`Line item ${i + 1} is missing a description.`);

    const hasRange = it.amountLow != null && it.amountHigh != null;
    if (hasRange) {
      const low = Number(it.amountLow);
      const high = Number(it.amountHigh);
      if (!Number.isFinite(low) || low < 0 || !Number.isFinite(high) || high < 0) {
        errors.push(`Line item ${i + 1} needs a valid price range.`);
      } else if (low > high) {
        errors.push(`Line item ${i + 1}'s range is backwards (low is higher than high).`);
      } else if (high > 10000000) {
        errors.push(`Line item ${i + 1} amount looks too large — please check it.`);
      }
    } else {
      const amt = Number(it.amount);
      if (!Number.isFinite(amt) || amt < 0) errors.push(`Line item ${i + 1} needs a valid amount.`);
      if (amt > 10000000) errors.push(`Line item ${i + 1} amount looks too large — please check it.`);
    }
  });

  return errors;
}

module.exports = {
  sendJSON,
  applySecurityHeaders,
  readBody,
  rateLimited,
  requireAuth,
  validateStatus,
  validateBooking,
  validateContact,
  validateQuoteRequest,
};
