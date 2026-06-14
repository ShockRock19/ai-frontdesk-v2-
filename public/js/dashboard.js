// AI Front-Desk v2 — Supercharged Dashboard JS
const App = (() => {
  let businesses = [];
  let currentId  = null;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmtDate = (s) => s ? new Date(s).toLocaleString() : '—';
  const fmtDateShort = (s) => s ? new Date(s).toLocaleDateString() : '—';
  const sentimentLabel = (v) => v == null ? '—' : v > 0.3 ? '😊 Positive' : v < -0.3 ? '😟 Negative' : '😐 Neutral';

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) { window.location.href = '/login.html'; return null; }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.status === 204 ? null : res.json();
  }

  function toast(msg, color = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.style.borderColor = color || '';
    t.style.color = color || '';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  // ---- NAV ----
  function bindNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        const tab = item.dataset.tab;
        $('#panel-' + tab).classList.add('active');
        // Lazy load on click
        const loaders = { leads: loadLeads, appointments: loadAppointments, conversations: loadConversations, customers: loadCustomers, usage: loadUsage, blocklist: loadBlocklist };
        if (loaders[tab]) loaders[tab]();
      });
    });
  }

  // ---- BOOT ----
  async function init() {
    bindNav();
    businesses = (await api('/businesses')) || [];
    if (!businesses.length) {
      businesses = [await api('/businesses', { method: 'POST', body: { name: 'My Business' } })];
    }
    currentId = businesses[0].id;
    renderSwitch();
    await loadCurrent();
    $('#bizSwitch').addEventListener('change', async (e) => { currentId = e.target.value; await loadCurrent(); });
  }

  function renderSwitch() {
    $('#bizSwitch').innerHTML = businesses.map(b =>
      `<option value="${b.id}" ${b.id === currentId ? 'selected' : ''}>${esc(b.name)}</option>`
    ).join('');
  }

  async function loadCurrent() {
    const biz = businesses.find(b => b.id === currentId);
    fillForm(biz);
    renderConnect(biz);
    renderHoursGrid(biz);
    await Promise.all([loadStats(), loadLeads(), loadAppointments(), loadConversations(), loadCustomers(), loadOverviewCards()]);
  }

  // ---- SETTINGS ----
  function fillForm(biz) {
    document.querySelectorAll('#bizForm [data-f]').forEach(el => { el.value = biz[el.dataset.f] ?? ''; });
  }

  async function saveBusiness() {
    const body = {};
    document.querySelectorAll('#bizForm [data-f]').forEach(el => { body[el.dataset.f] = el.value; });
    const updated = await api('/businesses/' + currentId, { method: 'PUT', body });
    businesses = businesses.map(b => b.id === currentId ? updated : b);
    renderSwitch();
    flash('savedFlash');
    toast('Profile saved', 'var(--green)');
  }

  async function newBusiness() {
    const name = prompt('Name for the new business?');
    if (!name) return;
    const biz = await api('/businesses', { method: 'POST', body: { name } });
    businesses.push(biz);
    currentId = biz.id;
    renderSwitch();
    await loadCurrent();
  }

  async function deleteBusiness() {
    if (businesses.length <= 1) return alert('Keep at least one business.');
    if (!confirm('Delete this business? Cannot be undone.')) return;
    await api('/businesses/' + currentId, { method: 'DELETE' });
    businesses = businesses.filter(b => b.id !== currentId);
    currentId = businesses[0].id;
    renderSwitch();
    await loadCurrent();
  }

  // ---- BUSINESS HOURS ----
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let hoursData = {};

  function renderHoursGrid(biz) {
    let parsed = [];
    try { parsed = JSON.parse(biz.business_hours || '[]'); } catch {}
    hoursData = {};
    parsed.forEach(h => { hoursData[h.day] = { open: h.open, close: h.close }; });
    $('#hoursGrid').innerHTML = DAYS.map(day => {
      const h = hoursData[day] || {};
      return `<div class="hour-day">
        <div class="day-name">${day}</div>
        <input id="ho-${day}" value="${h.open||''}" placeholder="09:00" title="Open"/>
        <input id="hc-${day}" value="${h.close||''}" placeholder="17:00" title="Close"/>
      </div>`;
    }).join('');
  }

  async function saveHours() {
    const hours = DAYS.map(day => ({
      day, open: $(`#ho-${day}`).value.trim(), close: $(`#hc-${day}`).value.trim()
    })).filter(h => h.open && h.close);
    const body = {};
    document.querySelectorAll('#bizForm [data-f]').forEach(el => { body[el.dataset.f] = el.value; });
    body.business_hours = JSON.stringify(hours);
    await api('/businesses/' + currentId, { method: 'PUT', body });
    businesses = businesses.map(b => b.id === currentId ? { ...b, business_hours: body.business_hours } : b);
    flash('hoursFlash');
    toast('Hours saved', 'var(--green)');
  }

  // ---- STATS / OVERVIEW ----
  async function loadStats() {
    const s = (await api(`/businesses/${currentId}/stats`)) || {};
    const sentColor = s.avgSentiment == null ? 'var(--ink2)' : s.avgSentiment > 0.2 ? 'var(--green)' : s.avgSentiment < -0.2 ? 'var(--red)' : 'var(--amber)';
    $('#tiles').innerHTML = [
      ['🔥', s.qualifiedLeads ?? 0, 'Qualified leads', `${s.newLeadsToday ?? 0} today`, 'accent'],
      ['📅', s.appointments ?? 0, 'Appointments', `${s.todayAppointments ?? 0} today`, ''],
      ['💬', s.conversations ?? 0, 'Conversations', `${s.todayConversations ?? 0} today`, ''],
      ['😊', s.avgSentiment != null ? (s.avgSentiment > 0 ? '+' : '') + s.avgSentiment.toFixed(2) : '—', 'Avg sentiment', s.avgSentiment != null ? sentimentLabel(s.avgSentiment) : 'No data yet', ''],
    ].map(([icon, val, label, sub, cls]) =>
      `<div class="tile ${cls}"><div class="tile-val">${icon} ${esc(String(val))}</div><div class="tile-label">${label}</div><div class="tile-sub">${sub}</div></div>`
    ).join('');
    // Update badge
    const bl = document.getElementById('badge-leads');
    if (bl) bl.textContent = s.qualifiedLeads ?? 0;
  }

  async function loadOverviewCards() {
    // Today activity
    const convs = (await api(`/businesses/${currentId}/conversations`)) || [];
    const today = new Date().toISOString().substring(0, 10);
    const todayConvs = convs.filter(c => c.created_at?.startsWith(today));
    $('#todayActivity').innerHTML = todayConvs.length
      ? `<table><thead><tr><th>Channel</th><th>Status</th><th>Started</th><th>Outcome</th></tr></thead><tbody>${
          todayConvs.slice(0, 8).map(c =>
            `<tr><td><span class="badge ${c.channel}">${c.channel}</span></td>
            <td>${c.status}</td><td>${fmtDate(c.created_at)}</td>
            <td>${c.outcome || '—'}</td></tr>`
          ).join('')
        }</tbody></table>`
      : '<div class="empty">No conversations today yet.</div>';

    // Lead pipeline
    const leads = (await api(`/businesses/${currentId}/leads`)) || [];
    const hotLeads = leads.filter(l => l.qualified).slice(0, 6);
    $('#leadPipeline').innerHTML = hotLeads.length
      ? hotLeads.map(l =>
          `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
            <div>
              <div style="font-size:13px;font-weight:600;">${esc(l.customer_name || 'Unknown')}</div>
              <div style="font-size:11px;color:var(--ink2);">${esc(l.summary)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:var(--mono);font-size:13px;color:var(--violet);">${l.score}/100</div>
              <span class="badge ${l.status}">${l.status}</span>
            </div>
          </div>`
        ).join('')
      : '<div class="empty">No qualified leads yet.</div>';
  }

  // ---- LEADS ----
  async function loadLeads() {
    const leads = (await api(`/businesses/${currentId}/leads`)) || [];
    if (!leads.length) return ($('#leadsTable').innerHTML = '<div class="empty">No leads yet — they appear as the agent talks to people.</div>');
    $('#leadsTable').innerHTML = `<table><thead><tr>
      <th>Contact</th><th>Score</th><th>Summary</th><th>Channel</th><th>Status</th><th>Follow-up</th><th>When</th><th></th>
    </tr></thead><tbody>${leads.map(l => `
      <tr>
        <td><strong>${esc(l.customer_name || '—')}</strong><br/><span style="font-size:11px;color:var(--ink2);">${esc(l.customer_phone || l.customer_email || '')}</span></td>
        <td>
          <div class="score-bar">
            <div class="score-fill" style="width:${(l.score||0)*0.6}px"></div>
            <span style="font-family:var(--mono);font-size:12px;">${l.score}</span>
          </div>
          <span class="badge ${l.qualified ? 'qualified' : 'unqualified'}">${l.qualified ? 'Qualified' : 'Unqualified'}</span>
        </td>
        <td style="max-width:240px;font-size:12px;color:var(--ink2);">${esc(l.summary)}</td>
        <td><span class="badge ${l.source_channel||'webchat'}">${l.source_channel||'—'}</span></td>
        <td>
          <select onchange="App.setLeadStatus('${l.id}',this.value)" style="background:var(--surface);border:1px solid var(--border2);color:var(--ink);font-family:inherit;font-size:11px;padding:3px 6px;border-radius:4px;outline:none;">
            ${['new','contacted','won','lost'].map(s => `<option value="${s}" ${s===l.status?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><input type="date" value="${l.follow_up_at||''}" onchange="App.setLeadFollowup('${l.id}',this.value)"
          style="background:var(--surface);border:1px solid var(--border2);color:var(--ink);font-family:inherit;font-size:11px;padding:3px 6px;border-radius:4px;outline:none;"/></td>
        <td style="font-size:11px;color:var(--ink2);font-family:var(--mono);">${fmtDateShort(l.created_at)}</td>
        <td><button class="btn ghost small" onclick="App.openConv('${l.conversation_id}')">Transcript</button></td>
      </tr>`).join('')}</tbody></table>`;
  }

  async function setLeadStatus(id, status) {
    await api(`/leads/${id}/status`, { method: 'PUT', body: { status } });
    toast(`Lead → ${status}`, 'var(--violet)');
  }

  async function setLeadFollowup(id, date) {
    await api(`/leads/${id}/followup`, { method: 'PUT', body: { follow_up_at: date || null } });
    toast('Follow-up set', 'var(--green)');
  }

  // ---- APPOINTMENTS ----
  async function loadAppointments() {
    const appts = (await api(`/businesses/${currentId}/appointments`)) || [];
    if (!appts.length) return ($('#apptTable').innerHTML = '<div class="empty">No upcoming appointments.</div>');
    $('#apptTable').innerHTML = `<table><thead><tr>
      <th>Date/Time</th><th>Service</th><th>Duration</th><th>Channel</th><th>Notes</th><th>Reminder</th><th></th>
    </tr></thead><tbody>${appts.map(a => `
      <tr>
        <td style="font-family:var(--mono);font-size:12px;">${fmtDate(a.starts_at)}</td>
        <td>${esc(a.service||'—')}</td>
        <td>${a.duration_min} min</td>
        <td><span class="badge ${a.source_channel||'webchat'}">${a.source_channel||'—'}</span></td>
        <td style="font-size:12px;color:var(--ink2);">${esc(a.notes||'—')}</td>
        <td style="font-size:12px;">${a.reminder_sent ? '✅ Sent' : '⏳ Pending'}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn ghost small" onclick="App.reschedule('${a.id}')">Reschedule</button>
          <button class="btn danger ghost small" onclick="App.cancelAppt('${a.id}')">Cancel</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
  }

  async function cancelAppt(id) {
    if (!confirm('Cancel this appointment?')) return;
    await api(`/appointments/${id}`, { method: 'DELETE' });
    toast('Appointment cancelled', 'var(--red)');
    loadAppointments();
    loadStats();
  }

  async function reschedule(id) {
    const dt = prompt('New date/time (ISO 8601, e.g. 2026-07-01T10:00:00-04:00):');
    if (!dt) return;
    await api(`/appointments/${id}/reschedule`, { method: 'PUT', body: { starts_at: dt } });
    toast('Rescheduled', 'var(--amber)');
    loadAppointments();
  }

  // ---- CONVERSATIONS ----
  async function loadConversations() {
    const convs = (await api(`/businesses/${currentId}/conversations`)) || [];
    if (!convs.length) return ($('#convTable').innerHTML = '<div class="empty">No conversations yet.</div>');
    $('#convTable').innerHTML = `<table><thead><tr>
      <th>Channel</th><th>Customer</th><th>Status</th><th>Outcome</th><th>Sentiment</th><th>Started</th><th></th>
    </tr></thead><tbody>${convs.map(c => `
      <tr>
        <td><span class="badge ${c.channel}">${c.channel}</span></td>
        <td style="font-size:12px;">${esc(c.external_id||'—')}</td>
        <td>${c.status}</td>
        <td style="font-size:12px;color:var(--ink2);">${c.outcome||'—'}</td>
        <td style="font-size:12px;">${sentimentLabel(c.sentiment)}</td>
        <td style="font-size:11px;color:var(--ink2);font-family:var(--mono);">${fmtDate(c.created_at)}</td>
        <td><button class="btn ghost small clickable" onclick="App.openConv('${c.id}')">View</button></td>
      </tr>`).join('')}</tbody></table>`;
  }

  async function openConv(id) {
    if (!id) return;
    const msgs = (await api(`/conversations/${id}/messages`)) || [];
    const drawer = $('#drawer');
    $('#transcriptMeta').textContent = `Conversation ${id} · ${msgs.length} messages`;
    $('#transcript').innerHTML = msgs.map(m =>
      `<div style="display:flex;flex-direction:column;align-items:${m.role==='user'?'flex-end':'flex-start'};">
        <div class="msg ${m.role}">${esc(m.content)}</div>
        <div class="msg-time">${m.role} · ${fmtDate(m.created_at)}</div>
      </div>`
    ).join('');
    drawer.classList.add('open');
  }

  function closeDrawer() { $('#drawer').classList.remove('open'); }

  // ---- CUSTOMERS ----
  async function loadCustomers() {
    const custs = (await api(`/businesses/${currentId}/customers`)) || [];
    if (!custs.length) return ($('#custTable').innerHTML = '<div class="empty">No customers yet.</div>');
    $('#custTable').innerHTML = `<table><thead><tr>
      <th>Name</th><th>Phone</th><th>Email</th><th>Tags</th><th>Appointments</th><th>Notes</th><th>Since</th>
    </tr></thead><tbody>${custs.map(c => `
      <tr>
        <td><strong>${esc(c.name||'—')}</strong></td>
        <td style="font-family:var(--mono);font-size:12px;">${esc(c.phone||'—')}</td>
        <td style="font-size:12px;">${esc(c.email||'—')}</td>
        <td style="font-size:11px;">${(c.tags||'').split(',').filter(Boolean).map(t=>`<span class="badge new" style="margin-right:3px;">${esc(t.trim())}</span>`).join('')||'—'}</td>
        <td style="font-family:var(--mono);text-align:center;">${c.total_appointments||0}</td>
        <td style="font-size:12px;color:var(--ink2);max-width:200px;">${esc((c.notes||'').substring(0,80))}${c.notes?.length>80?'…':''}</td>
        <td style="font-size:11px;color:var(--ink2);font-family:var(--mono);">${fmtDateShort(c.created_at)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  // ---- USAGE ----
  async function loadUsage() {
    const data = (await api(`/businesses/${currentId}/usage`)) || {};
    const { rows = [], totals = {}, estimatedCostUSD = 0 } = data;
    const maxConvs = Math.max(...rows.map(r => r.conversations), 1);
    $('#usageContent').innerHTML = `
      <div class="usage-summary">
        <div class="usage-box"><div class="usage-box-val" style="color:var(--violet);">${(totals.conversations||0).toLocaleString()}</div><div class="usage-box-label">Conversations (30d)</div></div>
        <div class="usage-box"><div class="usage-box-val" style="color:var(--cyan);">${((totals.input_tokens||0)+(totals.output_tokens||0)).toLocaleString()}</div><div class="usage-box-label">Total tokens</div></div>
        <div class="usage-box"><div class="usage-box-val" style="color:var(--green);">$${estimatedCostUSD.toFixed(2)}</div><div class="usage-box-label">Est. API cost</div></div>
      </div>
      <div style="margin-bottom:8px;font-size:11px;color:var(--ink2);font-family:var(--mono);">Conversations per day — last 30 days</div>
      <div class="usage-bars">${rows.map(r => {
        const h = Math.max(4, Math.round((r.conversations / maxConvs) * 52));
        return `<div class="usage-bar" style="height:${h}px;background:var(--violet);" title="${r.date}: ${r.conversations} conversations, ${r.input_tokens+r.output_tokens} tokens"></div>`;
      }).join('')}</div>
      ${rows.length === 0 ? '<div class="empty">No usage data yet. Conversations will appear here once the agent starts handling calls.</div>' : ''}`;
  }

  // ---- BLOCKLIST ----
  async function loadBlocklist() {
    const rows = (await api(`/businesses/${currentId}/blocklist`)) || [];
    if (!rows.length) return ($('#blockTable').innerHTML = '<div class="empty">No blocked contacts.</div>');
    $('#blockTable').innerHTML = `<table><thead><tr><th>Phone</th><th>Email</th><th>Reason</th><th>Added</th><th></th></tr></thead><tbody>${
      rows.map(r => `<tr>
        <td style="font-family:var(--mono);font-size:12px;">${esc(r.phone||'—')}</td>
        <td style="font-size:12px;">${esc(r.email||'—')}</td>
        <td style="font-size:12px;color:var(--ink2);">${esc(r.reason||'—')}</td>
        <td style="font-size:11px;color:var(--ink2);font-family:var(--mono);">${fmtDateShort(r.created_at)}</td>
        <td><button class="btn danger ghost small" onclick="App.removeBlock('${r.id}')">Remove</button></td>
      </tr>`).join('')
    }</tbody></table>`;
  }

  async function addBlock() {
    const phone = $('#blockPhone').value.trim();
    const email = $('#blockEmail').value.trim();
    const reason = $('#blockReason').value.trim();
    if (!phone && !email) return toast('Enter a phone or email', 'var(--red)');
    await api(`/businesses/${currentId}/blocklist`, { method: 'POST', body: { phone, email, reason } });
    $('#blockPhone').value = $('#blockEmail').value = $('#blockReason').value = '';
    toast('Blocked', 'var(--red)');
    loadBlocklist();
  }

  async function removeBlock(id) {
    await api(`/blocklist/${id}`, { method: 'DELETE' });
    toast('Removed from blocklist', 'var(--green)');
    loadBlocklist();
  }

  // ---- CONNECT ----
  function renderConnect(biz) {
    const base = window.location.origin;
    const bid = biz?.id || '...';
    $('#connectInfo').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink2);margin-bottom:8px;">VOICE WEBHOOK (Twilio)</div>
          <div class="code-block">${base}/voice/incoming<button class="copy-btn" onclick="navigator.clipboard.writeText('${base}/voice/incoming');App.toast('Copied!')">Copy</button></div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink2);margin-bottom:8px;">VOICE STATUS CALLBACK (Twilio)</div>
          <div class="code-block">${base}/voice/status<button class="copy-btn" onclick="navigator.clipboard.writeText('${base}/voice/status');App.toast('Copied!')">Copy</button></div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink2);margin-bottom:8px;">SMS WEBHOOK (Twilio)</div>
          <div class="code-block">${base}/sms/incoming<button class="copy-btn" onclick="navigator.clipboard.writeText('${base}/sms/incoming');App.toast('Copied!')">Copy</button></div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink2);margin-bottom:8px;">WEB CHAT EMBED</div>
          <div class="code-block">&lt;script src="${base}/js/widget-embed.js" data-business="${bid}"&gt;&lt;/script&gt;<button class="copy-btn" onclick="navigator.clipboard.writeText('<script src=&quot;${base}/js/widget-embed.js&quot; data-business=&quot;${bid}&quot;></script>');App.toast('Copied!')">Copy</button></div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink2);margin-bottom:8px;">TEST WEB CHAT</div>
          <a href="/widget.html?business=${bid}" target="_blank" class="btn primary small">Open test chat →</a>
        </div>
      </div>`;
  }

  // ---- UTILS ----
  function flash(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  }

  async function logout() { window.location.href = '/auth/logout'; }

  async function changePassword() {
    const pw = $('#newPass').value;
    if (!pw || pw.length < 8) return toast('Min 8 characters', 'var(--red)');
    await api('/account/password', { method: 'POST', body: { password: pw } });
    $('#newPass').value = '';
    flash('pwFlash');
    toast('Password updated', 'var(--green)');
  }

  // Public API
  return {
    init, saveBusiness, newBusiness, deleteBusiness, saveHours,
    setLeadStatus, setLeadFollowup, cancelAppt, reschedule,
    openConv, closeDrawer, addBlock, removeBlock, changePassword, logout, toast,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init().catch(console.error));
