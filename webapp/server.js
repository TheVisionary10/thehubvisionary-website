/**
 * TheHubVisionary — server.js
 * Entry point. Route table only — the actual logic lives in lib/*.js so
 * this file stays readable as a map of "what URL does what".
 *
 * Run:   node server.js   (after `npm install` — this app now depends on
 *                          pdf-lib for quote/invoice PDF generation)
 * Env:   PORT, ADMIN_USER, ADMIN_PASS, WEBHOOK_URL, RESEND_API_KEY,
 *        EMAIL_FROM — see README.md
 */
const http = require("http");
const path = require("path");
const { URL } = require("url");

const { readJSON, writeJSON, cleanText, toCSV, genId, FILES, initStorage, PERSIST_DIR } = require("./lib/store");
initStorage(); // creates data/generated dirs, seeds a fresh STORAGE_DIR with default content on first boot
const {
  sendJSON,
  applySecurityHeaders,
  readBody,
  rateLimited,
  requireAuth,
  validateStatus,
  isValidPhone,
  validateBooking,
  validateContact,
  validateQuoteRequest,
} = require("./lib/security");
const { serveStatic } = require("./lib/static");
const { calloutFeeForDistance, countiesWithFees } = require("./lib/fees");
const { createDocument } = require("./lib/documents");
const { saveUploadedImage, deleteUploadedImage } = require("./lib/upload");
const { notifyWebhook } = require("./lib/webhook");
const { sendEmail, isEmailConfigured } = require("./lib/email");

const PORT = process.env.PORT || 3000;

// A custom header that a plain cross-site <form> POST cannot set, and that
// a cross-origin fetch() can only set after a CORS preflight — which this
// server never approves (no Access-Control-Allow-Origin is ever sent). So
// requiring it on every admin write blocks classic CSRF without needing
// sessions, tokens, or a login page beyond Basic Auth.
function requireCSRFHeader(req, res) {
  if (req.headers["x-thv-admin"] === "1") return true;
  sendJSON(res, 403, { error: "Missing required header." });
  return false;
}

// ---------- small helpers ----------

function pickPublicSettings(settings) {
  // Everything in settings.json is safe to expose publicly (it's the data
  // that ends up on quotes/invoices and the contact page anyway) — no
  // secrets live in this file.
  return settings;
}

function findCountyFee(countyName) {
  const counties = readJSON(FILES.counties, []);
  const match = counties.find((c) => c.name.toLowerCase() === String(countyName || "").toLowerCase());
  if (!match) return null;
  return { ...match, ...calloutFeeForDistance(match.distanceKm) };
}

// ---------- request handler ----------

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();

  try {
    // =========================================================
    // PUBLIC READ APIs
    // =========================================================
    if (pathname === "/api/services" && req.method === "GET") {
      return sendJSON(res, 200, readJSON(FILES.services, []));
    }
    if (pathname.startsWith("/api/services/") && req.method === "GET") {
      const id = pathname.split("/")[3];
      if (id) {
        const services = readJSON(FILES.services, []);
        const svc = services.find((s) => s.id === id);
        if (!svc) return sendJSON(res, 404, { error: "Service not found" });
        return sendJSON(res, 200, svc);
      }
    }
    if (pathname === "/api/clients" && req.method === "GET") {
      return sendJSON(res, 200, readJSON(FILES.clients, []));
    }
    if (pathname === "/api/counties" && req.method === "GET") {
      return sendJSON(res, 200, countiesWithFees());
    }
    if (pathname === "/api/partners" && req.method === "GET") {
      return sendJSON(res, 200, readJSON(FILES.partners, []));
    }
    if (pathname === "/api/faq" && req.method === "GET") {
      return sendJSON(res, 200, readJSON(FILES.faq, []));
    }
    if (pathname === "/api/settings" && req.method === "GET") {
      return sendJSON(res, 200, pickPublicSettings(readJSON(FILES.settings, {})));
    }
    if (pathname === "/api/health" && req.method === "GET") {
      return sendJSON(res, 200, { ok: true, time: new Date().toISOString() });
    }

    // =========================================================
    // BOOKINGS (public create)
    // =========================================================
    if (pathname === "/api/bookings" && req.method === "POST") {
      if (rateLimited(ip, "bookings", 8, 10 * 60 * 1000)) {
        return sendJSON(res, 429, { error: "Too many requests. Please try again later." });
      }
      const body = await readBody(req);
      if (body.website) return sendJSON(res, 200, { ok: true }); // honeypot — silently drop

      const errors = validateBooking(body);
      if (errors.length) return sendJSON(res, 400, { errors });

      const bookings = readJSON(FILES.bookings, []);
      const county = cleanText(body.county, 100);
      const feeInfo = findCountyFee(county) || { fee: "", accommodation: false, note: "" };

      const record = {
        id: genId(),
        name: cleanText(body.name, 200),
        phone: cleanText(body.phone, 40),
        service: cleanText(body.service, 200),
        preferredDate: cleanText(body.preferredDate, 100),
        county,
        address: cleanText(body.address, 300),
        calloutFee: feeInfo.fee,
        accommodationLikely: feeInfo.accommodation,
        message: cleanText(body.message, 2000),
        status: "new",
        createdAt: new Date().toISOString(),
      };
      bookings.unshift(record);
      writeJSON(FILES.bookings, bookings);

      notifyWebhook(
        `📋 New callout booking: ${record.name} (${record.phone}) — ${record.service} in ${record.county}. Fee est: ${record.calloutFee || "n/a"}.`
      );

      return sendJSON(res, 201, { ok: true, id: record.id, calloutFee: feeInfo.fee, accommodationLikely: feeInfo.accommodation });
    }

    // =========================================================
    // CONTACT (public create)
    // =========================================================
    if (pathname === "/api/contact" && req.method === "POST") {
      if (rateLimited(ip, "contact", 10, 10 * 60 * 1000)) {
        return sendJSON(res, 429, { error: "Too many requests. Please try again later." });
      }
      const body = await readBody(req);
      if (body.website) return sendJSON(res, 200, { ok: true });

      const errors = validateContact(body);
      if (errors.length) return sendJSON(res, 400, { errors });

      const messages = readJSON(FILES.contact, []);
      const record = {
        id: genId(),
        name: cleanText(body.name, 200),
        phone: cleanText(body.phone, 40),
        email: cleanText(body.email, 200),
        message: cleanText(body.message, 2000),
        status: "new",
        createdAt: new Date().toISOString(),
      };
      messages.unshift(record);
      writeJSON(FILES.contact, messages);

      notifyWebhook(`✉️ New contact message: ${record.name} (${record.phone}) — "${record.message.slice(0, 120)}"`);

      return sendJSON(res, 201, { ok: true, id: record.id });
    }

    // =========================================================
    // QUOTE GENERATION (public create — this is the "get an exact
    // figure" flow: client picks services, gets a PDF with a real
    // number and an expiry, no login needed)
    // =========================================================
    if (pathname === "/api/quote/generate" && req.method === "POST") {
      if (rateLimited(ip, "quote", 6, 10 * 60 * 1000)) {
        return sendJSON(res, 429, { error: "Too many requests. Please try again later." });
      }
      const body = await readBody(req, 2e6);
      if (body.website) return sendJSON(res, 200, { ok: true });

      const errors = validateQuoteRequest(body);
      if (errors.length) return sendJSON(res, 400, { errors });

      const settings = readJSON(FILES.settings, {});
      const county = cleanText(body.county, 100);
      const items = body.items.slice(0, 20).map((it) => {
        const base = {
          description: cleanText(it.description, 200),
          detail: cleanText(it.detail, 300),
        };
        if (it.amountLow != null && it.amountHigh != null) {
          return { ...base, amountLow: Number(it.amountLow) || 0, amountHigh: Number(it.amountHigh) || 0 };
        }
        return { ...base, amount: Number(it.amount) || 0 };
      });

      // Auto-add a callout fee line if a priced (non-Nairobi, non-remote) county was chosen
      if (county) {
        const feeInfo = findCountyFee(county);
        if (feeInfo && typeof feeInfo.feeLow === "number") {
          items.push({
            description: "Callout fee (estimated)",
            detail: `${county} — distance-based, ~${feeInfo.distanceKm}km from Nairobi`,
            amountLow: feeInfo.feeLow,
            amountHigh: feeInfo.feeHigh != null ? feeInfo.feeHigh : feeInfo.feeLow,
          });
        }
      }

      const client = {
        name: cleanText(body.name, 200),
        phone: cleanText(body.phone, 40),
        email: cleanText(body.email, 200),
        county,
        address: cleanText(body.address, 300),
      };

      let record;
      try {
        record = await createDocument("QUOTE", { client, items, notes: cleanText(body.notes, 500) }, settings);
      } catch (e) {
        console.error("Quote generation failed:", e);
        return sendJSON(res, 500, { error: "Could not generate the quote PDF. Please try again or contact us directly." });
      }

      notifyWebhook(
        `📄 New quote generated: ${record.number} for ${client.name} (${client.phone}) — est. ${record.totalLow.toLocaleString()}–${record.totalHigh.toLocaleString()}.`
      );

      let emailResult = { ok: false, reason: "No email address provided." };
      if (client.email) {
        try {
          const attachmentBuffer = require("fs").readFileSync(path.join(PERSIST_DIR, record.pdfUrl));
          emailResult = await sendEmail({
            to: client.email,
            subject: `Your quote from TheHubVisionary — ${record.number}`,
            html: `<p>Hi ${client.name || "there"},</p><p>Attached is your quote <b>${record.number}</b>, valid until ${new Date(
              record.expiresOrDueAt
            ).toLocaleDateString("en-GB")}.</p><p>Reply to this email or WhatsApp us on ${settings.phone1 || ""} with any questions.</p><p>— TheHubVisionary</p>`,
            attachmentBuffer,
            attachmentName: `${record.number}.pdf`,
          });
        } catch (e) {
          console.error("Could not read generated quote PDF for emailing:", e);
          emailResult = { ok: false, reason: "The PDF was generated but couldn't be attached to the email." };
        }
      }

      const totalText =
        record.totalLow === record.totalHigh
          ? `KSh ${record.totalHigh.toLocaleString()}`
          : `KSh ${record.totalLow.toLocaleString()} - ${record.totalHigh.toLocaleString()} (estimate)`;
      const waText =
        `Hi TheHubVisionary, here's my quote request follow-up.\n\n` +
        `Quote: ${record.number}\nName: ${client.name}\nEstimated total: ${totalText}\n` +
        `PDF: ${settings.siteUrl || "https://thehubvisionary.com"}${record.pdfUrl}`;

      return sendJSON(res, 201, {
        ok: true,
        id: record.id,
        number: record.number,
        pdfUrl: record.pdfUrl,
        totalLow: record.totalLow,
        totalHigh: record.totalHigh,
        isEstimate: record.isEstimate,
        expiresAt: record.expiresOrDueAt,
        emailSent: emailResult.ok,
        emailReason: emailResult.ok ? null : emailResult.reason,
        whatsappText: waText,
      });
    }

    // =========================================================
    // ADMIN — auth-gated below this point
    // =========================================================

    if (pathname === "/admin" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      return serveStatic(req, res, "/admin.html");
    }

    if (pathname === "/api/admin/bookings" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      return sendJSON(res, 200, readJSON(FILES.bookings, []));
    }
    if (pathname === "/api/admin/contact" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      return sendJSON(res, 200, readJSON(FILES.contact, []));
    }
    if (pathname.startsWith("/api/admin/bookings/") && req.method === "PATCH") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = pathname.split("/").pop();
      const body = await readBody(req);
      const bookings = readJSON(FILES.bookings, []);
      const idx = bookings.findIndex((b) => b.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Not found" });
      const status = validateStatus(body.status);
      if (status) bookings[idx].status = status;
      writeJSON(FILES.bookings, bookings);
      return sendJSON(res, 200, { ok: true });
    }
    if (pathname.startsWith("/api/admin/contact/") && req.method === "PATCH") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = pathname.split("/").pop();
      const body = await readBody(req);
      const messages = readJSON(FILES.contact, []);
      const idx = messages.findIndex((m) => m.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Not found" });
      const status = validateStatus(body.status);
      if (status) messages[idx].status = status;
      writeJSON(FILES.contact, messages);
      return sendJSON(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/stats" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      const bookings = readJSON(FILES.bookings, []);
      const messages = readJSON(FILES.contact, []);
      const quotes = readJSON(FILES.quotes, []);
      const invoices = readJSON(FILES.invoices, []);

      const countBy = (arr, keyFn) => {
        const out = {};
        arr.forEach((item) => {
          const k = keyFn(item) || "—";
          out[k] = (out[k] || 0) + 1;
        });
        return Object.entries(out)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count }));
      };

      return sendJSON(res, 200, {
        totalBookings: bookings.length,
        newBookings: bookings.filter((b) => b.status === "new").length,
        contactedBookings: bookings.filter((b) => b.status === "contacted").length,
        doneBookings: bookings.filter((b) => b.status === "done").length,
        totalMessages: messages.length,
        newMessages: messages.filter((m) => m.status === "new").length,
        totalQuotes: quotes.length,
        totalInvoices: invoices.length,
        unpaidInvoices: invoices.filter((i) => i.status === "unpaid").length,
        unpaidTotal: invoices.filter((i) => i.status === "unpaid").reduce((sum, i) => sum + (i.total || 0), 0),
        bookingsByService: countBy(bookings, (b) => b.service),
        bookingsByCounty: countBy(bookings, (b) => b.county),
      });
    }

    if (pathname === "/api/admin/bookings.csv" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      const csv = toCSV(readJSON(FILES.bookings, []), [
        { key: "createdAt", label: "Date" },
        { key: "name", label: "Name" },
        { key: "phone", label: "Phone" },
        { key: "service", label: "Service" },
        { key: "county", label: "County" },
        { key: "address", label: "Address" },
        { key: "preferredDate", label: "Preferred Date" },
        { key: "calloutFee", label: "Callout Fee" },
        { key: "accommodationLikely", label: "Accommodation Likely" },
        { key: "message", label: "Message" },
        { key: "status", label: "Status" },
      ]);
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bookings.csv"' });
      return res.end(csv);
    }
    if (pathname === "/api/admin/contact.csv" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      const csv = toCSV(readJSON(FILES.contact, []), [
        { key: "createdAt", label: "Date" },
        { key: "name", label: "Name" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "message", label: "Message" },
        { key: "status", label: "Status" },
      ]);
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="contact-messages.csv"' });
      return res.end(csv);
    }

    // ---------- ADMIN: quotes & invoices ----------
    if (pathname === "/api/admin/quotes" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      return sendJSON(res, 200, readJSON(FILES.quotes, []));
    }
    if (pathname === "/api/admin/invoices" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      return sendJSON(res, 200, readJSON(FILES.invoices, []));
    }
    if (pathname === "/api/admin/invoices" && req.method === "POST") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const body = await readBody(req, 2e6);
      const errors = validateQuoteRequest(body); // same shape: client + items
      if (errors.length) return sendJSON(res, 400, { errors });

      const settings = readJSON(FILES.settings, {});
      const client = {
        name: cleanText(body.name, 200),
        phone: cleanText(body.phone, 40),
        email: cleanText(body.email, 200),
        county: cleanText(body.county, 100),
        address: cleanText(body.address, 300),
      };
      const items = body.items.slice(0, 30).map((it) => ({
        description: cleanText(it.description, 200),
        detail: cleanText(it.detail, 300),
        amount: Number(it.amount) || 0,
      }));

      let record;
      try {
        record = await createDocument(
          "INVOICE",
          { client, items, notes: cleanText(body.notes, 500), bookingId: body.bookingId || null },
          settings
        );
      } catch (e) {
        console.error("Invoice generation failed:", e);
        return sendJSON(res, 500, { error: "Could not generate the invoice PDF." });
      }

      let emailResult = { ok: false, reason: "No email address provided." };
      if (client.email) {
        try {
          const attachmentBuffer = require("fs").readFileSync(path.join(PERSIST_DIR, record.pdfUrl));
          emailResult = await sendEmail({
            to: client.email,
            subject: `Invoice from TheHubVisionary — ${record.number}`,
            html: `<p>Hi ${client.name || "there"},</p><p>Attached is invoice <b>${record.number}</b>, due ${new Date(
              record.expiresOrDueAt
            ).toLocaleDateString("en-GB")}.</p><p>— TheHubVisionary</p>`,
            attachmentBuffer,
            attachmentName: `${record.number}.pdf`,
          });
        } catch (e) {
          console.error("Could not read generated invoice PDF for emailing:", e);
          emailResult = { ok: false, reason: "The PDF was generated but couldn't be attached to the email." };
        }
      }

      return sendJSON(res, 201, { ok: true, record, emailSent: emailResult.ok, emailReason: emailResult.ok ? null : emailResult.reason });
    }
    if (pathname.startsWith("/api/admin/invoices/") && req.method === "PATCH") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = pathname.split("/").pop();
      const body = await readBody(req);
      const invoices = readJSON(FILES.invoices, []);
      const idx = invoices.findIndex((i) => i.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Not found" });
      const allowed = ["unpaid", "paid", "cancelled"];
      if (allowed.includes(body.status)) invoices[idx].status = body.status;
      writeJSON(FILES.invoices, invoices);
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- ADMIN: services CMS ----------
    if (pathname === "/api/admin/services" && req.method === "POST") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const body = await readBody(req, 2e5);
      if (!body.name || !body.category) return sendJSON(res, 400, { error: "Name and category are required." });

      const services = readJSON(FILES.services, []);
      const id =
        cleanText(body.name, 60)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || genId();
      if (services.find((s) => s.id === id)) return sendJSON(res, 409, { error: "A service with a similar name already exists." });

      const record = {
        id,
        category: cleanText(body.category, 60),
        icon: cleanText(body.icon, 10) || "•",
        name: cleanText(body.name, 200),
        tagline: cleanText(body.tagline, 300),
        description: cleanText(body.description, 3000),
        pricing: Array.isArray(body.pricing)
          ? body.pricing.slice(0, 20).map((p) => ({
              label: cleanText(p.label, 100),
              detail: cleanText(p.detail, 300),
              price: cleanText(p.price, 100),
            }))
          : [],
      };
      services.push(record);
      writeJSON(FILES.services, services);
      return sendJSON(res, 201, { ok: true, service: record });
    }
    if (pathname.startsWith("/api/admin/services/") && req.method === "PUT") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const body = await readBody(req, 2e5);
      const services = readJSON(FILES.services, []);
      const idx = services.findIndex((s) => s.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Service not found" });

      services[idx] = {
        ...services[idx],
        category: cleanText(body.category, 60) || services[idx].category,
        icon: cleanText(body.icon, 10) || services[idx].icon,
        name: cleanText(body.name, 200) || services[idx].name,
        tagline: cleanText(body.tagline, 300),
        description: cleanText(body.description, 3000),
        pricing: Array.isArray(body.pricing)
          ? body.pricing.slice(0, 20).map((p) => ({
              label: cleanText(p.label, 100),
              detail: cleanText(p.detail, 300),
              price: cleanText(p.price, 100),
            }))
          : services[idx].pricing,
      };
      writeJSON(FILES.services, services);
      return sendJSON(res, 200, { ok: true, service: services[idx] });
    }
    if (pathname.startsWith("/api/admin/services/") && req.method === "DELETE") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const services = readJSON(FILES.services, []);
      const next = services.filter((s) => s.id !== id);
      if (next.length === services.length) return sendJSON(res, 404, { error: "Service not found" });
      writeJSON(FILES.services, next);
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- ADMIN: "Our Work" case studies CMS ----------
    if (pathname === "/api/admin/clients" && req.method === "POST") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const body = await readBody(req, 2e5);
      if (!body.title) return sendJSON(res, 400, { error: "Title is required." });

      const clients = readJSON(FILES.clients, []);
      const record = {
        id: genId(),
        sector: cleanText(body.sector, 150),
        title: cleanText(body.title, 200),
        summary: cleanText(body.summary, 1000),
        service: cleanText(body.service, 200),
      };
      clients.push(record);
      writeJSON(FILES.clients, clients);
      return sendJSON(res, 201, { ok: true, client: record });
    }
    if (pathname.startsWith("/api/admin/clients/") && req.method === "PUT") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = pathname.split("/").pop();
      const body = await readBody(req, 2e5);
      const clients = readJSON(FILES.clients, []);
      const idx = clients.findIndex((c) => c.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Entry not found" });

      clients[idx] = {
        ...clients[idx],
        sector: cleanText(body.sector, 150),
        title: cleanText(body.title, 200) || clients[idx].title,
        summary: cleanText(body.summary, 1000),
        service: cleanText(body.service, 200),
      };
      writeJSON(FILES.clients, clients);
      return sendJSON(res, 200, { ok: true, client: clients[idx] });
    }
    if (pathname.startsWith("/api/admin/clients/") && req.method === "DELETE") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = pathname.split("/").pop();
      const clients = readJSON(FILES.clients, []);
      const next = clients.filter((c) => c.id !== id);
      if (next.length === clients.length) return sendJSON(res, 404, { error: "Entry not found" });
      writeJSON(FILES.clients, next);
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- ADMIN: partners CMS (logo via base64 data URI) ----------
    if (pathname === "/api/admin/partners" && req.method === "POST") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const body = await readBody(req, 3e6);
      if (!body.name) return sendJSON(res, 400, { error: "Partner name is required." });

      let logoUrl = "";
      if (body.logoDataUri) {
        const result = saveUploadedImage(body.logoDataUri);
        if (!result.ok) return sendJSON(res, 400, { error: result.error });
        logoUrl = result.relativePath;
      }

      const partners = readJSON(FILES.partners, []);
      const record = {
        id: genId(),
        name: cleanText(body.name, 150),
        category: cleanText(body.category, 100) || "Partner",
        description: cleanText(body.description, 500),
        logoUrl,
        url: cleanText(body.url, 300),
      };
      partners.push(record);
      writeJSON(FILES.partners, partners);
      return sendJSON(res, 201, { ok: true, partner: record });
    }
    if (pathname.startsWith("/api/admin/partners/") && req.method === "PUT") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = pathname.split("/").pop();
      const body = await readBody(req, 3e6);
      const partners = readJSON(FILES.partners, []);
      const idx = partners.findIndex((p) => p.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Partner not found" });

      let logoUrl = partners[idx].logoUrl;
      if (body.logoDataUri) {
        const result = saveUploadedImage(body.logoDataUri);
        if (!result.ok) return sendJSON(res, 400, { error: result.error });
        deleteUploadedImage(logoUrl);
        logoUrl = result.relativePath;
      }

      partners[idx] = {
        ...partners[idx],
        name: cleanText(body.name, 150) || partners[idx].name,
        category: cleanText(body.category, 100) || partners[idx].category,
        description: cleanText(body.description, 500),
        url: cleanText(body.url, 300),
        logoUrl,
      };
      writeJSON(FILES.partners, partners);
      return sendJSON(res, 200, { ok: true, partner: partners[idx] });
    }
    if (pathname.startsWith("/api/admin/partners/") && req.method === "DELETE") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const id = pathname.split("/").pop();
      const partners = readJSON(FILES.partners, []);
      const target = partners.find((p) => p.id === id);
      if (!target) return sendJSON(res, 404, { error: "Partner not found" });
      if (target.logoUrl) deleteUploadedImage(target.logoUrl);
      writeJSON(FILES.partners, partners.filter((p) => p.id !== id));
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- ADMIN: settings CMS ----------
    if (pathname === "/api/admin/settings" && req.method === "GET") {
      if (!requireAuth(req, res, ip)) return;
      return sendJSON(res, 200, readJSON(FILES.settings, {}));
    }
    if (pathname === "/api/admin/settings" && req.method === "PUT") {
      if (!requireAuth(req, res, ip)) return;
      if (!requireCSRFHeader(req, res)) return;
      const body = await readBody(req, 5e4);
      const current = readJSON(FILES.settings, {});

      // Distinguishes "this key wasn't sent at all — keep the existing
      // value" from "this key was sent as an empty string — the admin
      // genuinely wants to clear it" (e.g. removing a social link).
      // Falling back on every falsy value (the previous behavior) got
      // this backwards for some fields and right for others — this is
      // the one correct rule, applied uniformly everywhere below.
      const field = (val, fallback, maxLen) => (val !== undefined ? cleanText(val, maxLen) : fallback);

      const bodySocials = body.socials || {};
      const bodyPayment = body.payment || {};
      const currentSocials = current.socials || {};
      const currentPayment = current.payment || {};

      const next = {
        ...current,
        phone1: field(body.phone1, current.phone1, 30),
        phone2: field(body.phone2, current.phone2, 30),
        email: field(body.email, current.email, 100),
        whatsappNumber: field(body.whatsappNumber, current.whatsappNumber, 20),
        whatsappNumber2: field(body.whatsappNumber2, current.whatsappNumber2, 20),
        socials: {
          facebook: field(bodySocials.facebook, currentSocials.facebook, 300),
          instagram: field(bodySocials.instagram, currentSocials.instagram, 300),
          twitter: field(bodySocials.twitter, currentSocials.twitter, 300),
          linkedin: field(bodySocials.linkedin, currentSocials.linkedin, 300),
          tiktok: field(bodySocials.tiktok, currentSocials.tiktok, 300),
          youtube: field(bodySocials.youtube, currentSocials.youtube, 300),
        },
        payment: {
          mpesaTill: field(bodyPayment.mpesaTill, currentPayment.mpesaTill, 30),
          mpesaPaybill: field(bodyPayment.mpesaPaybill, currentPayment.mpesaPaybill, 30),
          mpesaAccount: field(bodyPayment.mpesaAccount, currentPayment.mpesaAccount, 30),
          chequePayable: field(bodyPayment.chequePayable, currentPayment.chequePayable || "The Hub Visionary", 100),
        },
        quoteValidityDays: body.quoteValidityDays !== undefined ? Number(body.quoteValidityDays) || current.quoteValidityDays || 14 : current.quoteValidityDays || 14,
        invoiceDueDays: body.invoiceDueDays !== undefined ? Number(body.invoiceDueDays) || current.invoiceDueDays || 7 : current.invoiceDueDays || 7,
      };
      writeJSON(FILES.settings, next);
      return sendJSON(res, 200, { ok: true, settings: next });
    }

    // ---------- everything else: static frontend (with SPA fallback) ----------
    if (req.method === "GET") {
      return serveStatic(req, res, pathname);
    }

    sendJSON(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`TheHubVisionary server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin  (user: ${process.env.ADMIN_USER || "admin"})`);
  if (!isEmailConfigured()) {
    console.log("Note: RESEND_API_KEY not set — quotes/invoices will generate but not auto-email. See README.");
  }
});
