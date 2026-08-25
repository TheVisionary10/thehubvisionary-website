/**
 * lib/documents.js — shared logic for creating a Quote or Invoice:
 * assigns a document number, generates the PDF, saves it under
 * /public/quotes or /public/invoices, and records it in the matching
 * JSON store.
 */
const path = require("path");
const fs = require("fs");
const { readJSON, writeJSON, FILES, QUOTES_DIR, INVOICES_DIR, genId } = require("./store");
const { generateDocumentPDF } = require("./pdf");

function pad(n, len) {
  return String(n).padStart(len, "0");
}

/** Y/M/D as seen in Nairobi right now, regardless of what timezone the
 * server process itself runs in (Render's servers run in UTC). Keeps the
 * date embedded in a document number consistent with the "Generated:"
 * timestamp shown on the PDF, which is also forced to Africa/Nairobi. */
function nairobiDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { year: get("year"), month: get("month"), day: get("day") };
}

function nextNumber(existing, prefix) {
  const { year, month, day } = nairobiDateParts(new Date());
  const datePart = `${year}${month}${day}`;
  // Count only documents already generated on today's (Nairobi) date —
  // not the all-time total — so the sequence correctly restarts at 0001
  // each day, matching what the date-prefixed number format implies.
  const todaysCount = existing.filter((r) => typeof r.number === "string" && r.number.includes(`-${datePart}-`)).length;
  const seq = todaysCount + 1;
  return `${prefix}-${datePart}-${pad(seq, 4)}`;
}

/**
 * @param {"QUOTE"|"INVOICE"} type
 * @param {Object} input - { client: {name,phone,email,county,address}, items: [{description,detail,amount}] or [{description,detail,amountLow,amountHigh}], notes, bookingId }
 * @param {Object} settings - full settings.json contents
 */
async function createDocument(type, input, settings) {
  const isQuote = type === "QUOTE";
  const file = isQuote ? FILES.quotes : FILES.invoices;
  const dir = isQuote ? QUOTES_DIR : INVOICES_DIR;
  const urlBase = isQuote ? "/quotes" : "/invoices";
  const prefix = isQuote ? "Q" : "INV";

  const existing = readJSON(file, []);
  const number = nextNumber(existing, prefix);
  const id = genId();
  const generatedAt = new Date().toISOString();
  const validityDays = isQuote ? Number(settings.quoteValidityDays) || 14 : Number(settings.invoiceDueDays) || 7;
  const expiresOrDueAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();

  const { buffer, totalLow, totalHigh, isEstimate } = await generateDocumentPDF({
    type,
    number,
    generatedAt,
    expiresOrDueAt,
    client: input.client,
    items: input.items,
    settings,
    notes: input.notes || "",
  });

  const filename = `${id}.pdf`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  const pdfUrl = `${urlBase}/${filename}`;

  const record = {
    id,
    number,
    type,
    client: input.client,
    items: input.items,
    totalLow,
    totalHigh,
    isEstimate,
    total: totalHigh, // single-figure convenience field for lists/sorting — the upper estimate when ranged
    generatedAt,
    expiresOrDueAt,
    pdfUrl,
    bookingId: input.bookingId || null,
    status: isQuote ? "sent" : "unpaid",
  };

  existing.unshift(record);
  writeJSON(file, existing);

  return record;
}

module.exports = { createDocument };
