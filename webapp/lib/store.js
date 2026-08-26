/**
 * lib/store.js — flat-file JSON storage helpers.
 * Every "table" in this app is a JSON file under /data. Simple, human
 * readable, zero setup — swap for a real database later if you outgrow it.
 *
 * Persistence on hosts that only allow ONE disk per service (e.g. Render):
 * set the STORAGE_DIR env var to the disk's mount path, and everything
 * that needs to survive a redeploy — the data/*.json files, generated
 * quote/invoice PDFs, and uploaded partner logos — lives under that one
 * directory instead of being split across /data and /public. Leave
 * STORAGE_DIR unset for local development and nothing changes: data
 * stays in the repo's own /data folder as before.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public"); // code/static assets — always served from the deployed repo

const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : null;
const DATA_DIR = STORAGE_DIR ? path.join(STORAGE_DIR, "data") : path.join(ROOT, "data");
// Generated/uploaded content: on the same one disk as the data files when
// STORAGE_DIR is set; otherwise identical to today's behavior (straight
// into /public, served by the normal static file server with no extra code).
const PERSIST_DIR = STORAGE_DIR ? path.join(STORAGE_DIR, "generated") : PUBLIC_DIR;
const QUOTES_DIR = path.join(PERSIST_DIR, "quotes");
const INVOICES_DIR = path.join(PERSIST_DIR, "invoices");
const PARTNER_LOGOS_DIR = path.join(PERSIST_DIR, "assets", "partners");

const FILES = {
  services: path.join(DATA_DIR, "services.json"),
  clients: path.join(DATA_DIR, "clients.json"),
  counties: path.join(DATA_DIR, "counties.json"),
  partners: path.join(DATA_DIR, "partners.json"),
  bookings: path.join(DATA_DIR, "bookings.json"),
  contact: path.join(DATA_DIR, "contact.json"),
  settings: path.join(DATA_DIR, "settings.json"),
  quotes: path.join(DATA_DIR, "quotes.json"),
  invoices: path.join(DATA_DIR, "invoices.json"),
  faq: path.join(DATA_DIR, "faq.json"),
};

/**
 * Creates the storage directories if they don't exist yet, and — only the
 * very first time a fresh STORAGE_DIR is used — seeds it by copying the
 * repo's own default /data files (your real services, counties, FAQ,
 * default settings, etc.) so the site launches with real content instead
 * of empty. Never overwrites a file that's already on the disk, so admin
 * edits and real customer data are never touched on later deploys.
 */
function initStorage() {
  [DATA_DIR, QUOTES_DIR, INVOICES_DIR, PARTNER_LOGOS_DIR].forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });

  if (!STORAGE_DIR) return; // local dev: repo's /data is already the live copy, nothing to seed

  const repoDataDir = path.join(ROOT, "data");
  let seedFiles = [];
  try {
    seedFiles = fs.readdirSync(repoDataDir).filter((f) => f.endsWith(".json"));
  } catch (e) {
    return;
  }
  seedFiles.forEach((filename) => {
    const dest = path.join(DATA_DIR, filename);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(repoDataDir, filename), dest);
    }
  });
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  // write to a temp file then rename — avoids a half-written file if the
  // process dies mid-write (atomic on the same filesystem)
  const tmp = file + ".tmp" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function genId() {
  return Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex");
}

/**
 * Trims and length-limits text for storage — deliberately does NOT
 * HTML-escape. Rendering surfaces (admin.html, PDF generation) escape or
 * lay out text at render time; escaping here too would double-escape.
 */
function cleanText(str, maxLen) {
  return String(str == null ? "" : str).trim().slice(0, maxLen || 5000);
}

/** Rejects (returns "") a URL-shaped value whose scheme isn't in the
 * allowlist. cleanText() only trims/truncates, so without this a stored
 * social link or partner URL could be a `javascript:` URI that runs when
 * a visitor clicks the link it's rendered into. */
function sanitizeUrl(str, maxLen) {
  const val = cleanText(str, maxLen);
  if (!val) return val;
  return /^(https?:|mailto:)/i.test(val) ? val : "";
}

/** For the rendering surfaces referenced above that build HTML directly
 * (currently: the admin notification emails in server.js) — escapes the
 * five HTML-significant characters so user-submitted text (a booking
 * name/message, a quote line item) can't inject markup or links into an
 * email the site owner opens in their mail client. */
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function toCSV(rows, columns) {
  const escapeCell = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(","));
  return [header, ...lines].join("\n");
}

module.exports = {
  ROOT,
  STORAGE_DIR,
  DATA_DIR,
  PUBLIC_DIR,
  PERSIST_DIR,
  QUOTES_DIR,
  INVOICES_DIR,
  PARTNER_LOGOS_DIR,
  FILES,
  initStorage,
  readJSON,
  writeJSON,
  genId,
  cleanText,
  sanitizeUrl,
  escapeHtml,
  toCSV,
};
