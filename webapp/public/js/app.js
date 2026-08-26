(function () {
  "use strict";

  const app = document.getElementById("app");
  const navlinks = document.getElementById("navlinks");
  const navToggle = document.getElementById("navToggle");

  navToggle.addEventListener("click", () => navlinks.classList.toggle("open"));

  const WA_NUMBER = "254722910004";
  const WA_NUMBER_2 = "254720080004";

  let SERVICES = [];
  let CLIENTS = [];
  let COUNTIES = [];
  let PARTNERS = [];
  let servicesLoaded = false;
  let clientsLoaded = false;
  let countiesLoaded = false;
  let partnersLoaded = false;

  // ---------- data fetching ----------

  async function loadServices() {
    if (servicesLoaded) return SERVICES;
    const res = await fetch("/api/services");
    SERVICES = await res.json();
    servicesLoaded = true;
    return SERVICES;
  }

  async function loadClients() {
    if (clientsLoaded) return CLIENTS;
    const res = await fetch("/api/clients");
    CLIENTS = await res.json();
    clientsLoaded = true;
    return CLIENTS;
  }

  async function loadCounties() {
    if (countiesLoaded) return COUNTIES;
    const res = await fetch("/api/counties");
    COUNTIES = await res.json();
    countiesLoaded = true;
    return COUNTIES;
  }

  async function loadPartners() {
    if (partnersLoaded) return PARTNERS;
    const res = await fetch("/api/partners");
    PARTNERS = await res.json();
    partnersLoaded = true;
    return PARTNERS;
  }

  // ---------- helpers ----------

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  /**
   * Generic "fade + rise" reveal for every top-level section on the
   * current page — applied automatically after each route render, no
   * per-page markup needed. The first section (the hero) shows instantly;
   * everything below animates in as the visitor scrolls to it.
   */
  function initScrollReveal() {
    const sections = document.querySelectorAll("#app > header, #app > section");
    sections.forEach((el, i) => {
      el.classList.add("reveal-target");
      if (i === 0) {
        requestAnimationFrame(() => el.classList.add("reveal-visible"));
      } else {
        revealObserver.observe(el);
      }
    });
  }
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -60px 0px" }
  );


  function groupByCategory(services) {
    const order = ["Fix & Support", "Build & Grow", "Scale & Secure", "Enterprise & Scale"];
    const groups = {};
    order.forEach((c) => (groups[c] = []));
    services.forEach((s) => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    return order.filter((c) => groups[c].length).map((c) => [c, groups[c]]);
  }

  function serviceCard(s) {
    const fromPrice = s.pricing && s.pricing[0] ? s.pricing[0].price : "";
    const style = resolvePreviewStyle(s);
    return `
      <button class="svc-card" data-open-service="${esc(s.id)}">
        <div class="svc-card-media">
          <span class="svc-card-num">${esc(s.icon)}</span>
          ${previewMock(style)}
        </div>
        <div class="svc-card-body">
          <h3>${esc(s.name)}</h3>
          <p>${esc(s.tagline)}</p>
          ${fromPrice ? `<div class="from">From ${esc(fromPrice)}</div>` : ""}
          <span class="arrow">View details &amp; pricing &rarr;</span>
        </div>
      </button>
    `;
  }

  function openServiceModal(id) {
    const s = SERVICES.find((x) => x.id === id);
    if (!s) return;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <button class="modal-close" aria-label="Close">&times;</button>
        <div class="cat-pill">${esc(s.category)}</div>
        <h2>${esc(s.name)}</h2>
        <div class="tagline">${esc(s.tagline)}</div>
        <div class="desc">${esc(s.description)}</div>
        <div class="modal-table-scroll">
          <table>
            <colgroup>
              <col class="col-option"><col class="col-detail"><col class="col-price">
            </colgroup>
            <thead><tr><th>Option</th><th>Details</th><th>Price</th></tr></thead>
            <tbody>
              ${(s.pricing || [])
                .map(
                  (p) => `<tr>
                    <td>${esc(p.label)}</td>
                    <td class="detail">${esc(p.detail)}</td>
                    <td class="price">${esc(p.price)}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <a href="#/book?service=${encodeURIComponent(s.id)}" class="btn btn-primary" style="width:100%; justify-content:center;">Book this service &rarr;</a>
      </div>
    `;
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";

    function close() {
      backdrop.remove();
      document.body.style.overflow = "";
    }
    backdrop.querySelector(".modal-close").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector('a[href^="#/book"]').addEventListener("click", close);
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onEsc);
      }
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-service]");
    if (btn) openServiceModal(btn.getAttribute("data-open-service"));
    const previewBtn = e.target.closest("[data-open-preview]");
    if (previewBtn) openLivePreviewModal(previewBtn.getAttribute("data-open-preview"));
  });

  // ---------- floating WhatsApp popover (custom message) ----------

  (function initWaWidget() {
    const floatBtn = document.getElementById("waFloatBtn");
    const popover = document.getElementById("waPopover");
    const closeBtn = document.getElementById("waPopoverClose");
    const sendBtn = document.getElementById("waSendBtn");
    const textarea = document.getElementById("waMessage");
    if (!floatBtn) return;

    floatBtn.addEventListener("click", () => {
      const open = popover.classList.toggle("open");
      if (open) textarea.focus();
    });
    closeBtn.addEventListener("click", () => popover.classList.remove("open"));
    document.addEventListener("click", (e) => {
      if (!document.getElementById("waWidget").contains(e.target)) popover.classList.remove("open");
    });
    sendBtn.addEventListener("click", () => {
      const text = textarea.value.trim() || "Hi TheHubVisionary, I'd like to enquire about a service.";
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      popover.classList.remove("open");
      textarea.value = "";
    });
  })();

  // ---------- social icons in footer (only shown when a URL is set) ----------

  const SOCIAL_ICONS = {
    facebook: '<path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z"/>',
    instagram:
      '<path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 2 .3 2.4.5.6.2 1 .5 1.5 1 .4.4.7.9 1 1.5.2.5.4 1.2.5 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 2-.5 2.4-.2.6-.5 1-1 1.5-.4.4-.9.7-1.5 1-.5.2-1.2.4-2.4.5-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-2-.3-2.4-.5-.6-.2-1-.5-1.5-1-.4-.4-.7-.9-1-1.5-.2-.5-.4-1.2-.5-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-2 .5-2.4.2-.6.5-1 1-1.5.4-.4.9-.7 1.5-1 .5-.2 1.2-.4 2.4-.5C8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7 .1c-1.3.1-2.2.3-3 .6-.8.3-1.5.8-2.2 1.4C1.1 2.8.6 3.5.3 4.3c-.3.8-.5 1.7-.6 3C-.4 8.7-.4 9.1-.4 12.4s0 3.7.1 5c.1 1.3.3 2.2.6 3 .3.8.8 1.5 1.4 2.2.6.6 1.3 1.1 2.2 1.4.8.3 1.7.5 3 .6 1.3.1 1.7.1 5 .1s3.7 0 5-.1c1.3-.1 2.2-.3 3-.6.8-.3 1.5-.8 2.2-1.4.6-.6 1.1-1.3 1.4-2.2.3-.8.5-1.7.6-3 .1-1.3.1-1.7.1-5s0-3.7-.1-5c-.1-1.3-.3-2.2-.6-3-.3-.8-.8-1.5-1.4-2.2C21.2.8 20.5.3 19.7 0c-.8-.3-1.7-.5-3-.6C15.4 0 15 0 12 0z"/><path d="M12 5.8A6.2 6.2 0 1012 18.2 6.2 6.2 0 0012 5.8zm0 10.2a4 4 0 110-8 4 4 0 010 8zM18.4 5.6a1.4 1.4 0 11-2.8 0 1.4 1.4 0 012.8 0z"/>',
    twitter:
      '<path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.6L4.5 22H1.4l8.1-9.3L1 2h7l4.9 6.1L18.9 2zm-1.2 18h1.7L6.5 4H4.6l13.1 16z"/>',
    linkedin:
      '<path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM.5 8.75h4.5V23H.5V8.75zm7.5 0h4.3v1.95h.06c.6-1.1 2.05-2.26 4.22-2.26 4.51 0 5.34 2.86 5.34 6.58V23h-4.5v-6.7c0-1.6-.03-3.65-2.22-3.65-2.23 0-2.57 1.73-2.57 3.53V23h-4.5V8.75z"/>',
    tiktok:
      '<path d="M16.6 5.1c-1-.9-1.6-2.1-1.6-3.5h-3.3v14.2c0 1.6-1.3 2.9-2.9 2.9a2.9 2.9 0 01-2.9-2.9 2.9 2.9 0 012.9-2.9c.3 0 .6 0 .9.1V9.6c-.3 0-.6-.1-.9-.1-3.5 0-6.3 2.8-6.3 6.3S5.3 22 8.8 22s6.3-2.8 6.3-6.3V8.9c1.3.9 2.9 1.5 4.6 1.5V7.1c-1.1 0-2.2-.4-3.1-1z"/>',
    youtube:
      '<path d="M23.5 6.2s-.2-1.6-.9-2.4c-.9-1-1.9-1-2.3-1.1C17.3 2.5 12 2.5 12 2.5h0s-5.3 0-8.3.2c-.4 0-1.4.1-2.3 1.1-.7.8-.9 2.4-.9 2.4S.2 8.1.2 10v1.9c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.4c.9 1 2.1.9 2.6 1.1 1.9.2 8.1.2 8.1.2s5.3 0 8.3-.2c.4 0 1.4-.1 2.3-1.1.7-.8.9-2.4.9-2.4s.2-1.9.2-3.8V10c0-1.9-.2-3.8-.2-3.8zM9.7 14.1V7.5l6.4 3.3-6.4 3.3z"/>',
  };

  async function renderSocialIcons() {
    try {
      const res = await fetch("/api/settings");
      const settings = await res.json();
      const socials = settings.socials || {};
      const row = document.getElementById("socialRow");
      if (!row) return;
      const links = Object.entries(socials).filter(([, url]) => url);
      if (!links.length) return;
      row.innerHTML = links
        .map(
          ([key, url]) => `
        <a href="${esc(url)}" target="_blank" rel="noopener" class="social-icon" aria-label="${esc(key)}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${SOCIAL_ICONS[key] || ""}</svg>
        </a>
      `
        )
        .join("");
    } catch (e) {
      // settings unreachable — footer just shows without social icons
    }
  }

  // ---------- shared fragments ----------

  /**
   * Small brand illustrations for non-home pages, built from the same
   * navy/sky/amber palette and line-based "network" style already used in
   * the hero's boot sequence and grid background — no stock photography,
   * so nothing to license and everything matches automatically.
   */
  function illustrationHub() {
    return `
      <svg class="page-illustration" viewBox="0 0 520 220" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g opacity="0.5">
          <line x1="260" y1="110" x2="90" y2="45" stroke="#38BDF8" stroke-width="1.5"/>
          <line x1="260" y1="110" x2="90" y2="175" stroke="#38BDF8" stroke-width="1.5"/>
          <line x1="260" y1="110" x2="260" y2="30" stroke="#38BDF8" stroke-width="1.5"/>
          <line x1="260" y1="110" x2="430" y2="45" stroke="#38BDF8" stroke-width="1.5"/>
          <line x1="260" y1="110" x2="430" y2="175" stroke="#38BDF8" stroke-width="1.5"/>
          <line x1="260" y1="110" x2="260" y2="190" stroke="#38BDF8" stroke-width="1.5"/>
        </g>
        <circle cx="90" cy="45" r="11" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="90" cy="175" r="11" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="260" cy="30" r="11" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="430" cy="45" r="11" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="430" cy="175" r="11" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="260" cy="190" r="11" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="260" cy="110" r="30" fill="#FF7A33"/>
        <circle cx="260" cy="110" r="30" fill="none" stroke="#0A1F3D" stroke-width="1" opacity="0.15"/>
      </svg>
    `;
  }

  /**
   * Same grid-of-cells illustration as before, but each cell now loops a
   * subtle highlight animation on a staggered delay — reads as a slow
   * diagonal scan drifting across the grid rather than a static pattern.
   */
  function illustrationDiagnostic() {
    const cells = [];
    const cols = 10;
    const rows = 3;
    const gap = 10;
    const size = 34;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * (size + gap);
        const y = r * (size + gap);
        const delay = ((c * 0.22 + r * 0.6) % 3.6).toFixed(2);
        cells.push(`<rect class="diag-cell" x="${x}" y="${y}" width="${size}" height="${size}" rx="6" style="animation-delay:${delay}s"/>`);
      }
    }
    return `
      <svg class="page-illustration diag-illustration" viewBox="0 0 476 132" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        ${cells.join("")}
      </svg>
    `;
  }

  // ---------- "Our Work" live service preview mockups ----------
  // Keep PREVIEW_STYLES in sync with server.js's PREVIEW_STYLES allowlist
  // and the <select id="svc-preview-style"> options in admin.html — admins
  // pick one of these per service in the Services CMS; "auto" (or an
  // unrecognized/missing value) falls back to the maps below.
  const PREVIEW_STYLES = [
    "browser", "app", "dashboard", "crm", "terminal", "network",
    "camera", "receipt", "chat", "cloud", "diagnostic", "recovery",
    "checklist", "enterprise",
  ];
  const DEFAULT_PREVIEW_STYLE_BY_ID = {
    "hardware-repair": "diagnostic",
    "managed-it": "dashboard",
    "data-recovery": "recovery",
    "software-install": "checklist",
    "websites": "browser",
    "web-apps": "app",
    "pos-systems": "receipt",
    "crm-systems": "crm",
    "bulk-sms": "chat",
    "cloud-services": "cloud",
    "server-management": "terminal",
    "network-security": "network",
    "network-management": "network",
    "cctv": "camera",
    "enterprise-systems": "enterprise",
  };
  const DEFAULT_PREVIEW_STYLE_BY_CATEGORY = {
    "Fix & Support": "diagnostic",
    "Build & Grow": "browser",
    "Scale & Secure": "network",
    "Enterprise & Scale": "enterprise",
  };

  function resolvePreviewStyle(s) {
    if (s.previewStyle && PREVIEW_STYLES.includes(s.previewStyle)) return s.previewStyle;
    return DEFAULT_PREVIEW_STYLE_BY_ID[s.id] || DEFAULT_PREVIEW_STYLE_BY_CATEGORY[s.category] || "browser";
  }

  function previewMockSvg(kind) {
    if (kind === "network") {
      return `
        <svg class="mock-svg" viewBox="0 0 160 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <line x1="80" y1="55" x2="24" y2="20" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <line x1="80" y1="55" x2="24" y2="90" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <line x1="80" y1="55" x2="136" y2="20" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <line x1="80" y1="55" x2="136" y2="90" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <circle cx="24" cy="20" r="7" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
          <circle cx="24" cy="90" r="7" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
          <circle cx="136" cy="20" r="7" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
          <circle cx="136" cy="90" r="7" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
          <circle cx="80" cy="55" r="16" fill="#FF7A33"/>
        </svg>`;
    }
    if (kind === "cloud") {
      return `
        <svg class="mock-svg" viewBox="0 0 160 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M45 72a19 19 0 0 1-3-37.7A25 25 0 0 1 89 25a21 21 0 0 1 25 27 17 17 0 0 1-3 33H45Z" fill="#0A1F3D" opacity="0.07" stroke="#38BDF8" stroke-width="1.5"/>
          <path d="M80 44v22m0 0-9-9m9 9 9-9" stroke="#FF7A33" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }
    if (kind === "enterprise") {
      return `
        <svg class="mock-svg" viewBox="0 0 160 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <line x1="80" y1="24" x2="30" y2="58" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <line x1="80" y1="24" x2="80" y2="58" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <line x1="80" y1="24" x2="130" y2="58" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <line x1="30" y1="58" x2="30" y2="88" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <line x1="80" y1="58" x2="80" y2="88" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <line x1="130" y1="58" x2="130" y2="88" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
          <circle cx="80" cy="24" r="10" fill="#FF7A33"/>
          <circle cx="30" cy="58" r="7" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
          <circle cx="80" cy="58" r="7" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
          <circle cx="130" cy="58" r="7" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
          <rect x="22" y="84" width="16" height="10" rx="2" fill="#38BDF8" opacity="0.6"/>
          <rect x="72" y="84" width="16" height="10" rx="2" fill="#38BDF8" opacity="0.6"/>
          <rect x="122" y="84" width="16" height="10" rx="2" fill="#38BDF8" opacity="0.6"/>
        </svg>`;
    }
    return "";
  }

  function previewMock(kind) {
    switch (kind) {
      case "browser":
        return `
          <div class="mock mock-browser">
            <div class="mb-bar"><span></span><span></span><span></span><div class="mb-url"></div></div>
            <div class="mb-hero"></div>
            <div class="mb-line w1"></div><div class="mb-line w2"></div>
            <div class="mb-btn"></div>
          </div>`;
      case "app":
        return `
          <div class="mock mock-app">
            <div class="ma-bar"></div>
            <div class="ma-row"><span class="ma-ic"></span><div class="ma-lines"><div class="ma-line w1"></div><div class="ma-line w2"></div></div></div>
            <div class="ma-row"><span class="ma-ic"></span><div class="ma-lines"><div class="ma-line w1"></div><div class="ma-line w2"></div></div></div>
            <div class="ma-row"><span class="ma-ic"></span><div class="ma-lines"><div class="ma-line w1"></div><div class="ma-line w2"></div></div></div>
            <div class="ma-nav"><span></span><span class="on"></span><span></span></div>
          </div>`;
      case "dashboard":
        return `
          <div class="mock mock-dash">
            <div class="md-stats"><div class="md-stat"></div><div class="md-stat"></div><div class="md-stat"></div></div>
            <div class="md-bars"><span style="height:40%"></span><span style="height:72%"></span><span style="height:55%"></span><span style="height:85%"></span><span style="height:62%"></span></div>
          </div>`;
      case "crm":
        return `
          <div class="mock mock-crm">
            <div class="mc-col"><div class="mc-card"></div><div class="mc-card"></div></div>
            <div class="mc-col"><div class="mc-card"></div></div>
            <div class="mc-col"><div class="mc-card"></div><div class="mc-card"></div><div class="mc-card"></div></div>
          </div>`;
      case "terminal":
        return `
          <div class="mock mock-term">
            <div class="mt-line w1"></div><div class="mt-line w2"></div><div class="mt-line w3"></div>
            <div class="mt-ok">&check; deployed</div>
          </div>`;
      case "camera":
        return `
          <div class="mock mock-cam">
            <div class="mcam-tile"><span class="rec"></span></div>
            <div class="mcam-tile"><span class="rec"></span></div>
            <div class="mcam-tile"><span class="rec"></span></div>
            <div class="mcam-tile"><span class="rec"></span></div>
          </div>`;
      case "receipt":
        return `
          <div class="mock mock-receipt">
            <div class="mr-line w1"></div><div class="mr-line w2"></div><div class="mr-line w1"></div>
            <div class="mr-total">TOTAL</div>
          </div>`;
      case "chat":
        return `
          <div class="mock mock-chat">
            <div class="mch-bubble">Reminder: appt tomorrow 10am</div>
            <div class="mch-bubble">Your invoice is ready</div>
            <div class="mch-sent">&check; Sent to 248 contacts</div>
          </div>`;
      case "diagnostic":
        return `
          <div class="mock mock-diag">
            <div class="mdg-screen"><div class="mdg-ring"></div></div>
            <div class="mdg-checks"><span>&check; Power</span><span>&check; RAM</span><span>&hellip; Boot</span></div>
          </div>`;
      case "recovery":
        return `
          <div class="mock mock-recov">
            <div class="mrv-drive"></div>
            <div class="mrv-bar"><span style="width:72%"></span></div>
            <div class="mrv-label">Recovering files&hellip; 72%</div>
          </div>`;
      case "checklist":
        return `
          <div class="mock mock-checklist">
            <div class="mcl-row done">OS installed</div>
            <div class="mcl-row done">Drivers configured</div>
            <div class="mcl-row">Office suite</div>
          </div>`;
      default:
        return `<div class="mock mock-svg-wrap">${previewMockSvg(kind)}</div>`;
    }
  }

  function previewCard(s) {
    const style = resolvePreviewStyle(s);
    const bookUrl = `#/book?service=${encodeURIComponent(s.id)}&tab=book`;
    const quoteUrl = `#/book?service=${encodeURIComponent(s.id)}&tab=quote`;
    return `
      <div class="preview-card">
        <div class="preview-mock-wrap" data-open-preview="${esc(s.id)}">
          ${previewMock(style)}
          <div class="preview-mock-hint">Click for a bigger live preview &rarr;</div>
        </div>
        <div class="preview-body">
          <h4>${esc(s.name)}</h4>
          <p>${esc(s.tagline)}</p>
          <div class="preview-actions">
            <a href="${bookUrl}" class="btn-mini btn-mini-primary">Book a callout</a>
            <a href="${quoteUrl}" class="btn-mini">Get a quote</a>
          </div>
          <button type="button" class="preview-detail-link" data-open-service="${esc(s.id)}">View full pricing &rarr;</button>
        </div>
      </div>
    `;
  }

  // ---------- detailed, full-size live previews (bigger modal view) ----------
  // A handful of the most "product-shaped" services get a bespoke, richer
  // mockup here so a potential client gets a real sense of the actual
  // screens involved, not just the small teaser tile. Every other style
  // falls back to its teaser mock, scaled up, so nothing is left blank.
  function detailedBrowserMock() {
    return `
      <div class="lp-browser">
        <div class="lpb-chrome"><span></span><span></span><span></span><div class="lpb-url">yourbusiness.co.ke</div></div>
        <div class="lpb-nav">
          <div class="lpb-logo"></div>
          <div class="lpb-links"><span>Home</span><span>Services</span><span>About</span><span>Contact</span></div>
          <div class="lpb-cta">Book Now</div>
        </div>
        <div class="lpb-hero">
          <div class="lpb-hero-text">
            <div class="lpb-h1"></div>
            <div class="lpb-h1 w2"></div>
            <div class="lpb-sub"></div>
            <div class="lpb-btns"><span class="a"></span><span class="b"></span></div>
          </div>
          <div class="lpb-hero-art"></div>
        </div>
        <div class="lpb-features">
          <div class="lpb-feat"><span class="ic"></span><div class="lpb-line"></div><div class="lpb-line w2"></div></div>
          <div class="lpb-feat"><span class="ic"></span><div class="lpb-line"></div><div class="lpb-line w2"></div></div>
          <div class="lpb-feat"><span class="ic"></span><div class="lpb-line"></div><div class="lpb-line w2"></div></div>
        </div>
      </div>`;
  }

  function detailedAppMock() {
    return `
      <div class="lp-app">
        <div class="lpa-phone">
          <div class="lpa-status"><span></span><span></span></div>
          <div class="lpa-topbar">Bookings</div>
          <div class="lpa-stats">
            <div class="lpa-stat"><b>12</b><small>Today</small></div>
            <div class="lpa-stat"><b>3</b><small>Pending</small></div>
            <div class="lpa-stat"><b>98%</b><small>On time</small></div>
          </div>
          <div class="lpa-list">
            <div class="lpa-row"><span class="avatar"></span><div class="lines"><div class="l1"></div><div class="l2"></div></div><span class="tag ok">Done</span></div>
            <div class="lpa-row"><span class="avatar"></span><div class="lines"><div class="l1"></div><div class="l2"></div></div><span class="tag pending">Pending</span></div>
            <div class="lpa-row"><span class="avatar"></span><div class="lines"><div class="l1"></div><div class="l2"></div></div><span class="tag ok">Done</span></div>
          </div>
          <div class="lpa-fab-row"><div class="lpa-fab">+</div></div>
          <div class="lpa-tabbar"><span></span><span class="on"></span><span></span><span></span></div>
        </div>
      </div>`;
  }

  function detailedCrmMock() {
    return `
      <div class="lp-crm">
        <div class="lpc-toolbar"><div class="lpc-search">Search contacts&hellip;</div><div class="lpc-add">+ Add lead</div></div>
        <div class="lpc-board">
          <div class="lpc-col">
            <div class="lpc-col-head">New leads <span>4</span></div>
            <div class="lpc-card"><div class="lpc-avatar">JN</div><div class="lpc-line"></div><div class="lpc-amt">KSh 40,000</div></div>
            <div class="lpc-card"><div class="lpc-avatar">MW</div><div class="lpc-line"></div><div class="lpc-amt">KSh 15,000</div></div>
          </div>
          <div class="lpc-col">
            <div class="lpc-col-head">Contacted <span>2</span></div>
            <div class="lpc-card"><div class="lpc-avatar">SK</div><div class="lpc-line"></div><div class="lpc-amt">KSh 90,000</div></div>
          </div>
          <div class="lpc-col">
            <div class="lpc-col-head">Won <span>1</span></div>
            <div class="lpc-card done"><div class="lpc-avatar">RT</div><div class="lpc-line"></div><div class="lpc-amt">KSh 120,000</div></div>
          </div>
        </div>
      </div>`;
  }

  function detailedPosMock() {
    return `
      <div class="lp-pos">
        <div class="lpp-products">
          <div class="lpp-tabs"><span class="on">Drinks</span><span>Food</span><span>Other</span></div>
          <div class="lpp-grid">
            <div class="lpp-item"><span class="ic"></span>Soda<b>KSh 60</b></div>
            <div class="lpp-item"><span class="ic"></span>Water<b>KSh 50</b></div>
            <div class="lpp-item"><span class="ic"></span>Chips<b>KSh 150</b></div>
            <div class="lpp-item"><span class="ic"></span>Chapati<b>KSh 30</b></div>
            <div class="lpp-item"><span class="ic"></span>Tea<b>KSh 40</b></div>
            <div class="lpp-item"><span class="ic"></span>Combo<b>KSh 250</b></div>
          </div>
        </div>
        <div class="lpp-cart">
          <div class="lpp-cart-row"><span>Soda &times;2</span><span>KSh 120</span></div>
          <div class="lpp-cart-row"><span>Chapati &times;4</span><span>KSh 120</span></div>
          <div class="lpp-cart-row"><span>Combo &times;1</span><span>KSh 250</span></div>
          <div class="lpp-total-row"><span>Total</span><span>KSh 490</span></div>
          <div class="lpp-pay">Charge KSh 490</div>
        </div>
      </div>`;
  }

  function detailedDashboardMock() {
    return `
      <div class="lp-dash-full">
        <div class="lpd-top"><b>Support Dashboard</b><span class="lpd-status">&bull; All systems healthy</span></div>
        <div class="lpd-stats">
          <div class="lpd-stat"><b>7</b><small>Open tickets</small></div>
          <div class="lpd-stat"><b>42</b><small>Devices monitored</small></div>
          <div class="lpd-stat"><b>99.8%</b><small>Uptime</small></div>
          <div class="lpd-stat"><b>18m</b><small>Avg response</small></div>
        </div>
        <div class="lpd-table">
          <div class="lpd-row head"><span>Device</span><span>Issue</span><span>Status</span></div>
          <div class="lpd-row"><span>Reception PC</span><span>Slow startup</span><span class="tag pending">In progress</span></div>
          <div class="lpd-row"><span>Office Router</span><span>Firmware update</span><span class="tag ok">Resolved</span></div>
          <div class="lpd-row"><span>POS Terminal 2</span><span>Printer offline</span><span class="tag new">New</span></div>
        </div>
      </div>`;
  }

  function detailedNetworkMock() {
    return `
      <svg class="lp-network-svg" viewBox="0 0 640 260" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="320" y1="50" x2="180" y2="140" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
        <line x1="320" y1="50" x2="460" y2="140" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
        <line x1="180" y1="140" x2="90" y2="220" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
        <line x1="180" y1="140" x2="230" y2="220" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
        <line x1="460" y1="140" x2="410" y2="220" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
        <line x1="460" y1="140" x2="550" y2="220" stroke="#38BDF8" stroke-width="1.5" opacity="0.5"/>
        <circle cx="320" cy="50" r="20" fill="#FF7A33"/>
        <text x="320" y="55" text-anchor="middle" font-size="11" font-family="IBM Plex Mono, monospace" fill="#0A1F3D">RTR</text>
        <circle cx="180" cy="140" r="14" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="460" cy="140" r="14" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="90" cy="220" r="10" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="230" cy="220" r="10" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="410" cy="220" r="10" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="550" cy="220" r="10" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <text x="180" y="118" text-anchor="middle" font-size="10" font-family="IBM Plex Mono, monospace" fill="#B9C6DA">Switch A</text>
        <text x="460" y="118" text-anchor="middle" font-size="10" font-family="IBM Plex Mono, monospace" fill="#B9C6DA">Switch B</text>
        <text x="90" y="245" text-anchor="middle" font-size="9.5" font-family="IBM Plex Mono, monospace" fill="#B9C6DA">Office</text>
        <text x="230" y="245" text-anchor="middle" font-size="9.5" font-family="IBM Plex Mono, monospace" fill="#B9C6DA">Guest Wi-Fi</text>
        <text x="410" y="245" text-anchor="middle" font-size="9.5" font-family="IBM Plex Mono, monospace" fill="#B9C6DA">Reception</text>
        <text x="550" y="245" text-anchor="middle" font-size="9.5" font-family="IBM Plex Mono, monospace" fill="#B9C6DA">CCTV</text>
      </svg>`;
  }

  function detailedCloudMock() {
    return `
      <div class="lp-cloud">
        <svg class="lp-cloud-svg" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M55 84a22 22 0 0 1-4-43.6A29 29 0 0 1 106 29a25 25 0 0 1 29 32 20 20 0 0 1-4 39H55Z" fill="#0A1F3D" opacity="0.06" stroke="#38BDF8" stroke-width="1.5"/>
          <path d="M100 50v28m0 0-10-10m10 10 10-10" stroke="#FF7A33" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="lpcl-chips"><span>Gmail &rarr; Workspace</span><span>Files &rarr; Drive</span><span>Auto backup</span></div>
        <div class="lpcl-progress"><div class="lpcl-bar"><span style="width:80%"></span></div><small>Migrating 12 of 15 mailboxes&hellip;</small></div>
      </div>`;
  }

  function detailedCameraMock() {
    const labels = ["Entrance", "Till Area", "Stock Room", "Parking"];
    return `
      <div class="lp-cam-full">
        <div class="lpcam-grid-full">
          ${labels
            .map(
              (label, i) => `
            <div class="lpcam-tile-full">
              <span class="live">&bull; LIVE</span>
              <span class="label">${label}</span>
              ${i === 1 ? '<span class="motion">Motion detected</span>' : ""}
            </div>
          `
            )
            .join("")}
        </div>
      </div>`;
  }

  function detailedPreviewMock(style) {
    switch (style) {
      case "browser":
        return detailedBrowserMock();
      case "app":
        return detailedAppMock();
      case "crm":
        return detailedCrmMock();
      case "receipt":
        return detailedPosMock();
      case "dashboard":
        return detailedDashboardMock();
      case "network":
        return detailedNetworkMock();
      case "cloud":
        return detailedCloudMock();
      case "camera":
        return detailedCameraMock();
      default:
        return `<div class="lp-stage-simple">${previewMock(style)}</div>`;
    }
  }

  function openLivePreviewModal(id) {
    const s = SERVICES.find((x) => x.id === id);
    if (!s) return;
    const style = resolvePreviewStyle(s);
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal modal-lg" role="dialog" aria-modal="true">
        <button class="modal-close" aria-label="Close">&times;</button>
        <div class="cat-pill">${esc(s.category)}</div>
        <h2>${esc(s.name)}</h2>
        <div class="tagline">${esc(s.tagline)}</div>
        <div class="lp-stage">${detailedPreviewMock(style)}</div>
        <div class="lp-note">Illustrative preview &mdash; the real result is scoped and built around your business.</div>
        <div class="lp-modal-actions">
          <a href="#/book?service=${encodeURIComponent(s.id)}&tab=book" class="btn btn-primary">Book this service &rarr;</a>
          <a href="#/book?service=${encodeURIComponent(s.id)}&tab=quote" class="btn btn-ghost-light">Get a quote</a>
          <button type="button" class="lp-pricing-link" data-open-service="${esc(s.id)}">See full pricing &rarr;</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";

    function close() {
      backdrop.remove();
      document.body.style.overflow = "";
    }
    backdrop.querySelector(".modal-close").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelectorAll('a[href^="#/book"]').forEach((a) => a.addEventListener("click", close));
    backdrop.querySelector("[data-open-service]").addEventListener("click", close);
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onEsc);
      }
    });
  }

  function illustrationPartnership() {
    return `
      <svg class="page-illustration" viewBox="0 0 520 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="180" y1="100" x2="340" y2="100" stroke="#38BDF8" stroke-width="2.5" opacity="0.6"/>
        <g opacity="0.45">
          <line x1="180" y1="100" x2="80" y2="50" stroke="#38BDF8" stroke-width="1.5"/>
          <line x1="180" y1="100" x2="80" y2="150" stroke="#38BDF8" stroke-width="1.5"/>
          <line x1="340" y1="100" x2="440" y2="50" stroke="#38BDF8" stroke-width="1.5"/>
          <line x1="340" y1="100" x2="440" y2="150" stroke="#38BDF8" stroke-width="1.5"/>
        </g>
        <circle cx="80" cy="50" r="9" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="80" cy="150" r="9" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="440" cy="50" r="9" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="440" cy="150" r="9" fill="#0A1F3D" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="180" cy="100" r="26" fill="#FF7A33"/>
        <circle cx="340" cy="100" r="26" fill="#38BDF8"/>
      </svg>
    `;
  }

  function contactCard() {
    return `
      <div class="contact-card">
        <h3>Quick contact</h3>
        <div class="contact-line">
          <div><div class="lbl">Call / WhatsApp</div><div class="num">0722 910 004</div></div>
          <div class="contact-actions">
            <a class="icon-btn wa" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Hi TheHubVisionary, I'd like to enquire about a service.")}" target="_blank" rel="noopener" aria-label="WhatsApp 0722910004">&#9993;</a>
            <a class="icon-btn call" href="tel:+${WA_NUMBER}" aria-label="Call 0722910004">&#9742;</a>
          </div>
        </div>
        <div class="contact-line">
          <div><div class="lbl">Call / WhatsApp</div><div class="num">0720 080 004</div></div>
          <div class="contact-actions">
            <a class="icon-btn wa" href="https://wa.me/${WA_NUMBER_2}?text=${encodeURIComponent("Hi TheHubVisionary, I'd like to enquire about a service.")}" target="_blank" rel="noopener" aria-label="WhatsApp 0720080004">&#9993;</a>
            <a class="icon-btn call" href="tel:+${WA_NUMBER_2}" aria-label="Call 0720080004">&#9742;</a>
          </div>
        </div>
        <div class="contact-line">
          <div><div class="lbl">Email</div><div class="num" style="font-size:14px;">info@thehubvisionary.com</div></div>
          <div class="contact-actions">
            <a class="icon-btn" href="mailto:info@thehubvisionary.com" aria-label="Email info@thehubvisionary.com">&#9993;</a>
          </div>
        </div>
        <div class="contact-meta">
          Nairobi, Kenya &mdash; on-site callouts<br>
          All 47 counties &mdash; distance-based callout fee<br>
          Same-day response (Nairobi)
        </div>
      </div>
    `;
  }

  // ---------- page: HOME ----------

  async function renderHome() {
    app.innerHTML = `
      <header class="hero">
        <div class="hero-grid"></div>
        <div class="wrap hero-inner">
          <div>
            <div class="boot">
              <div class="ln">&gt; connecting to TheHubVisionary_<span class="cursor"></span></div>
              <div class="ln">&gt; diagnostics<span class="ok">.......OK</span></div>
              <div class="ln">&gt; support_channel<span class="ok">......OK</span></div>
              <div class="ln">&gt; status: <b>READY FOR CALLOUT</b></div>
            </div>
            <h1>We fix it.<br>We build it.<br>We keep it <span>running.</span></h1>
            <p class="lede">Hardware repair, IT support, websites, web apps, POS &amp; CRM systems, cloud, server management, enterprise systems and bulk SMS &mdash; one contact for your business's entire tech stack. Based in Nairobi, serving all 47 counties.</p>
            <div class="hero-ctas">
              <a href="#/book" class="btn btn-primary">Book a callout &rarr;</a>
              <a href="#/services" class="btn btn-ghost">See all services</a>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><span>SYSTEM STATUS</span><span class="live"><span class="dot"></span>ONLINE</span></div>
            <div class="stat-row"><span>Coverage</span><b>All 47 counties, Kenya</b></div>
            <div class="stat-row"><span>Response window</span><b>Same-day (Nairobi)</b></div>
            <div class="stat-row"><span>Outside Nairobi</span><b>Callout fee by distance</b></div>
            <div class="stat-row"><span>Support channel</span><b>WhatsApp / Call</b></div>
          </div>
        </div>
      </header>

      <section class="section" id="services">
        <div class="wrap">
          <div class="section-tag">// Services</div>
          <h2>Everything your business's tech needs, under one roof</h2>
          <p class="intro">From a laptop that won't boot to the custom system that runs your shop &mdash; pick a service, or bundle a few together.</p>
          <div id="home-services-grid"><div class="loading-row">Loading services…</div></div>
          <div style="margin-top:36px; text-align:center;">
            <a href="#/services" class="btn btn-ghost-light">View all services &amp; pricing &rarr;</a>
          </div>
        </div>
      </section>

      <section class="process" id="process">
        <div class="wrap">
          <div class="section-tag">// Process</div>
          <h2>How a callout works</h2>
          <p class="intro">No jargon, no guesswork &mdash; four steps from "it's broken" to "it's fixed."</p>
          <div class="steps">
            <div class="step"><div class="num">1</div><h4>Message us</h4><p>Describe the issue on WhatsApp, by call, or through the booking form.</p></div>
            <div class="step"><div class="num">2</div><h4>Get a quote</h4><p>A clear price range before any work begins, no surprise charges.</p></div>
            <div class="step"><div class="num">3</div><h4>We diagnose &amp; fix</h4><p>On-site or remote, whichever gets you back running fastest.</p></div>
            <div class="step"><div class="num">4</div><h4>We follow up</h4><p>Retainer clients get ongoing checks so the same fault doesn't return.</p></div>
          </div>
        </div>
      </section>

      <section class="trust">
        <div class="wrap">
          <div class="trust-grid">
            <div class="trust-item"><span class="mark">01</span><h3>One contact, whole stack</h3><p>Hardware, software, websites, custom systems and cloud &mdash; no juggling three different vendors.</p></div>
            <div class="trust-item"><span class="mark">02</span><h3>Nationwide coverage</h3><p>Based in Nairobi with same-day callouts locally &mdash; and all 47 counties reachable, with a transparent distance-based callout fee.</p></div>
            <div class="trust-item"><span class="mark">03</span><h3>Clear pricing upfront</h3><p>Every job gets a scoped quote before work starts &mdash; nothing billed by surprise.</p></div>
          </div>
        </div>
      </section>

      <section class="cta" id="contact">
        <div class="wrap cta-inner" style="text-align:center;">
          <h2 style="font-family:var(--display); font-size:30px; margin-bottom:14px;">Something needs fixing, building, or setting up?</h2>
          <p style="color:#B9C6DA; margin-bottom:28px;">Tell us what's going on &mdash; we'll scope it and get back to you same-day.</p>
          <a href="#/book" class="btn btn-primary" style="font-size:16px; padding:15px 32px;">Book a callout &rarr;</a>
        </div>
      </section>
    `;

    const services = await loadServices();
    const grid = document.getElementById("home-services-grid");
    if (grid) {
      const featured = services.slice(0, 6);
      grid.innerHTML = `<div class="svc-grid">${featured.map(serviceCard).join("")}</div>`;
    }
  }

  // ---------- page: SERVICES ----------

  async function renderServices() {
    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// Services &amp; Pricing</div>
          <h1>Every service we offer, with real pricing</h1>
          <p>Tap any service to see full details and price ranges. Prices are starting guides &mdash; final quotes depend on scope.</p>
        </div>
      </header>
      <section class="section">
        <div class="wrap">
          <div class="pricing-banner">
            <b>How pricing works:</b> prices below cover our labour and service delivery. Where a job needs parts, hardware, or third-party software/subscriptions (screens, cameras, routers, licenses, hosting), those are quoted separately at cost and confirmed before we buy or fit anything.
          </div>
          <div id="services-full-grid">
            <div class="loading-row">Loading services…</div>
          </div>
        </div>
      </section>
    `;
    const services = await loadServices();
    const grouped = groupByCategory(services);
    const container = document.getElementById("services-full-grid");
    container.innerHTML = grouped
      .map(
        ([cat, list]) => `
        <div class="cat-label">${esc(cat)}</div>
        <div class="svc-grid">${list.map(serviceCard).join("")}</div>
      `
      )
      .join("");

    // support deep-linking to #/services/:id to auto-open a service
    const hashParts = location.hash.split("/");
    if (hashParts[2]) {
      const id = hashParts[2].split("?")[0];
      if (services.find((s) => s.id === id)) openServiceModal(id);
    }
  }

  // ---------- page: CLIENTS / OUR WORK ----------

  async function renderClients() {
    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// Our Work</div>
          <h1>Recent work &amp; case studies</h1>
          <p>A look at the kind of problems we solve. Client identities are kept private unless we have permission to share them.</p>
        </div>
      </header>
      <section class="section" style="padding-bottom:44px;">
        <div class="wrap">
          <div class="section-tag">// Live Service Previews</div>
          <h2>See what we'd build for you</h2>
          <p class="intro">A quick look at each service before you book a callout or request a quote. Tap any preview for full pricing.</p>
          <div id="service-preview-list">
            <div class="loading-row">Loading previews…</div>
          </div>
        </div>
      </section>
      <section class="section" style="padding-top:0;">
        <div class="wrap">
          <div class="illustration-caption">
            <div class="section-tag">// Live diagnostics feed</div>
            <p>A running snapshot of the checks, builds, and monitoring happening behind the scenes.</p>
          </div>
          <div class="illustration-wrap">${illustrationDiagnostic()}</div>
          <div id="clients-grid">
            <div class="loading-row">Loading…</div>
          </div>
        </div>
      </section>
    `;
    const [clients, services] = await Promise.all([loadClients(), loadServices()]);

    const previewList = document.getElementById("service-preview-list");
    previewList.innerHTML = groupByCategory(services)
      .map(
        ([cat, list]) => `
        <div class="cat-label">${esc(cat)}</div>
        <div class="preview-grid">${list.map(previewCard).join("")}</div>
      `
      )
      .join("");

    const container = document.getElementById("clients-grid");
    container.innerHTML = `
      <div class="case-grid">
        ${clients
          .map(
            (c) => `
          <div class="case-card ${c.id === "_note" ? "note" : ""}">
            <div class="sector">${esc(c.sector)}</div>
            <h3>${esc(c.title)}</h3>
            <p>${esc(c.summary)}</p>
            ${c.service && c.service !== "—" ? `<span class="service-tag">${esc(c.service)}</span>` : ""}
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  // ---------- page: BOOK A CALLOUT ----------

  async function renderBook() {
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const preselect = params.get("service") || "";
    const initialTab = params.get("tab") === "quote" ? "quote" : "book";

    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// Book a Callout or Get a Quote</div>
          <h1>Tell us what you need &mdash; we'll take it from there</h1>
          <p>Book a callout to get on our schedule, or generate a PDF estimate first if you just want a real price range to review.</p>
        </div>
      </header>
      <section class="cta" style="padding-top:40px;">
        <div class="wrap cta-inner">
          <div class="tab-switch" role="tablist">
            <button class="tab-btn" data-tab="book" role="tab">Book a Callout</button>
            <button class="tab-btn" data-tab="quote" role="tab">Get a PDF Quote</button>
          </div>

          <div id="tab-book" class="tab-panel">
            <div class="contact-grid">
              <form class="quote-card" id="booking-form">
                <h3>Booking details</h3>
                <p class="hint">Fields marked required help us respond faster.</p>

                <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off">

                <div class="field-row">
                  <div class="field">
                    <label for="b-name">Your name *</label>
                    <input type="text" id="b-name" placeholder="e.g. Jane Wanjiru" required>
                  </div>
                  <div class="field">
                    <label for="b-phone">Phone / WhatsApp *</label>
                    <input type="tel" id="b-phone" placeholder="e.g. 0712 345 678" required>
                  </div>
                </div>

                <div class="field">
                  <label for="b-service">Service needed *</label>
                  <select id="b-service">
                    <option value="">Loading services…</option>
                  </select>
                </div>

                <div class="field-row">
                  <div class="field">
                    <label for="b-county">County *</label>
                    <select id="b-county">
                      <option value="">Loading counties…</option>
                    </select>
                  </div>
                  <div class="field">
                    <label for="b-address">Specific address</label>
                    <input type="text" id="b-address" placeholder="e.g. Estate, street, building">
                  </div>
                </div>

                <div class="field" id="fee-estimate-wrap" style="display:none;">
                  <div class="fee-estimate" id="fee-estimate"></div>
                </div>

                <div class="field">
                  <label for="b-date">Preferred date/time</label>
                  <input type="text" id="b-date" placeholder="e.g. Tomorrow afternoon">
                </div>

                <div class="field">
                  <label for="b-message">Tell us what's going on</label>
                  <textarea id="b-message" rows="4" placeholder="e.g. My laptop fan is making a grinding noise and shuts down when hot..."></textarea>
                </div>

                <button type="submit" class="btn btn-primary quote-submit" id="booking-submit">Submit booking &rarr;</button>
                <div class="quote-note">We'll confirm your callout by phone or WhatsApp, usually same-day.</div>
                <div class="form-msg" id="booking-msg"></div>
              </form>
              ${contactCard()}
            </div>
          </div>

          <div id="tab-quote" class="tab-panel" style="display:none;">
            <div class="contact-grid">
              <form class="quote-card" id="quote-form">
                <h3>Get an estimate</h3>
                <p class="hint">Pick the services you need, choose the scale that fits, and tell us more below — we'll generate a PDF estimate you can review. A final, confirmed figure follows once we've agreed the scope.</p>

                <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off">

                <div class="field-row">
                  <div class="field">
                    <label for="q-name">Your name *</label>
                    <input type="text" id="q-name" placeholder="e.g. Jane Wanjiru" required>
                  </div>
                  <div class="field">
                    <label for="q-phone">Phone / WhatsApp *</label>
                    <input type="tel" id="q-phone" placeholder="e.g. 0712 345 678" required>
                  </div>
                </div>
                <div class="field-row">
                  <div class="field">
                    <label for="q-email">Email (optional — for auto-send)</label>
                    <input type="email" id="q-email" placeholder="e.g. jane@example.com">
                  </div>
                  <div class="field">
                    <label for="q-county">County (for callout fee, optional)</label>
                    <select id="q-county"><option value="">Not needed / remote work</option></select>
                  </div>
                </div>
                <div class="field">
                  <label for="q-address">Specific address (optional)</label>
                  <input type="text" id="q-address" placeholder="e.g. Estate, street, building">
                </div>

                <div class="field">
                  <label>Services to quote *</label>
                  <div class="quote-services" id="quote-services"><div class="loading-row" style="color:#9FB0C8;">Loading services…</div></div>
                </div>

                <div class="field">
                  <label for="q-details">Describe what you need (optional, but helps us quote accurately)</label>
                  <textarea id="q-details" rows="3" placeholder="e.g. My HP laptop won't boot past the BIOS screen, or: I need Wi-Fi covering a 2-floor office with about 15 staff."></textarea>
                </div>

                <div class="quote-running-total" id="quote-total" style="display:none;"></div>

                <button type="submit" class="btn btn-primary quote-submit" id="quote-submit">Generate PDF estimate &rarr;</button>
                <div class="quote-note">This is an estimate, not a final bill — you'll get a download link immediately, plus an emailed copy if you add your email.</div>
                <div class="form-msg" id="quote-msg"></div>
                <div id="quote-result"></div>
              </form>
              ${contactCard()}
            </div>
          </div>
        </div>
      </section>
    `;

    // ---------- tab switching ----------
    const tabBtns = document.querySelectorAll(".tab-btn");
    function setTab(name) {
      tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      document.getElementById("tab-book").style.display = name === "book" ? "block" : "none";
      document.getElementById("tab-quote").style.display = name === "quote" ? "block" : "none";
    }
    tabBtns.forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
    setTab(initialTab);

    // ---------- BOOK tab wiring ----------
    const services = await loadServices();
    const select = document.getElementById("b-service");
    select.innerHTML = services.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
    if (preselect) {
      const match = services.find((s) => s.id === preselect);
      if (match) select.value = match.name;
    }

    const counties = await loadCounties();
    const countySelect = document.getElementById("b-county");
    countySelect.innerHTML =
      `<option value="">Select your county…</option>` +
      counties.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}${c.distanceKm === 0 ? " (Nairobi)" : ""}</option>`).join("");

    const feeWrap = document.getElementById("fee-estimate-wrap");
    const feeBox = document.getElementById("fee-estimate");
    countySelect.addEventListener("change", function () {
      const county = counties.find((c) => c.name === this.value);
      if (!county) {
        feeWrap.style.display = "none";
        return;
      }
      feeWrap.style.display = "block";
      const accomNote = county.accommodation ? `<div class="fee-note">${esc(county.note)}</div>` : "";
      feeBox.innerHTML = `
        <div class="fee-title">Estimated callout fee for ${esc(county.name)}</div>
        <div class="fee-amount">${esc(county.fee)}</div>
        ${accomNote}
        <div class="fee-disclaimer">Distance-based estimate (~${county.distanceKm} km from Nairobi). Final fee confirmed when we schedule your callout.</div>
      `;
    });

    document.getElementById("booking-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      const submitBtn = document.getElementById("booking-submit");
      const msgBox = document.getElementById("booking-msg");
      msgBox.className = "form-msg";
      msgBox.textContent = "";

      const payload = {
        name: document.getElementById("b-name").value.trim(),
        phone: document.getElementById("b-phone").value.trim(),
        service: document.getElementById("b-service").value,
        county: document.getElementById("b-county").value,
        address: document.getElementById("b-address").value.trim(),
        preferredDate: document.getElementById("b-date").value.trim(),
        message: document.getElementById("b-message").value.trim(),
        website: document.querySelector('#booking-form [name="website"]').value,
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";

      try {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) {
          msgBox.classList.add("show", "error");
          msgBox.textContent = (data.errors && data.errors.join(" ")) || data.error || "Something went wrong. Please try again or WhatsApp us directly.";
        } else {
          msgBox.classList.add("show", "success");
          const feeLine = data.calloutFee ? `\nEstimated callout fee: ${data.calloutFee}` : "";
          msgBox.innerHTML = `✓ Booking received! We'll be in touch shortly.${
            data.calloutFee ? ` Estimated callout fee for ${esc(payload.county)}: <b>${esc(data.calloutFee)}</b>.` : ""
          } Want to speed things up? <a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
            "Hi TheHubVisionary, I just submitted a booking on the site.\n\nName: " +
              payload.name +
              "\nService: " +
              payload.service +
              "\nCounty: " +
              payload.county +
              feeLine
          )}" target="_blank" rel="noopener" style="color:#8FE7AC; text-decoration:underline;">Message us on WhatsApp</a>.`;
          document.getElementById("booking-form").reset();
          feeWrap.style.display = "none";
        }
      } catch (err) {
        msgBox.classList.add("show", "error");
        msgBox.textContent = "Network error — please try again or contact us directly on WhatsApp.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit booking →";
      }
    });

    // ---------- QUOTE tab wiring ----------
    const qCountySelect = document.getElementById("q-county");
    qCountySelect.innerHTML +=
      counties.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}${c.distanceKm === 0 ? " (Nairobi)" : ""}</option>`).join("");

    const svcContainer = document.getElementById("quote-services");
    svcContainer.innerHTML = services
      .map((s) => {
        const pricing = s.pricing || [];
        const first = pricing[0];
        const hasTiers = pricing.length > 1;
        return `
        <div class="quote-svc-item">
          <label class="quote-svc-row">
            <input type="checkbox" class="quote-svc-check" value="${esc(s.id)}" data-name="${esc(s.name)}">
            <span class="quote-svc-name">${esc(s.name)}</span>
            <span class="quote-svc-price">${first ? esc(first.price) : ""}</span>
          </label>
          ${
            hasTiers
              ? `<div class="quote-svc-tier" data-tier-for="${esc(s.id)}" style="display:none;">
                  <label class="tier-label">Scale of work</label>
                  <select class="quote-svc-tier-select">
                    ${pricing.map((p, i) => `<option value="${i}">${esc(p.label)} — ${esc(p.price)}</option>`).join("")}
                  </select>
                </div>`
              : ""
          }
        </div>
      `;
      })
      .join("");

    // show/hide the tier dropdown as its checkbox is (un)checked
    svcContainer.addEventListener("change", (e) => {
      if (e.target.classList.contains("quote-svc-check")) {
        const item = e.target.closest(".quote-svc-item");
        const tierBox = item ? item.querySelector(".quote-svc-tier") : null;
        if (tierBox) tierBox.style.display = e.target.checked ? "block" : "none";
      }
      updateQuoteTotal();
    });

    function updateQuoteTotal() {
      const checked = svcContainer.querySelectorAll(".quote-svc-check:checked");
      const totalBox = document.getElementById("quote-total");
      if (!checked.length) {
        totalBox.style.display = "none";
        return;
      }
      totalBox.style.display = "block";
      totalBox.innerHTML = `${checked.length} service${checked.length > 1 ? "s" : ""} selected — you'll get an estimated range on your generated PDF, with an exact figure confirmed once we've discussed the details.`;
    }

    document.getElementById("quote-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      const submitBtn = document.getElementById("quote-submit");
      const msgBox = document.getElementById("quote-msg");
      const resultBox = document.getElementById("quote-result");
      msgBox.className = "form-msg";
      msgBox.textContent = "";
      resultBox.innerHTML = "";

      const checked = Array.from(svcContainer.querySelectorAll(".quote-svc-check:checked"));
      if (!checked.length) {
        msgBox.classList.add("show", "error");
        msgBox.textContent = "Select at least one service to quote.";
        return;
      }

      const items = checked.map((c) => {
        const svc = services.find((s) => s.id === c.value);
        const item = c.closest(".quote-svc-item");
        const tierSelect = item ? item.querySelector(".quote-svc-tier-select") : null;
        const tierIdx = tierSelect ? Number(tierSelect.value) : 0;
        const tier = (svc.pricing || [])[tierIdx] || svc.pricing[0];
        const range = tier ? parsePriceRange(tier.price) : { low: 0, high: 0 };
        return {
          description: svc.name,
          detail: tier ? tier.label + " — " + tier.detail : "",
          amountLow: range.low,
          amountHigh: range.high,
        };
      });

      const payload = {
        name: document.getElementById("q-name").value.trim(),
        phone: document.getElementById("q-phone").value.trim(),
        email: document.getElementById("q-email").value.trim(),
        county: document.getElementById("q-county").value,
        address: document.getElementById("q-address").value.trim(),
        items,
        notes: document.getElementById("q-details").value.trim(),
        website: document.querySelector('#quote-form [name="website"]').value,
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "Generating…";

      try {
        const res = await fetch("/api/quote/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) {
          msgBox.classList.add("show", "error");
          msgBox.textContent = (data.errors && data.errors.join(" ")) || data.error || "Something went wrong generating the quote.";
        } else {
          msgBox.classList.add("show", "success");
          const totalStr =
            data.totalLow === data.totalHigh
              ? `KSh ${data.totalHigh.toLocaleString()}`
              : `KSh ${data.totalLow.toLocaleString()} – ${data.totalHigh.toLocaleString()} (estimate)`;
          msgBox.textContent = `✓ Quote ${data.number || ""} generated — ${totalStr}.`;
          const expiryStr = new Date(data.expiresAt).toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric" });
          resultBox.innerHTML = quoteResultPanel(data, expiryStr, payload);
          wireQuoteResultActions(resultBox, data, payload);
        }
      } catch (err) {
        msgBox.classList.add("show", "error");
        msgBox.textContent = "Network error — please try again or contact us directly.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Generate PDF quote →";
      }
    });
  }

  /** Extracts the low and high numbers from a price string like
   *  "KSh 8,000 – 15,000" or "KSh 500" (single number → low === high). */
  function parsePriceRange(priceStr) {
    const matches = String(priceStr || "").match(/[\d,]+(\.\d+)?/g);
    if (!matches || !matches.length) return { low: 0, high: 0 };
    const nums = matches.map((m) => Number(m.replace(/,/g, "")) || 0);
    return { low: Math.min(...nums), high: Math.max(...nums) };
  }

  function fmtEstimate(low, high) {
    if (low === high) return `KSh ${high.toLocaleString()}`;
    return `KSh ${low.toLocaleString()} – ${high.toLocaleString()}`;
  }

  function quoteResultPanel(data, expiryStr, payload) {
    const isRange = data.totalLow !== data.totalHigh;
    return `
      <div class="quote-result-panel">
        <div class="qr-total">${fmtEstimate(data.totalLow, data.totalHigh)}${isRange ? "" : ""}</div>
        ${isRange ? `<div class="qr-estimate-tag">Estimated range — final figure confirmed after scope discussion</div>` : ""}
        <div class="qr-expiry">Valid until ${expiryStr}</div>
        <div class="qr-actions">
          <a href="${data.pdfUrl}" target="_blank" rel="noopener" class="btn btn-primary" id="qr-download">Download PDF &darr;</a>
          <button type="button" class="btn btn-ghost" id="qr-whatsapp">Share via WhatsApp</button>
        </div>
        ${
          payload.email
            ? data.emailSent
              ? `<div class="qr-email-status ok">✓ Emailed to ${esc(payload.email)}</div>`
              : `<div class="qr-email-status warn">Couldn't auto-email (${esc(data.emailReason || "not configured")}) — download the PDF above and attach it to an email yourself.</div>`
            : ""
        }
      </div>
    `;
  }

  function wireQuoteResultActions(container, data, payload) {
    const waBtn = container.querySelector("#qr-whatsapp");
    if (!waBtn) return;
    waBtn.addEventListener("click", async () => {
      const fullUrl = location.origin + data.pdfUrl;
      const totalStr = fmtEstimate(data.totalLow, data.totalHigh);
      // Try the native share sheet with the actual PDF file first (works on
      // most mobile browsers) — falls back to a WhatsApp link with the PDF
      // URL in the message if the browser doesn't support file sharing.
      try {
        const resp = await fetch(data.pdfUrl);
        const blob = await resp.blob();
        const file = new File([blob], (data.number || "quote") + ".pdf", { type: "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `TheHubVisionary Quote ${data.number || ""}`,
            text: `Quote ${data.number || ""} — estimated ${totalStr}`,
          });
          return;
        }
      } catch (e) {
        // fall through to link-based share below
      }
      const text = `Hi TheHubVisionary, here's my quote reference.\n\nQuote: ${data.number}\nEstimated total: ${totalStr}\nPDF: ${fullUrl}`;
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    });
  }

  // ---------- page: CONTACT ----------

  async function renderContact() {
    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// Contact</div>
          <h1>Get in touch</h1>
          <p>General questions, partnership enquiries, or anything that isn't a specific callout &mdash; send us a message.</p>
        </div>
      </header>
      <section class="cta" style="padding-top:56px;">
        <div class="wrap cta-inner">
          <div class="contact-grid">
            <form class="quote-card" id="contact-form">
              <h3>Send a message</h3>
              <p class="hint">We reply during business hours, usually same-day.</p>

              <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off">

              <div class="field-row">
                <div class="field">
                  <label for="c-name">Your name *</label>
                  <input type="text" id="c-name" placeholder="e.g. Jane Wanjiru" required>
                </div>
                <div class="field">
                  <label for="c-phone">Phone *</label>
                  <input type="tel" id="c-phone" placeholder="e.g. 0712 345 678" required>
                </div>
              </div>
              <div class="field">
                <label for="c-email">Email (optional)</label>
                <input type="email" id="c-email" placeholder="e.g. jane@example.com">
              </div>
              <div class="field">
                <label for="c-message">Message *</label>
                <textarea id="c-message" rows="5" placeholder="How can we help?" required></textarea>
              </div>
              <button type="submit" class="btn btn-primary quote-submit" id="contact-submit">Send message &rarr;</button>
              <div class="form-msg" id="contact-msg"></div>
            </form>
            ${contactCard()}
          </div>
        </div>
      </section>
    `;

    document.getElementById("contact-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      const submitBtn = document.getElementById("contact-submit");
      const msgBox = document.getElementById("contact-msg");
      msgBox.className = "form-msg";

      const payload = {
        name: document.getElementById("c-name").value.trim(),
        phone: document.getElementById("c-phone").value.trim(),
        email: document.getElementById("c-email").value.trim(),
        message: document.getElementById("c-message").value.trim(),
        website: document.querySelector('#contact-form [name="website"]').value,
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) {
          msgBox.classList.add("show", "error");
          msgBox.textContent = (data.errors && data.errors.join(" ")) || data.error || "Something went wrong. Please try again.";
        } else {
          msgBox.classList.add("show", "success");
          msgBox.textContent = "✓ Message sent. We'll get back to you shortly.";
          document.getElementById("contact-form").reset();
        }
      } catch (err) {
        msgBox.classList.add("show", "error");
        msgBox.textContent = "Network error — please try again or WhatsApp us directly.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send message →";
      }
    });
  }

  // ---------- page: PARTNERS ----------

  async function renderPartners() {
    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// Partners</div>
          <h1>Who we work with</h1>
          <p>Partners who help us deliver reliable service — more added here as relationships grow.</p>
        </div>
      </header>
      <section class="section">
        <div class="wrap">
          <div class="illustration-wrap">${illustrationPartnership()}</div>
          <div id="partners-grid">
            <div class="loading-row">Loading…</div>
          </div>
        </div>
      </section>
    `;
    const partners = await loadPartners();
    const container = document.getElementById("partners-grid");
    if (!partners.length) {
      container.innerHTML = `<div class="loading-row">Partner list coming soon.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="case-grid">
        ${partners
          .map(
            (p) => `
          <div class="case-card partner-card">
            <div class="sector">${esc(p.category)}</div>
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.description || "")}</p>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  // ---------- page: ABOUT ----------

  async function renderAbout() {
    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// About</div>
          <h1>About TheHubVisionary</h1>
          <p>IT support built around one idea: one contact for your whole tech stack, done properly.</p>
        </div>
      </header>
      <section class="section">
        <div class="wrap" style="max-width:760px;">
          <div class="illustration-wrap">${illustrationHub()}</div>
          <p style="font-size:16px; color:var(--ink); line-height:1.75; margin-bottom:20px;">
            TheHubVisionary is a Nairobi-based IT services company covering everything from hands-on
            hardware repair to the systems that run a growing business — websites, web apps, POS and
            CRM systems, cloud services, networking, and server management. The idea behind
            it is simple: most small and mid-sized businesses don't need five different vendors for
            five different tech problems. They need one contact who can be trusted with all of it.
          </p>
          <p style="font-size:16px; color:var(--ink); line-height:1.75; margin-bottom:20px;">
            We started serving SMEs around Nairobi and now take on callouts across all 47 counties,
            with transparent, distance-based travel pricing so there are no surprises when a job is
            outside the city.
          </p>
          <p style="font-size:16px; color:var(--ink); line-height:1.75; margin-bottom:40px;">
            Every job — from a same-day laptop repair to a multi-branch network build — starts with a
            clear quote before any work begins.
          </p>

          <div class="trust-grid" style="margin-top:20px;">
            <div class="trust-item"><span class="mark">01</span><h3>One contact, whole stack</h3><p>Hardware, software, websites, custom systems, cloud, and networking — no juggling vendors.</p></div>
            <div class="trust-item"><span class="mark">02</span><h3>Transparent pricing</h3><p>Every service has a published starting price. Callout fees are calculated, not guessed.</p></div>
            <div class="trust-item"><span class="mark">03</span><h3>Nationwide reach</h3><p>Based in Nairobi, reachable across all 47 counties.</p></div>
          </div>

          <div style="margin-top:48px; text-align:center;">
            <a href="#/book" class="btn btn-primary">Book a callout &rarr;</a>
          </div>
        </div>
      </section>
    `;
  }

  // ---------- page: FAQ ----------

  const FAQ_ITEMS = [
    {
      q: "What areas do you cover?",
      a: "We're based in Nairobi and cover all 47 counties in Kenya. Jobs within Nairobi use the standard per-service callout fee; jobs outside Nairobi include a distance-based travel fee — pick your county on the Book a Callout page to see an estimate before you submit."
    },
    {
      q: "Do you charge a diagnostic fee?",
      a: "For hardware repairs, yes — a small diagnostic fee (see the Hardware Repair service for the current amount) that's waived if you go ahead with the repair."
    },
    {
      q: "Are the prices on the site final?",
      a: "They're starting guides. Every job gets a clear, specific quote — confirmed before any work begins — based on the actual scope once we've heard the details."
    },
    {
      q: "Do quoted prices include software licenses or hosting costs?",
      a: "Where a job involves paid third-party software, hosting, domains, or gateway fees (common for websites, POS/CRM systems, and cloud setups), those are billed at cost and confirmed upfront — never bundled invisibly into the quote."
    },
    {
      q: "How is the callout fee for locations outside Nairobi calculated?",
      a: "It's based on actual distance from Nairobi — fuel, vehicle costs, and travel time — not a flat guess. Farther counties cost more, and very remote areas may need flights and accommodation, which we'll confirm with you directly."
    },
    {
      q: "I need ongoing support, not just a one-time fix — what should I book?",
      a: "Take a look at Managed IT Support, Network Management, or Server Management & DevOps on the Services page — these are monthly retainer options rather than one-off callouts."
    },
    {
      q: "How do I book a callout?",
      a: "Use the Book a Callout page — fill in your details, service, and county, and it goes straight into our system. We confirm by phone or WhatsApp, usually the same day."
    }
  ];

  async function renderFAQ() {
    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// FAQ</div>
          <h1>Frequently asked questions</h1>
          <p>Don't see your question here? Send us a message on the Contact page.</p>
        </div>
      </header>
      <section class="section">
        <div class="wrap" style="max-width:760px;">
          ${FAQ_ITEMS.map(
            (item) => `
            <div style="border-bottom:1px solid var(--line-light); padding:22px 0;">
              <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin-bottom:10px;">${esc(item.q)}</h3>
              <p style="font-size:14.5px; color:var(--slate); line-height:1.65;">${esc(item.a)}</p>
            </div>
          `
          ).join("")}
          <div style="margin-top:40px; text-align:center;">
            <a href="#/contact" class="btn btn-ghost-light">Ask us directly &rarr;</a>
          </div>
        </div>
      </section>
    `;
  }

  // ---------- page: TERMS ----------

  async function renderTerms() {
    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// Terms of Service</div>
          <h1>Terms of Service</h1>
          <p>Last updated: 2026. This is a general starting template, not legal advice — have it reviewed by a lawyer before relying on it.</p>
        </div>
      </header>
      <section class="section">
        <div class="wrap" style="max-width:760px;">
          <div style="font-size:14.5px; color:var(--ink); line-height:1.75;">
            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">1. Quotes &amp; Pricing</h3>
            <p>Prices listed on this site are starting guides. A specific quote is confirmed before any work begins. Callout fees for locations outside Nairobi are estimated by distance and confirmed at time of booking. Third-party software, licensing, hosting, or gateway costs are billed at cost and disclosed upfront where applicable.</p>

            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">2. Bookings &amp; Cancellations</h3>
            <p>Booking a callout through this site reserves an estimated time slot, confirmed by phone or WhatsApp. Please give as much notice as possible if you need to reschedule or cancel.</p>

            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">3. Repairs &amp; Systems Work</h3>
            <p>Where hardware parts or third-party components are required, timelines depend on parts availability. Custom systems (websites, apps, POS, CRM) are scoped and agreed before development begins.</p>

            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">4. Limitation of Liability</h3>
            <p>We take reasonable care with every job, but are not liable for pre-existing faults, data loss not caused by our work, or issues arising from third-party software or hardware outside our control.</p>

            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">5. Contact</h3>
            <p>Questions about these terms can be sent to <a href="mailto:info@thehubvisionary.com" style="color:var(--sky-dim);">info@thehubvisionary.com</a>.</p>
          </div>
        </div>
      </section>
    `;
  }

  // ---------- page: PRIVACY ----------

  async function renderPrivacy() {
    app.innerHTML = `
      <header class="page-header">
        <div class="wrap">
          <div class="section-tag">// Privacy Policy</div>
          <h1>Privacy Policy</h1>
          <p>Last updated: 2026. This is a general starting template, not legal advice — have it reviewed by a lawyer before relying on it.</p>
        </div>
      </header>
      <section class="section">
        <div class="wrap" style="max-width:760px;">
          <div style="font-size:14.5px; color:var(--ink); line-height:1.75;">
            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">What we collect</h3>
            <p>When you submit a booking or contact form, we collect your name, phone number, email (if provided), county/address, and the details of your request. This is used only to respond to and fulfil your request.</p>

            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">How it's stored</h3>
            <p>Submissions are stored securely and are only accessible to authorized TheHubVisionary staff. We don't sell or share your information with third parties for marketing purposes.</p>

            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">Your rights</h3>
            <p>Under Kenya's Data Protection Act, 2019, you have the right to ask what information we hold about you and to request it be corrected or deleted. Contact <a href="mailto:info@thehubvisionary.com" style="color:var(--sky-dim);">info@thehubvisionary.com</a> for any such request.</p>

            <h3 style="font-family:var(--display); font-size:17px; color:var(--navy); margin:24px 0 10px;">Cookies</h3>
            <p>This site does not use tracking or advertising cookies.</p>
          </div>
        </div>
      </section>
    `;
  }

  // ---------- page: NOT FOUND ----------

  async function renderNotFound() {
    app.innerHTML = `
      <section class="section" style="padding-top:120px; padding-bottom:120px; text-align:center;">
        <div class="wrap">
          <div class="section-tag" style="justify-content:center; display:flex;">// 404</div>
          <h2 style="margin:0 auto 14px;">That page doesn't exist</h2>
          <p class="intro" style="margin:0 auto 32px;">The link might be old, or the address was mistyped. Here's how to get back on track:</p>
          <div class="hero-ctas" style="justify-content:center;">
            <a href="#/" class="btn btn-primary">Go home &rarr;</a>
            <a href="#/services" class="btn btn-ghost-light">See all services</a>
          </div>
        </div>
      </section>
    `;
  }

  // ---------- router ----------

  const routes = {
    "/": renderHome,
    "/services": renderServices,
    "/clients": renderClients,
    "/partners": renderPartners,
    "/about": renderAbout,
    "/faq": renderFAQ,
    "/terms": renderTerms,
    "/privacy": renderPrivacy,
    "/book": renderBook,
    "/contact": renderContact,
  };

  const PAGE_TITLES = {
    "/": "TheHubVisionary — Ignite Your Vision",
    "/services": "Services & Pricing — TheHubVisionary",
    "/clients": "Our Work — TheHubVisionary",
    "/partners": "Partners — TheHubVisionary",
    "/about": "About — TheHubVisionary",
    "/faq": "FAQ — TheHubVisionary",
    "/terms": "Terms of Service — TheHubVisionary",
    "/privacy": "Privacy Policy — TheHubVisionary",
    "/book": "Book a Callout — TheHubVisionary",
    "/contact": "Contact — TheHubVisionary",
  };

  function currentPath() {
    const hash = location.hash.replace(/^#/, "") || "/";
    const path = hash.split("?")[0];
    // collapse /services/:id back to /services for routing purposes
    if (path.startsWith("/services/")) return "/services";
    return path || "/";
  }

  function updateActiveLink() {
    const path = currentPath();
    document.querySelectorAll(".navlinks a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("data-route") === path);
    });
  }

  async function route() {
    const path = currentPath();
    const handler = routes[path];
    navlinks.classList.remove("open");
    if (handler) {
      document.title = PAGE_TITLES[path] || "TheHubVisionary";
      await handler();
    } else {
      document.title = "Page not found — TheHubVisionary";
      await renderNotFound();
    }
    updateActiveLink();
    renderSocialIcons(); // re-fetch each navigation so admin edits show without a hard refresh
    initScrollReveal();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("DOMContentLoaded", route);
})();
