import express from 'express';
import { Business } from '../models/business.js';
import { Conversation, Message } from '../models/conversation.js';
import { Customer, Appointment, Lead } from '../models/customer.js';
import { changePassword } from '../auth/index.js';
import { getUsageSummary } from '../db/usage.js';
import db from '../db/index.js';

const router = express.Router();

// ---- Businesses ----
router.get('/businesses', (req, res) => res.json(Business.list()));
router.post('/businesses', (req, res) => res.status(201).json(Business.create(req.body || {})));
router.get('/businesses/:id', (req, res) => {
  const biz = Business.get(req.params.id);
  if (!biz) return res.status(404).json({ error: 'not_found' });
  res.json(biz);
});
router.put('/businesses/:id', (req, res) => {
  const biz = Business.update(req.params.id, req.body || {});
  if (!biz) return res.status(404).json({ error: 'not_found' });
  res.json(biz);
});
router.delete('/businesses/:id', (req, res) => {
  Business.remove(req.params.id);
  res.json({ ok: true });
});

// ---- Leads ----
router.get('/businesses/:id/leads', (req, res) => res.json(Lead.list(req.params.id)));
router.put('/leads/:id/status', (req, res) => {
  Lead.setStatus(req.params.id, (req.body || {}).status || 'new');
  res.json({ ok: true });
});
// NEW: Update follow_up_at
router.put('/leads/:id/followup', (req, res) => {
  db.prepare('UPDATE leads SET follow_up_at = ?, updated_at = datetime("now") WHERE id = ?').run((req.body || {}).follow_up_at || null, req.params.id);
  res.json({ ok: true });
});

// ---- Appointments ----
router.get('/businesses/:id/appointments', (req, res) => res.json(Appointment.list(req.params.id)));
router.delete('/appointments/:id', (req, res) => {
  Appointment.cancel(req.params.id);
  res.json({ ok: true });
});
// NEW: Reschedule endpoint
router.put('/appointments/:id/reschedule', (req, res) => {
  const { starts_at, duration_min } = req.body || {};
  if (!starts_at) return res.status(400).json({ error: 'starts_at required' });
  db.prepare('UPDATE appointments SET starts_at = ?, duration_min = COALESCE(?, duration_min), reschedule_count = reschedule_count + 1, reminder_sent = 0, updated_at = datetime("now") WHERE id = ?')
    .run(starts_at, duration_min || null, req.params.id);
  res.json({ ok: true });
});

// ---- Customers ----
router.get('/businesses/:id/customers', (req, res) => res.json(Customer.list(req.params.id)));
router.get('/customers/:id', (req, res) => {
  const c = Customer.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  res.json(c);
});

// ---- Conversations ----
router.get('/businesses/:id/conversations', (req, res) => res.json(Conversation.list(req.params.id)));
router.get('/conversations/:id/messages', (req, res) => res.json(Message.list(req.params.id)));

// ---- Stats (dashboard header tiles) ----
router.get('/businesses/:id/stats', (req, res) => {
  const id = req.params.id;
  const count = (sql, ...p) => db.prepare(sql).get(id, ...p).n;

  // NEW: richer stats including today's counts and sentiment avg
  const todayStr = new Date().toISOString().substring(0, 10);
  const avgSentiment = db.prepare(
    "SELECT AVG(sentiment) avg FROM conversations WHERE business_id = ? AND sentiment IS NOT NULL"
  ).get(id).avg;

  res.json({
    leads:              count('SELECT COUNT(*) n FROM leads WHERE business_id = ?'),
    qualifiedLeads:     count('SELECT COUNT(*) n FROM leads WHERE business_id = ? AND qualified = 1'),
    appointments:       count("SELECT COUNT(*) n FROM appointments WHERE business_id = ? AND status = 'scheduled'"),
    conversations:      count('SELECT COUNT(*) n FROM conversations WHERE business_id = ?'),
    todayConversations: count("SELECT COUNT(*) n FROM conversations WHERE business_id = ? AND date(created_at) = ?", todayStr),
    todayAppointments:  count("SELECT COUNT(*) n FROM appointments WHERE business_id = ? AND date(starts_at) = ? AND status = 'scheduled'", todayStr),
    avgSentiment:       avgSentiment != null ? Math.round(avgSentiment * 100) / 100 : null,
    newLeadsToday:      count("SELECT COUNT(*) n FROM leads WHERE business_id = ? AND date(created_at) = ?", todayStr),
  });
});

// NEW: Usage / cost analytics
router.get('/businesses/:id/usage', (req, res) => {
  const days = parseInt(req.query.days || '30', 10);
  const rows = getUsageSummary(req.params.id, days);
  // Rough cost estimate: Claude Sonnet ~$3/M input, $15/M output
  const totals = rows.reduce((acc, r) => ({
    input_tokens:  acc.input_tokens  + r.input_tokens,
    output_tokens: acc.output_tokens + r.output_tokens,
    conversations: acc.conversations + r.conversations,
  }), { input_tokens: 0, output_tokens: 0, conversations: 0 });
  const estimatedCostUSD = (totals.input_tokens / 1_000_000 * 3) + (totals.output_tokens / 1_000_000 * 15);
  res.json({ rows, totals, estimatedCostUSD: Math.round(estimatedCostUSD * 100) / 100 });
});

// NEW: Blocklist
router.get('/businesses/:id/blocklist', (req, res) => {
  res.json(db.prepare('SELECT * FROM blocklist WHERE business_id = ? ORDER BY created_at DESC').all(req.params.id));
});
router.post('/businesses/:id/blocklist', (req, res) => {
  const { phone, email, reason } = req.body || {};
  const id = require('nanoid').nanoid(12);
  db.prepare('INSERT INTO blocklist (id, business_id, phone, email, reason) VALUES (?,?,?,?,?)').run(id, req.params.id, phone || '', email || '', reason || '');
  res.status(201).json({ id });
});
router.delete('/blocklist/:id', (req, res) => {
  db.prepare('DELETE FROM blocklist WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// NEW: Webhook events log
router.get('/businesses/:id/webhook-events', (req, res) => {
  res.json(db.prepare('SELECT * FROM webhook_events WHERE business_id = ? ORDER BY created_at DESC LIMIT 100').all(req.params.id));
});

// ---- Account ----
router.post('/account/password', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'min 8 chars' });
  changePassword(password);
  res.json({ ok: true });
});

export default router;
