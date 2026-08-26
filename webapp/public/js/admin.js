// ---------- shared helpers ----------
  function esc(s){ const d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }
  function fmtDate(iso){ try { return new Date(iso).toLocaleString('en-GB', {timeZone:'Africa/Nairobi'}); } catch(e){ return iso; } }
  function fmtDateShort(iso){ try { return new Date(iso).toLocaleDateString('en-GB', {timeZone:'Africa/Nairobi', day:'2-digit', month:'short', year:'numeric'}); } catch(e){ return iso; } }

  async function adminFetch(url, options = {}) {
    const opts = { ...options, headers: { ...(options.headers || {}), 'X-Thv-Admin': '1' } };
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
  }

  function showMsg(el, ok, text) {
    el.className = 'admin-form-msg show ' + (ok ? 'success' : 'error');
    el.textContent = text;
  }

  // ---------- tab switching ----------
  const tabBtns = document.querySelectorAll('.admin-tabbtn');
  function setPage(name) {
    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.page === name));
    history.replaceState(null, '', '#' + name);
  }
  tabBtns.forEach(b => b.addEventListener('click', () => setPage(b.dataset.page)));
  setPage((location.hash || '#overview').slice(1));

  // ================= OVERVIEW =================
  async function loadStats(){
    const { data: s } = await adminFetch('/api/admin/stats');
    if (!s) return;
    const fmtKsh = (n) => 'KSh ' + Number(n||0).toLocaleString();

    document.getElementById('stat-cards').innerHTML = `
      <div class="stat-card"><div class="n">${s.totalBookings}</div><div class="l">Bookings</div></div>
      <div class="stat-card"><div class="n">${s.newBookings}</div><div class="l">New Bookings</div></div>
      <div class="stat-card"><div class="n">${s.totalMessages}</div><div class="l">Messages</div></div>
      <div class="stat-card"><div class="n">${s.totalQuotes}</div><div class="l">Quotes</div></div>
      <div class="stat-card"><div class="n">${s.unpaidInvoices}</div><div class="l">Unpaid Invoices</div></div>
    `;

    document.getElementById('revenue-cards').innerHTML = `
      <div class="stat-card money"><div class="n">${fmtKsh(s.paidTotal)}</div><div class="l">Collected (${s.paidInvoices} paid invoice${s.paidInvoices===1?'':'s'})</div></div>
      <div class="stat-card money warn"><div class="n">${fmtKsh(s.unpaidTotal)}</div><div class="l">Outstanding (${s.unpaidInvoices} unpaid)</div></div>
      <div class="stat-card money"><div class="n">${fmtKsh(s.totalQuotedValue)}</div><div class="l">Pipeline value (all quotes, upper estimate)</div></div>
      <div class="stat-card money"><div class="n">${fmtKsh(s.avgQuoteValue)}</div><div class="l">Average quote value</div></div>
    `;

    const emailTotal = s.quotesEmailSent + s.quotesEmailFailed + s.invoicesEmailSent + s.invoicesEmailFailed;
    document.getElementById('email-stats').innerHTML = emailTotal ? `
      <div class="breakdown-row"><span>Quotes emailed successfully</span><b>${s.quotesEmailSent}</b></div>
      <div class="breakdown-row"><span>Quote emails that failed</span><b>${s.quotesEmailFailed}</b></div>
      <div class="breakdown-row"><span>Invoices emailed successfully</span><b>${s.invoicesEmailSent}</b></div>
      <div class="breakdown-row"><span>Invoice emails that failed</span><b>${s.invoicesEmailFailed}</b></div>
      ${(s.quotesEmailFailed + s.invoicesEmailFailed) > 0 ? '<div class="file-hint" style="margin-top:8px;">Failed emails still generate the PDF fine \u2014 check your SMTP_USER/SMTP_PASS settings on your host if this keeps happening.</div>' : ''}
    ` : '<div class="empty">No emails attempted yet \u2014 this fills in once a client enters an email on a quote, or you email an invoice.</div>';

    const maxMonth = Math.max(1, ...s.monthlyBookingsTrend.map(m => m.count));
    document.getElementById('trend-chart').innerHTML = s.monthlyBookingsTrend.map(m => `
      <div class="trend-bar-wrap">
        <div class="trend-bar" style="height:${Math.max(4, (m.count / maxMonth) * 100)}%;" title="${m.count} booking${m.count===1?'':'s'}"></div>
        <div class="trend-count">${m.count}</div>
        <div class="trend-label">${esc(m.month)}</div>
      </div>
    `).join('');

    const topN = (arr) => arr.slice(0, 6);
    document.getElementById('breakdown-grid').innerHTML = `
      <div class="breakdown-card"><h3>Bookings by service</h3>${topN(s.bookingsByService).map(x => `<div class="breakdown-row"><span>${esc(x.name)}</span><b>${x.count}</b></div>`).join('') || '<div class="empty">No data yet.</div>'}</div>
      <div class="breakdown-card"><h3>Bookings by county</h3>${topN(s.bookingsByCounty).map(x => `<div class="breakdown-row"><span>${esc(x.name)}</span><b>${x.count}</b></div>`).join('') || '<div class="empty">No data yet.</div>'}</div>
      <div class="breakdown-card"><h3>Quotes by service</h3>${topN(s.quotesByService).map(x => `<div class="breakdown-row"><span>${esc(x.name)}</span><b>${x.count}</b></div>`).join('') || '<div class="empty">No data yet.</div>'}</div>
      <div class="breakdown-card"><h3>Message status</h3>
        <div class="breakdown-row"><span>New</span><b>${s.newMessages}</b></div>
        <div class="breakdown-row"><span>Contacted</span><b>${s.contactedMessages}</b></div>
        <div class="breakdown-row"><span>Done</span><b>${s.doneMessages}</b></div>
      </div>
    `;
  }

  // ================= BOOKINGS =================
  let ALL_BOOKINGS = [];
  function renderBookingsTable(data){
    const el = document.getElementById('bookings-table');
    if(!data.length){ el.innerHTML = '<div class="empty">No matching bookings.</div>'; return; }
    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Date</th><th>Name</th><th>Phone</th><th>Service</th><th>County</th><th>Address</th><th>When</th><th>Callout Fee</th><th>Message</th><th>Status</th></tr></thead>
        <tbody>
          ${data.map(b => `
            <tr>
              <td>${esc(fmtDate(b.createdAt))}</td><td>${esc(b.name)}</td><td>${esc(b.phone)}</td><td>${esc(b.service)}</td>
              <td>${esc(b.county)}</td><td>${esc(b.address)}</td><td>${esc(b.preferredDate)}</td>
              <td>${esc(b.calloutFee)}${b.accommodationLikely ? ' 🏨' : ''}</td><td>${esc(b.message)}</td>
              <td><select class="admin-status-select" data-kind="bookings" data-id="${esc(b.id)}">
                <option value="new" ${b.status==='new'?'selected':''}>New</option>
                <option value="contacted" ${b.status==='contacted'?'selected':''}>Contacted</option>
                <option value="done" ${b.status==='done'?'selected':''}>Done</option>
              </select></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
  async function loadBookings(){
    const { data } = await adminFetch('/api/admin/bookings');
    ALL_BOOKINGS = data || [];
    renderBookingsTable(ALL_BOOKINGS);
  }

  // ================= MESSAGES =================
  let ALL_CONTACT = [];
  function renderContactTable(data){
    const el = document.getElementById('contact-table');
    if(!data.length){ el.innerHTML = '<div class="empty">No matching messages.</div>'; return; }
    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Date</th><th>Name</th><th>Phone</th><th>Email</th><th>Message</th><th>Status</th></tr></thead>
        <tbody>
          ${data.map(m => `
            <tr>
              <td>${esc(fmtDate(m.createdAt))}</td><td>${esc(m.name)}</td><td>${esc(m.phone)}</td><td>${esc(m.email)}</td><td>${esc(m.message)}</td>
              <td><select class="admin-status-select" data-kind="contact" data-id="${esc(m.id)}">
                <option value="new" ${m.status==='new'?'selected':''}>New</option>
                <option value="contacted" ${m.status==='contacted'?'selected':''}>Contacted</option>
                <option value="done" ${m.status==='done'?'selected':''}>Done</option>
              </select></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
  async function loadContact(){
    const { data } = await adminFetch('/api/admin/contact');
    ALL_CONTACT = data || [];
    renderContactTable(ALL_CONTACT);
  }

  function matchesQuery(obj, fields, q){
    if(!q) return true;
    const hay = fields.map(f => (obj[f] || '')).join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }
  document.getElementById('booking-search').addEventListener('input', (e) => {
    renderBookingsTable(ALL_BOOKINGS.filter(b => matchesQuery(b, ['name','phone','service','county','address','message'], e.target.value)));
  });
  document.getElementById('contact-search').addEventListener('input', (e) => {
    renderContactTable(ALL_CONTACT.filter(m => matchesQuery(m, ['name','phone','email','message'], e.target.value)));
  });

  document.addEventListener('change', async (e) => {
    if(!e.target.classList.contains('admin-status-select')) return;
    const kind = e.target.getAttribute('data-kind');
    const id = e.target.getAttribute('data-id');
    await adminFetch(`/api/admin/${kind}/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: e.target.value }) });
    loadStats();
  });

  // ================= QUOTES =================
  async function loadQuotes(){
    const { data } = await adminFetch('/api/admin/quotes');
    const el = document.getElementById('quotes-table');
    if(!data || !data.length){ el.innerHTML = '<div class="empty">No quotes generated yet.</div>'; return; }
    const fmtQuoteTotal = (q) => {
      if (q.totalLow != null && q.totalHigh != null && q.totalLow !== q.totalHigh) {
        return `KSh ${Number(q.totalLow).toLocaleString()} - ${Number(q.totalHigh).toLocaleString()} (est.)`;
      }
      return `KSh ${Number(q.total).toLocaleString()}`;
    };
    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Number</th><th>Client</th><th>Phone</th><th>Total</th><th>Generated</th><th>Valid Until</th><th>PDF</th></tr></thead>
        <tbody>
          ${data.map(q => `
            <tr>
              <td>${esc(q.number)}</td><td>${esc(q.client.name)}</td><td>${esc(q.client.phone)}</td>
              <td>${esc(fmtQuoteTotal(q))}</td><td>${esc(fmtDateShort(q.generatedAt))}</td><td>${esc(fmtDateShort(q.expiresOrDueAt))}</td>
              <td><a class="admin-btn" href="${esc(q.pdfUrl)}" target="_blank">View</a></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  // ================= INVOICES =================
  let invoiceItemRows = 0;
  function addInvoiceItemRow(prefill){
    invoiceItemRows++;
    const wrap = document.createElement('div');
    wrap.className = 'pricing-row';
    wrap.dataset.row = invoiceItemRows;
    wrap.innerHTML = `
      <input type="text" placeholder="Description" class="inv-item-desc" value="${prefill && prefill.description ? esc(prefill.description) : ''}">
      <input type="text" placeholder="Detail (optional)" class="inv-item-detail" value="${prefill && prefill.detail ? esc(prefill.detail) : ''}">
      <input type="number" placeholder="Amount (KSh)" class="inv-item-amount" min="0" value="${prefill && prefill.amount ? prefill.amount : ''}">
      <button type="button" class="row-remove">&times;</button>
    `;
    wrap.querySelector('.row-remove').addEventListener('click', () => wrap.remove());
    document.getElementById('invoice-items').appendChild(wrap);
  }
  document.getElementById('inv-add-item').addEventListener('click', () => addInvoiceItemRow());
  addInvoiceItemRow(); // start with one row

  document.getElementById('invoice-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('invoice-form-msg');
    const items = Array.from(document.querySelectorAll('#invoice-items .pricing-row')).map(row => ({
      description: row.querySelector('.inv-item-desc').value.trim(),
      detail: row.querySelector('.inv-item-detail').value.trim(),
      amount: Number(row.querySelector('.inv-item-amount').value) || 0,
    })).filter(it => it.description);

    if (!items.length) { showMsg(msgEl, false, 'Add at least one line item with a description.'); return; }

    const payload = {
      name: document.getElementById('inv-name').value.trim(),
      phone: document.getElementById('inv-phone').value.trim(),
      email: document.getElementById('inv-email').value.trim(),
      county: document.getElementById('inv-county').value.trim(),
      address: document.getElementById('inv-address').value.trim(),
      notes: document.getElementById('inv-notes').value.trim(),
      items,
    };
    const { ok, data } = await adminFetch('/api/admin/invoices', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!ok) { showMsg(msgEl, false, (data && data.errors && data.errors.join(' ')) || (data && data.error) || 'Something went wrong.'); return; }
    showMsg(msgEl, true, `✓ Invoice ${data.record.number} generated — KSh ${data.record.total.toLocaleString()}. ${data.emailSent ? 'Emailed to client.' : ''}`);
    document.getElementById('invoice-form').reset();
    document.getElementById('invoice-items').innerHTML = '';
    invoiceItemRows = 0;
    addInvoiceItemRow();
    loadInvoices();
    loadStats();
  });

  async function loadInvoices(){
    const { data } = await adminFetch('/api/admin/invoices');
    const el = document.getElementById('invoices-table');
    if(!data || !data.length){ el.innerHTML = '<div class="empty">No invoices yet.</div>'; return; }
    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Number</th><th>Client</th><th>Phone</th><th>Total</th><th>Generated</th><th>Due</th><th>PDF</th><th>Status</th></tr></thead>
        <tbody>
          ${data.map(i => `
            <tr>
              <td>${esc(i.number)}</td><td>${esc(i.client.name)}</td><td>${esc(i.client.phone)}</td>
              <td>KSh ${Number(i.total).toLocaleString()}</td><td>${esc(fmtDateShort(i.generatedAt))}</td><td>${esc(fmtDateShort(i.expiresOrDueAt))}</td>
              <td><a class="admin-btn" href="${esc(i.pdfUrl)}" target="_blank">View</a></td>
              <td><select class="admin-status-select" data-kind="invoices" data-id="${esc(i.id)}">
                <option value="unpaid" ${i.status==='unpaid'?'selected':''}>Unpaid</option>
                <option value="paid" ${i.status==='paid'?'selected':''}>Paid</option>
                <option value="cancelled" ${i.status==='cancelled'?'selected':''}>Cancelled</option>
              </select></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  // ================= SERVICES =================
  let ALL_SERVICES = [];
  let svcPricingRows = 0;
  // Keep in sync with the <select id="svc-preview-style"> options in
  // admin.html and the PREVIEW_STYLES map in public/js/app.js.
  const PREVIEW_STYLE_LABELS = {
    auto: 'Auto (by category)',
    browser: 'Website mockup',
    app: 'App / web-app screen',
    dashboard: 'Support dashboard',
    crm: 'CRM board',
    terminal: 'Deploy / server terminal',
    network: 'Network diagram',
    camera: 'CCTV camera grid',
    receipt: 'POS receipt',
    chat: 'SMS thread',
    cloud: 'Cloud sync',
    diagnostic: 'Hardware diagnostic panel',
    recovery: 'Data recovery progress',
    checklist: 'Install checklist',
    enterprise: 'Multi-site scale diagram',
  };
  function addPricingRow(prefill){
    svcPricingRows++;
    const wrap = document.createElement('div');
    wrap.className = 'pricing-row';
    wrap.innerHTML = `
      <input type="text" placeholder="Label" class="svc-price-label" value="${prefill && prefill.label ? esc(prefill.label) : ''}">
      <input type="text" placeholder="Detail" class="svc-price-detail" value="${prefill && prefill.detail ? esc(prefill.detail) : ''}">
      <input type="text" placeholder="Price (e.g. KSh 1,000)" class="svc-price-amount" value="${prefill && prefill.price ? esc(prefill.price) : ''}">
      <button type="button" class="row-remove">&times;</button>
    `;
    wrap.querySelector('.row-remove').addEventListener('click', () => wrap.remove());
    document.getElementById('svc-pricing-rows').appendChild(wrap);
  }
  document.getElementById('svc-add-pricing').addEventListener('click', () => addPricingRow());

  function resetServiceForm(){
    document.getElementById('service-form').reset();
    document.getElementById('svc-editing-id').value = '';
    document.getElementById('svc-pricing-rows').innerHTML = '';
    document.getElementById('service-form-title').textContent = 'Add a service';
    document.getElementById('svc-submit-btn').textContent = 'Add service';
    document.getElementById('svc-cancel-edit').style.display = 'none';
    addPricingRow();
  }
  resetServiceForm();
  document.getElementById('svc-cancel-edit').addEventListener('click', resetServiceForm);

  function renderServicesList(){
    const el = document.getElementById('services-list');
    if(!ALL_SERVICES.length){ el.innerHTML = '<div class="empty">No services yet.</div>'; return; }
    el.innerHTML = ALL_SERVICES.map(s => `
      <div class="svc-admin-row">
        <div>
          <b>${esc(s.name)}</b>
          <div class="meta">${esc(s.category)} · ${s.pricing.length} pricing tier${s.pricing.length===1?'':'s'} · Preview: ${esc(PREVIEW_STYLE_LABELS[s.previewStyle] || PREVIEW_STYLE_LABELS.auto)}</div>
        </div>
        <div class="admin-toolbar">
          <button class="admin-btn" data-edit-svc="${esc(s.id)}">Edit</button>
          <button class="admin-btn danger" data-delete-svc="${esc(s.id)}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function loadServices(){
    const res = await fetch('/api/services');
    ALL_SERVICES = await res.json();
    renderServicesList();
  }

  document.getElementById('services-list').addEventListener('click', async (e) => {
    const editId = e.target.getAttribute('data-edit-svc');
    const delId = e.target.getAttribute('data-delete-svc');
    if (editId) {
      const s = ALL_SERVICES.find(x => x.id === editId);
      if (!s) return;
      document.getElementById('svc-editing-id').value = s.id;
      document.getElementById('svc-name').value = s.name;
      document.getElementById('svc-category').value = s.category;
      document.getElementById('svc-icon').value = s.icon || '';
      document.getElementById('svc-tagline').value = s.tagline || '';
      document.getElementById('svc-description').value = s.description || '';
      document.getElementById('svc-preview-style').value = s.previewStyle || 'auto';
      document.getElementById('svc-pricing-rows').innerHTML = '';
      (s.pricing || []).forEach(p => addPricingRow(p));
      if (!s.pricing || !s.pricing.length) addPricingRow();
      document.getElementById('service-form-title').textContent = 'Edit service: ' + s.name;
      document.getElementById('svc-submit-btn').textContent = 'Save changes';
      document.getElementById('svc-cancel-edit').style.display = 'inline-block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (delId) {
      const s = ALL_SERVICES.find(x => x.id === delId);
      if (!s) return;
      if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
      const { ok, data } = await adminFetch('/api/admin/services/' + encodeURIComponent(delId), { method: 'DELETE' });
      if (!ok) { alert((data && data.error) || 'Could not delete.'); return; }
      loadServices();
    }
  });

  document.getElementById('service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('service-form-msg');
    const editingId = document.getElementById('svc-editing-id').value;
    const pricing = Array.from(document.querySelectorAll('#svc-pricing-rows .pricing-row')).map(row => ({
      label: row.querySelector('.svc-price-label').value.trim(),
      detail: row.querySelector('.svc-price-detail').value.trim(),
      price: row.querySelector('.svc-price-amount').value.trim(),
    })).filter(p => p.label || p.price);

    const payload = {
      name: document.getElementById('svc-name').value.trim(),
      category: document.getElementById('svc-category').value,
      icon: document.getElementById('svc-icon').value.trim(),
      tagline: document.getElementById('svc-tagline').value.trim(),
      description: document.getElementById('svc-description').value.trim(),
      previewStyle: document.getElementById('svc-preview-style').value,
      pricing,
    };

    const url = editingId ? '/api/admin/services/' + encodeURIComponent(editingId) : '/api/admin/services';
    const method = editingId ? 'PUT' : 'POST';
    const { ok, data } = await adminFetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!ok) { showMsg(msgEl, false, (data && data.error) || 'Something went wrong.'); return; }
    showMsg(msgEl, true, editingId ? '✓ Service updated.' : '✓ Service added.');
    resetServiceForm();
    loadServices();
  });

  // ================= OUR WORK (case studies) =================
  let ALL_CLIENTS = [];

  function resetClientForm(){
    document.getElementById('client-form').reset();
    document.getElementById('cli-editing-id').value = '';
    document.getElementById('client-form-title').textContent = 'Add a case study';
    document.getElementById('cli-submit-btn').textContent = 'Add case study';
    document.getElementById('cli-cancel-edit').style.display = 'none';
  }
  document.getElementById('cli-cancel-edit').addEventListener('click', resetClientForm);

  function renderClientsList(){
    const el = document.getElementById('clients-list');
    if(!ALL_CLIENTS.length){ el.innerHTML = '<div class="empty">No case studies yet.</div>'; return; }
    el.innerHTML = ALL_CLIENTS.map(c => `
      <div class="svc-admin-row">
        <div>
          <b>${esc(c.title)}</b>
          <div class="meta">${esc(c.sector)}${c.service ? ' · ' + esc(c.service) : ''}</div>
        </div>
        <div class="admin-toolbar">
          <button class="admin-btn" data-edit-cli="${esc(c.id)}">Edit</button>
          <button class="admin-btn danger" data-delete-cli="${esc(c.id)}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function loadClients(){
    const res = await fetch('/api/clients');
    ALL_CLIENTS = await res.json();
    renderClientsList();
  }

  document.getElementById('clients-list').addEventListener('click', async (e) => {
    const editId = e.target.getAttribute('data-edit-cli');
    const delId = e.target.getAttribute('data-delete-cli');
    if (editId) {
      const c = ALL_CLIENTS.find(x => x.id === editId);
      if (!c) return;
      document.getElementById('cli-editing-id').value = c.id;
      document.getElementById('cli-sector').value = c.sector || '';
      document.getElementById('cli-service').value = c.service && c.service !== '—' ? c.service : '';
      document.getElementById('cli-title').value = c.title || '';
      document.getElementById('cli-summary').value = c.summary || '';
      document.getElementById('client-form-title').textContent = 'Edit case study';
      document.getElementById('cli-submit-btn').textContent = 'Save changes';
      document.getElementById('cli-cancel-edit').style.display = 'inline-block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (delId) {
      const c = ALL_CLIENTS.find(x => x.id === delId);
      if (!c) return;
      if (!confirm(`Delete "${c.title}"? This can't be undone.`)) return;
      const { ok, data } = await adminFetch('/api/admin/clients/' + delId, { method: 'DELETE' });
      if (!ok) { alert((data && data.error) || 'Could not delete.'); return; }
      loadClients();
    }
  });

  document.getElementById('client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('client-form-msg');
    const editingId = document.getElementById('cli-editing-id').value;
    const payload = {
      sector: document.getElementById('cli-sector').value.trim(),
      service: document.getElementById('cli-service').value.trim(),
      title: document.getElementById('cli-title').value.trim(),
      summary: document.getElementById('cli-summary').value.trim(),
    };
    const url = editingId ? '/api/admin/clients/' + editingId : '/api/admin/clients';
    const method = editingId ? 'PUT' : 'POST';
    const { ok, data } = await adminFetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!ok) { showMsg(msgEl, false, (data && data.error) || 'Something went wrong.'); return; }
    showMsg(msgEl, true, editingId ? '✓ Case study updated.' : '✓ Case study added.');
    resetClientForm();
    loadClients();
  });

  // ================= FAQ =================
  let ALL_FAQ = [];

  function resetFaqForm(){
    document.getElementById('faq-form').reset();
    document.getElementById('faq-editing-id').value = '';
    document.getElementById('faq-form-title').textContent = 'Add a question';
    document.getElementById('faq-submit-btn').textContent = 'Add question';
    document.getElementById('faq-cancel-edit').style.display = 'none';
  }
  document.getElementById('faq-cancel-edit').addEventListener('click', resetFaqForm);

  function renderFaqList(){
    const el = document.getElementById('faq-list');
    if(!ALL_FAQ.length){ el.innerHTML = '<div class="empty">No questions yet.</div>'; return; }
    el.innerHTML = ALL_FAQ.map((f, i) => `
      <div class="svc-admin-row">
        <div>
          <b>${esc(f.q)}</b>
          <div class="meta">${esc(f.a.slice(0, 90))}${f.a.length > 90 ? '…' : ''}</div>
        </div>
        <div class="admin-toolbar">
          <button class="admin-btn" data-move-faq-up="${esc(f.id)}" ${i===0?'disabled':''}>↑</button>
          <button class="admin-btn" data-move-faq-down="${esc(f.id)}" ${i===ALL_FAQ.length-1?'disabled':''}>↓</button>
          <button class="admin-btn" data-edit-faq="${esc(f.id)}">Edit</button>
          <button class="admin-btn danger" data-delete-faq="${esc(f.id)}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function loadFaq(){
    const res = await fetch('/api/faq');
    ALL_FAQ = await res.json();
    renderFaqList();
  }

  async function saveFaqOrder(){
    await adminFetch('/api/admin/faq/reorder', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ order: ALL_FAQ.map(f => f.id) }) });
  }

  document.getElementById('faq-list').addEventListener('click', async (e) => {
    const editId = e.target.getAttribute('data-edit-faq');
    const delId = e.target.getAttribute('data-delete-faq');
    const upId = e.target.getAttribute('data-move-faq-up');
    const downId = e.target.getAttribute('data-move-faq-down');

    if (editId) {
      const f = ALL_FAQ.find(x => x.id === editId);
      if (!f) return;
      document.getElementById('faq-editing-id').value = f.id;
      document.getElementById('faq-q').value = f.q;
      document.getElementById('faq-a').value = f.a;
      document.getElementById('faq-form-title').textContent = 'Edit question';
      document.getElementById('faq-submit-btn').textContent = 'Save changes';
      document.getElementById('faq-cancel-edit').style.display = 'inline-block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (delId) {
      const f = ALL_FAQ.find(x => x.id === delId);
      if (!f) return;
      if (!confirm(`Delete "${f.q}"?`)) return;
      const { ok, data } = await adminFetch('/api/admin/faq/' + delId, { method: 'DELETE' });
      if (!ok) { alert((data && data.error) || 'Could not delete.'); return; }
      loadFaq();
    }
    if (upId) {
      const idx = ALL_FAQ.findIndex(x => x.id === upId);
      if (idx > 0) {
        [ALL_FAQ[idx - 1], ALL_FAQ[idx]] = [ALL_FAQ[idx], ALL_FAQ[idx - 1]];
        renderFaqList();
        saveFaqOrder();
      }
    }
    if (downId) {
      const idx = ALL_FAQ.findIndex(x => x.id === downId);
      if (idx < ALL_FAQ.length - 1) {
        [ALL_FAQ[idx + 1], ALL_FAQ[idx]] = [ALL_FAQ[idx], ALL_FAQ[idx + 1]];
        renderFaqList();
        saveFaqOrder();
      }
    }
  });

  document.getElementById('faq-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('faq-form-msg');
    const editingId = document.getElementById('faq-editing-id').value;
    const payload = {
      q: document.getElementById('faq-q').value.trim(),
      a: document.getElementById('faq-a').value.trim(),
    };
    const url = editingId ? '/api/admin/faq/' + editingId : '/api/admin/faq';
    const method = editingId ? 'PUT' : 'POST';
    const { ok, data } = await adminFetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!ok) { showMsg(msgEl, false, (data && data.error) || 'Something went wrong.'); return; }
    showMsg(msgEl, true, editingId ? '✓ Question updated.' : '✓ Question added.');
    resetFaqForm();
    loadFaq();
  });

  // ================= PARTNERS =================
  let ALL_PARTNERS = [];
  let pendingLogoDataUri = '';

  document.getElementById('ptr-logo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const hint = document.getElementById('ptr-logo-hint');
    pendingLogoDataUri = '';
    if (!file) { hint.textContent = ''; return; }
    if (file.size > 2 * 1024 * 1024) {
      hint.textContent = 'That file is over 2MB — please choose a smaller image.';
      hint.style.color = '#B91C1C';
      e.target.value = '';
      return;
    }
    hint.style.color = 'var(--slate)';
    hint.textContent = 'Selected: ' + file.name;
    const reader = new FileReader();
    reader.onload = () => { pendingLogoDataUri = reader.result; };
    reader.readAsDataURL(file);
  });

  function resetPartnerForm(){
    document.getElementById('partner-form').reset();
    document.getElementById('ptr-editing-id').value = '';
    document.getElementById('partner-form-title').textContent = 'Add a partner';
    document.getElementById('ptr-submit-btn').textContent = 'Add partner';
    document.getElementById('ptr-cancel-edit').style.display = 'none';
    document.getElementById('ptr-logo-hint').textContent = '';
    pendingLogoDataUri = '';
  }
  document.getElementById('ptr-cancel-edit').addEventListener('click', resetPartnerForm);

  function renderPartnersGrid(){
    const el = document.getElementById('partners-grid');
    if(!ALL_PARTNERS.length){ el.innerHTML = '<div class="empty">No partners yet.</div>'; return; }
    el.innerHTML = ALL_PARTNERS.map(p => `
      <div class="partner-admin-card">
        ${p.logoUrl ? `<img src="${esc(p.logoUrl)}" alt="${esc(p.name)}">` : `<div class="logo-placeholder">No logo</div>`}
        <h4>${esc(p.name)}</h4>
        <div class="cat">${esc(p.category || '')}</div>
        <div class="actions">
          <button class="admin-btn" data-edit-ptr="${esc(p.id)}">Edit</button>
          <button class="admin-btn danger" data-delete-ptr="${esc(p.id)}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function loadPartners(){
    const res = await fetch('/api/partners');
    ALL_PARTNERS = await res.json();
    renderPartnersGrid();
  }

  document.getElementById('partners-grid').addEventListener('click', async (e) => {
    const editId = e.target.getAttribute('data-edit-ptr');
    const delId = e.target.getAttribute('data-delete-ptr');
    if (editId) {
      const p = ALL_PARTNERS.find(x => x.id === editId);
      if (!p) return;
      document.getElementById('ptr-editing-id').value = p.id;
      document.getElementById('ptr-name').value = p.name;
      document.getElementById('ptr-category').value = p.category || '';
      document.getElementById('ptr-description').value = p.description || '';
      document.getElementById('ptr-url').value = p.url || '';
      document.getElementById('partner-form-title').textContent = 'Edit partner: ' + p.name;
      document.getElementById('ptr-submit-btn').textContent = 'Save changes';
      document.getElementById('ptr-cancel-edit').style.display = 'inline-block';
      pendingLogoDataUri = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (delId) {
      const p = ALL_PARTNERS.find(x => x.id === delId);
      if (!p) return;
      if (!confirm(`Delete partner "${p.name}"?`)) return;
      const { ok, data } = await adminFetch('/api/admin/partners/' + delId, { method: 'DELETE' });
      if (!ok) { alert((data && data.error) || 'Could not delete.'); return; }
      loadPartners();
    }
  });

  document.getElementById('partner-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('partner-form-msg');
    const editingId = document.getElementById('ptr-editing-id').value;
    const payload = {
      name: document.getElementById('ptr-name').value.trim(),
      category: document.getElementById('ptr-category').value.trim(),
      description: document.getElementById('ptr-description').value.trim(),
      url: document.getElementById('ptr-url').value.trim(),
    };
    if (pendingLogoDataUri) payload.logoDataUri = pendingLogoDataUri;

    const url = editingId ? '/api/admin/partners/' + editingId : '/api/admin/partners';
    const method = editingId ? 'PUT' : 'POST';
    const { ok, data } = await adminFetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!ok) { showMsg(msgEl, false, (data && data.error) || 'Something went wrong.'); return; }
    showMsg(msgEl, true, editingId ? '✓ Partner updated.' : '✓ Partner added.');
    resetPartnerForm();
    loadPartners();
  });

  // ================= SETTINGS =================
  async function loadSettings(){
    const { data: s } = await adminFetch('/api/admin/settings');
    if (!s) return;
    document.getElementById('set-phone1').value = s.phone1 || '';
    document.getElementById('set-phone2').value = s.phone2 || '';
    document.getElementById('set-email').value = s.email || '';
    document.getElementById('set-wa1').value = s.whatsappNumber || '';
    const soc = s.socials || {};
    document.getElementById('set-facebook').value = soc.facebook || '';
    document.getElementById('set-instagram').value = soc.instagram || '';
    document.getElementById('set-twitter').value = soc.twitter || '';
    document.getElementById('set-linkedin').value = soc.linkedin || '';
    document.getElementById('set-tiktok').value = soc.tiktok || '';
    document.getElementById('set-youtube').value = soc.youtube || '';
    const pay = s.payment || {};
    document.getElementById('set-till').value = pay.mpesaTill || '';
    document.getElementById('set-paybill').value = pay.mpesaPaybill || '';
    document.getElementById('set-account').value = pay.mpesaAccount || '';
    document.getElementById('set-cheque').value = pay.chequePayable || '';
    document.getElementById('set-quote-days').value = s.quoteValidityDays || 14;
    document.getElementById('set-invoice-days').value = s.invoiceDueDays || 7;
  }

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('settings-form-msg');
    const payload = {
      phone1: document.getElementById('set-phone1').value.trim(),
      phone2: document.getElementById('set-phone2').value.trim(),
      email: document.getElementById('set-email').value.trim(),
      whatsappNumber: document.getElementById('set-wa1').value.trim(),
      socials: {
        facebook: document.getElementById('set-facebook').value.trim(),
        instagram: document.getElementById('set-instagram').value.trim(),
        twitter: document.getElementById('set-twitter').value.trim(),
        linkedin: document.getElementById('set-linkedin').value.trim(),
        tiktok: document.getElementById('set-tiktok').value.trim(),
        youtube: document.getElementById('set-youtube').value.trim(),
      },
      payment: {
        mpesaTill: document.getElementById('set-till').value.trim(),
        mpesaPaybill: document.getElementById('set-paybill').value.trim(),
        mpesaAccount: document.getElementById('set-account').value.trim(),
        chequePayable: document.getElementById('set-cheque').value.trim(),
      },
      quoteValidityDays: Number(document.getElementById('set-quote-days').value) || 14,
      invoiceDueDays: Number(document.getElementById('set-invoice-days').value) || 7,
    };
    const { ok, data } = await adminFetch('/api/admin/settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!ok) { showMsg(msgEl, false, (data && data.error) || 'Something went wrong.'); return; }
    showMsg(msgEl, true, '✓ Settings saved.');
  });

  // ---------- initial load ----------
  loadStats();
  loadBookings();
  loadContact();
  loadQuotes();
  loadInvoices();
  loadServices();
  loadClients();
  loadFaq();
  loadPartners();
  loadSettings();
