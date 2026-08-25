# TheHubVisionary — Website (Frontend + Backend + Admin CMS)

A full-stack business website: services catalog with pricing, a booking
and quote/invoice system with real PDF generation, a case-studies page,
and a full admin panel that lets you edit almost everything — services,
pricing, partners, site settings — without touching code.

**One dependency**: [`pdf-lib`](https://pdf-lib.js.org/) (pure JavaScript,
no native build tools needed) — used to generate quote and invoice PDFs.
Run `npm install` once before starting the server.

---

## 1. Run it locally

```bash
npm install
node server.js
```

Then open `http://localhost:3000`. Admin panel is at
`http://localhost:3000/admin` (default login `admin` / `changeme` —
**change this before deploying**, see the environment variables section).

---

## 2. Deploying to Render, Railway, or a VPS

This app needs a **Node.js host with a persistent disk** — booking
submissions, generated quotes/invoices (including the PDF files
themselves), uploaded partner logos, and your services/settings edits
all need to survive a redeploy. Hosts that wipe the filesystem on
redeploy (some free tiers) will lose this otherwise. Render and Railway
both offer persistent disks/volumes; a VPS persists by default.

**Important — Render (and some other hosts) only allow ONE disk per
service.** To make that work, set the `STORAGE_DIR` environment
variable to your disk's mount path. When it's set, everything that
needs to persist — the data files *and* generated PDFs *and* uploaded
partner logos — automatically lives under that single directory
instead of being split across `/data` and `/public`. The first time
the app boots against a fresh disk, it seeds it with your real
services, counties, FAQ, and default settings automatically. Leave
`STORAGE_DIR` unset for local development and nothing changes — it
behaves exactly as it always has.

### Option A — Render (easiest)
1. Push this folder to a GitHub repo.
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install` — Start command: `node server.js`
4. Add **one Disk** (service settings → Disks) mounted at, for example,
   `/opt/render/project/src/storage` — any path outside your repo's own
   folders works, 1GB is plenty to start.
5. Add environment variables (see section 4 below), including
   `STORAGE_DIR=/opt/render/project/src/storage` (match whatever mount
   path you used in step 4).
6. Point your domain at the Render service (**Settings → Custom Domains**
   gives you the CNAME target).

### Option B — Railway
1. Push to GitHub, then **New Project → Deploy from GitHub repo**.
2. Railway auto-detects Node, runs `npm install` and `node server.js`.
3. Add a **Volume** mounted at, for example, `/app/storage`.
4. Add environment variables (section 4), including
   `STORAGE_DIR=/app/storage`.
5. Under **Settings → Domains**, add `thehubvisionary.com`.

### Option C — Your own VPS (DigitalOcean, Linode, etc.)
1. Install Node.js 18+.
2. Copy this folder to the server, then `npm install`.
3. A VPS's disk already persists by default, so `STORAGE_DIR` is
   optional here — only set it if you specifically want data kept
   somewhere outside the app folder (e.g. a separate backup-friendly
   mount).
4. Run it persistently:
   ```bash
   npm install -g pm2
   pm2 start server.js --name thehubvisionary
   pm2 save
   pm2 startup
   ```
4. Put Nginx in front as a reverse proxy on 80/443, `certbot` for HTTPS.
5. Point your domain's A record at the VPS's IP.

---

## 3. Pointing thehubvisionary.com

At your domain registrar:
- **Render/Railway:** add the CNAME record they give you for
  `thehubvisionary.com` and `www.thehubvisionary.com`.
- **VPS:** add an A record pointing `thehubvisionary.com` to the
  server's IP address.

DNS changes can take a few hours to propagate.

---

## 4. Environment variables

| Variable         | Purpose                                                    | Default    |
|-------------------|-------------------------------------------------------------|------------|
| `PORT`            | Port the server listens on (hosts usually set this automatically) | `3000` |
| `STORAGE_DIR`     | Path to your host's single persistent disk mount (see section 2). All data files, generated PDFs, and uploaded logos live under here when set. Leave unset for local dev. | *(unset — uses the repo's own `/data` and `/public`)* |
| `ADMIN_USER`      | Username for `/admin`                                      | `admin`    |
| `ADMIN_PASS`      | Password for `/admin` — **change before going live**       | `changeme` |
| `WEBHOOK_URL`     | Optional. Slack/Discord incoming webhook — pings you the moment a booking, message, or quote comes in. | *(none)* |
| `SMTP_USER`       | Optional (recommended). Your Google Workspace email address, e.g. `info@thehubvisionary.com` — enables automatic emailing of quotes/invoices from your own domain. | *(none)* |
| `SMTP_PASS`       | The Gmail **App Password** for that mailbox (not your normal login password — see setup steps below). | *(none)* |
| `SMTP_HOST`       | Optional override.                                         | `smtp.gmail.com` |
| `SMTP_PORT`       | Optional override.                                          | `465`      |
| `SMTP_FROM`       | Optional. Send *as* a different address than `SMTP_USER` (only works if your Workspace allows "send as" for that alias). | same as `SMTP_USER` |
| `RESEND_API_KEY`  | Alternative to SMTP — enables emailing via [Resend](https://resend.com) instead. Only used if `SMTP_USER`/`SMTP_PASS` aren't set. | *(none)* |
| `EMAIL_FROM`      | The "from" address used when `RESEND_API_KEY` is set. Must be on a domain verified in your Resend dashboard. | `TheHubVisionary <onboarding@resend.dev>` |
| `AT_USERNAME`     | Optional. Your [Africa's Talking](https://africastalking.com) username — enables SMS notifications to you whenever a booking or quote comes in. | *(none)* |
| `AT_API_KEY`      | Your Africa's Talking API key, from the same dashboard. | *(none)* |
| `AT_SENDER_ID`    | Optional. An approved sender ID/shortcode, if you have one. Without it, Africa's Talking uses a shared shortcode. | *(none)* |
| `ADMIN_NOTIFY_EMAIL` | Optional. Where booking/quote notification emails go. Defaults to the "email" address in your site Settings if unset. | *(uses site settings)* |
| `ADMIN_NOTIFY_PHONE` | Optional. Where booking/quote notification SMS go. Defaults to your site's primary phone number if unset. | *(uses site settings)* |

**Change `ADMIN_PASS` before going live** — the admin panel shows every
customer's phone number, address, and message, and can edit your entire
services catalog and pricing.

**To send quote/invoice emails from your own Google Workspace address**
(recommended, since TheHubVisionary already has Workspace):
1. Turn on 2-Step Verification for the sending mailbox (e.g.
   `info@thehubvisionary.com`) if it isn't already — required for the
   next step. In the Workspace Admin console or the account's own
   Google Account settings: **Security → 2-Step Verification**.
2. Generate an App Password: go to
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   while signed in as that mailbox, choose "Other", name it something
   like "TheHubVisionary Website", and copy the 16-character password
   it gives you.
3. Set `SMTP_USER` to the full email address and `SMTP_PASS` to that
   app password on your host. That's it — no third-party signup needed.

If you'd rather not send from your own mailbox, set `RESEND_API_KEY`
and `EMAIL_FROM` instead (sign up at resend.com, verify a sending
domain via the DNS records they give you).

---

## 5. What you can edit from the admin panel (no code required)

Log into `/admin` — beyond viewing bookings and messages, you can now:

- **Services** — add, edit, or delete any service, its category, tagline,
  description, and pricing tiers. Changes are live on the public site
  immediately.
- **Our Work** — add, edit, or delete the case studies shown on the
  public "Our Work" page. Keep entries anonymized ("Retail shop,
  Nairobi") unless you have a client's permission to name them.
- **FAQ** — add, edit, delete, and reorder the questions shown on the
  public FAQ page (move a question up/down with the arrows next to it).
- **Partners** — add or remove partners, including uploading a logo
  (PNG/JPEG, validated and capped at 2MB).
- **Settings** — phone numbers, email, social media links (hidden on the
  site until you fill them in — the footer picks up new links the next
  time someone navigates the site, no hard refresh needed), M-Pesa/
  cheque payment details, and how many days a quote stays valid / an
  invoice stays due.
- **Quotes** — see every PDF quote ever generated, with client details,
  total, and a direct download link.
- **Invoices** — create a new invoice (client details + line items),
  which generates a PDF immediately and lists it with a paid/unpaid/
  cancelled status toggle.
- **Overview** — bookings/messages/quotes/invoices at a glance, revenue
  collected vs outstanding, total quote pipeline value, a 6-month
  booking trend, and email delivery stats for quotes/invoices sent.

Everything above writes to the same JSON files described below — the
admin UI is just a friendlier way to edit them than opening the files
by hand, and it validates input the way the API does either way.

---

## 5b. Getting notified the moment a booking or quote comes in

Beyond checking `/admin`, you can be notified immediately by email
and/or SMS whenever someone books a callout or requests a quote — with
the client's name, phone, service, and the key details right in the
notification, so you often don't need to open the admin panel at all
unless you want the full picture.

**Email notifications** reuse whatever you've already set up for
sending quotes/invoices (`SMTP_USER`/`SMTP_PASS`, or `RESEND_API_KEY`)
— nothing extra to configure. They go to `ADMIN_NOTIFY_EMAIL` if you
set it, otherwise to the "email" address in your site Settings.

**SMS notifications** use [Africa's Talking](https://africastalking.com)
— the standard SMS gateway for Kenyan businesses (the same kind of
service your own "Bulk SMS Services" offering sets up for clients):

1. Sign up at africastalking.com, and in the dashboard go to **Settings
   → API Key** to generate one (this also shows your username, usually
   `sandbox` until you go live).
2. On your host, set `AT_USERNAME` and `AT_API_KEY` to those values.
3. Optionally set `AT_SENDER_ID` if you've registered a custom sender
   ID; otherwise messages come from a shared shortcode, which works
   fine to start.
4. SMS notifications go to `ADMIN_NOTIFY_PHONE` if set, otherwise your
   site's primary phone number.

Both channels are independent — set up just email, just SMS, or both.
Neither is required for the site to work; if nothing is configured,
notifications are simply skipped (you'd rely on `/admin` or the
Slack/Discord webhook below instead).

---

## 6. Editing content directly in files (the old-fashioned way)

Still works fine if you'd rather edit a file than use the admin UI:

- **Services & pricing** → `data/services.json`
- **Counties & distances** → `data/counties.json` (drives the callout
  fee calculation — see section 9)
- **Case studies / client work** → `data/clients.json`. These are
  anonymized placeholders — replace with real named clients (with their
  permission) and testimonials whenever you're ready.
- **Partners** → `data/partners.json` + logo files under
  `public/assets/partners/`
- **Site settings** (contact info, socials, payment details, document
  validity) → `data/settings.json`
- **FAQ** → `data/faq.json`
- **About / Terms / Privacy** → `public/js/app.js`
  (`renderAbout`, `renderTerms`, `renderPrivacy`). The Terms and Privacy
  pages are a starting template, not legal advice — have them reviewed
  by a lawyer before relying on them at real volume.
- **Logo** → `public/assets/`

---

## 7. Architecture — what's actually "backend" here

```
server.js          — route table only; wires everything below together
lib/
  store.js          — JSON file read/write (atomic writes), shared constants
  security.js       — Basic Auth, brute-force lockout, rate limiting,
                       input validation, security headers
  static.js         — static file server with SPA fallback
  fees.js           — the callout fee cost model (see section 9)
  pdf.js            — quote/invoice PDF layout engine (uses pdf-lib)
  documents.js       — quote/invoice numbering + PDF save + JSON log
  upload.js         — validated image upload for partner logos
  email.js          — optional Resend API email sending
  webhook.js        — optional Slack/Discord notifications
```

**Public API**: `/api/services`, `/api/services/:id`, `/api/clients`,
`/api/counties`, `/api/partners`, `/api/faq`, `/api/settings`,
`POST /api/bookings`, `POST /api/contact`, `POST /api/quote/generate`,
`/api/health`.

**Admin API** (HTTP Basic Auth + a CSRF header on every write — see
section 8): `/api/admin/bookings`, `/api/admin/contact`,
`/api/admin/stats`, `/api/admin/bookings.csv`, `/api/admin/contact.csv`,
`/api/admin/quotes`, `/api/admin/invoices` (GET + POST),
`PATCH .../bookings/:id`, `PATCH .../contact/:id`,
`PATCH .../invoices/:id`, full CRUD on `/api/admin/services/*`,
`/api/admin/clients/*`, and
`/api/admin/partners/*`, and `GET`/`PUT /api/admin/settings`.

Generated PDFs are served directly as static files at `/quotes/:id.pdf`
and `/invoices/:id.pdf` — no auth needed to download one, since the
client needs the link to work from a WhatsApp message or email without
logging in. The filenames are long random IDs (not sequential/guessable),
so nobody can browse or enumerate other people's documents.

---

## 8. Security notes

- **Basic Auth + brute-force lockout**: 12 wrong-password attempts from
  the same IP within 15 minutes locks that IP out for the rest of the
  window. Only *failed* attempts count — normal admin use (which fires
  many requests per page load) never trips this on its own.
- **CSRF protection on every admin write**: all `POST`/`PUT`/`PATCH`/
  `DELETE` requests to `/api/admin/*` must include the header
  `X-Thv-Admin: 1`. A plain cross-site `<form>` submission can't set
  custom headers, and a cross-origin `fetch()` with one triggers a CORS
  preflight this server never approves — so a malicious page can't
  trigger admin actions even if your browser has cached the login.
  `public/js/admin.js` sends this header automatically; you don't need
  to think about it unless you're calling the admin API from something
  else.
- **Upload validation**: partner logos are checked by real file-content
  magic bytes (not just trusting the claimed MIME type), capped at 2MB,
  and saved under a random filename — never the name the browser sent.
- **Input handling**: all stored text is trimmed and length-capped;
  HTML-escaping happens at render/CSV-export time (not at save time,
  which avoids double-escaping bugs), so raw data in `/data/*.json`
  stays human-readable if you ever open it directly.
- **Security headers** on every response: CSP (script-src limited to
  same-origin — every script lives in an external `.js` file for this
  reason), X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, and HSTS.
- **Rate limiting** on bookings, contact, and quote-generation endpoints
  independently of the admin lockout, to blunt basic spam/abuse.
- **Honeypot field** on public forms — bots that fill every field
  (including the hidden one) get silently dropped rather than stored.

None of this replaces running the site over HTTPS — Render, Railway, and
most managed hosts provide this automatically; on a bare VPS, get a
certificate via `certbot` before going live (see Option C above).

---

## 9. How the callout fee is calculated

Outside Nairobi, the fee isn't a guess — it's a documented cost model in
`lib/fees.js`:

1. **Fuel** — round-trip distance ÷ consumption × current pump price.
2. **Vehicle wear & tear** — a percentage on top of fuel (servicing,
   tyres, depreciation).
3. **Technician time-in-transit** — travel isn't billable repair time,
   but it isn't free either.
4. **Margin** — a profit margin on top of the above, so a callout is
   never priced at break-even.

Past roughly 550km, driving stops being realistic, so the model switches
to fixed remote-tier bands assuming flights and accommodation, finalized
on a scoping call rather than computed per km.

**Keep this current:**
- Fuel price is pinned to the EPRA Nairobi Super Petrol rate for the
  Aug–Sep 2026 pricing cycle. EPRA revises pump prices roughly monthly —
  check [epra.go.ke/pump-prices](https://www.epra.go.ke/pump-prices) and
  update `FUEL_PRICE_PER_LITRE` in `lib/fees.js` when it changes.
- `FUEL_CONSUMPTION_L_PER_100KM` is a planning estimate (10L/100km,
  mixed driving). Adjust it if your logged mileage differs, or if a
  different vehicle or public transport is used for some routes.
- The other constants (`WEAR_AND_TEAR_MULTIPLIER`,
  `TIME_IN_TRANSIT_KSH_PER_KM`, `CALLOUT_MARGIN_MULTIPLIER`) are yours
  to tune — they're a reasonable starting point, not a law of physics.

---

## 10. Quotes & invoices — how they actually work

- **Quotes** (`/api/quote/generate`, public): a client picks services on
  the "Get a PDF Quote" tab of the Book page. Any service with more than
  one pricing tier shows a "Scale of work" dropdown (small/mid/large-scale
  style options — whatever tiers you've set up in `data/services.json`)
  so the estimate reflects the right size of job. There's also a free-text
  box for the client to describe what they need, which flows into the
  PDF's notes.
  **Quotes are deliberately estimates, not final bills** — each line
  item's price comes from the tier's own stated range (e.g.
  "KSh 8,000 – 15,000"), the PDF is clearly labeled "ESTIMATED TOTAL"
  with an amber banner explaining that a final figure follows once scope
  is agreed, and the callout fee (if a county was picked) is included the
  same way. The PDF has your logo, a timestamp, their details, your
  payment details, and an expiry date (`quoteValidityDays` in settings,
  default 14). They get an immediate download link, a "Share via
  WhatsApp" button (native share sheet with the actual PDF file on
  supported mobile browsers, or a WhatsApp link with the PDF URL as a
  fallback), and an automatic email if they gave an address and
  `RESEND_API_KEY` is configured.
- **Invoices** (`/api/admin/invoices`, admin-only): you fill in client
  details and exact line-item amounts in the admin panel for completed
  work — these are **not** estimates, since the job is done and the
  price is final. Same PDF layout, but a plain "TOTAL" (no range, no
  estimate banner), a due date instead of an expiry, and a
  paid/unpaid/cancelled status you can update as payments come in.
- Every quote and invoice PDF has your logo watermarked large, centered,
  and semi-transparent in the page background — visible, but never
  fights with the text on top of it. Adjust `WATERMARK_OPACITY` in
  `lib/pdf.js` if you want it more or less subtle.
- Every quote and invoice is logged (`data/quotes.json` /
  `data/invoices.json`) and visible in its own admin tab.

---

## 10b. A note on scroll-reveal & the admin logo

The public site now fades each major section in as you scroll to it
(respects `prefers-reduced-motion` for anyone with that OS setting on).
This is generic — it applies to every page automatically, no per-page
markup needed — so if you add a new page via `public/js/app.js`, it
gets the same treatment for free. The admin panel header now shows your
actual logo instead of plain text.

---

## 11. A note on service pricing and third-party costs

Several services (hardware repair, CCTV, network setup, cloud services,
web/app/POS/CRM builds) explicitly state that parts, hardware, or
third-party software/subscription costs are billed separately at cost,
not bundled into the labour price shown. This matters for margin — a
camera install quoted at a labour-only rate loses money the moment the
camera hardware is assumed included. Keep this pattern for any new
service involving physical parts or paid software.

---

## 12. A note on scale

The JSON-file storage is intentionally simple so this deploys anywhere
with minimal setup. If volume grows to the point where you want proper
reporting, concurrent multi-staff editing, or search across thousands of
records, the natural next step is swapping the JSON files for a real
database (e.g. PostgreSQL) — the `lib/store.js` module is the only place
that would need to change; the rest of the app talks to it through a
small, consistent interface.
