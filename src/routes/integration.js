import express from 'express';
import { config } from '../config.js';
import { Business } from '../models/business.js';
import { Appointment, Lead, Customer } from '../models/customer.js';
import { notifyOwner } from '../notify/index.js';

const router = express.Router();

// Bearer-token gate for machine clients (e.g. an OpenClaw skill).
router.use((req, res, next) => {
  if (!config.integrationToken) return res.status(503).json({ error: 'integration_disabled' });
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== config.integrationToken) return res.status(401).json({ error: 'unauthorized' });
  next();
});

router.get('/businesses', (req, res) => res.json(Business.list().map(({ id, name, twilio_number }) => ({ id, name, twilio_number }))));

router.get('/businesses/:id/appointments', (req, res) => {
  if (!Business.get(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.json(Appointment.list(req.params.id));
});

router.get('/businesses/:id/leads', (req, res) => {
  if (!Business.get(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.json(Lead.list(req.params.id));
});

router.post('/businesses/:id/appointments', async (req, res) => {
  const biz = Business.get(req.params.id);
  if (!biz) return res.status(404).json({ error: 'not_found' });
  const { starts_at, duration_min = 30, service = '', notes = '', customer } = req.body || {};
  if (!starts_at) return res.status(400).json({ error: 'starts_at required' });
  if (Appointment.hasConflict(biz.id, starts_at, duration_min)) {
    return res.status(409).json({ error: 'conflict' });
  }
  let customerId = null;
  if (customer && (customer.phone || customer.email || customer.name)) {
    customerId = Customer.upsert({ businessId: biz.id, ...customer }).id;
  }
  const appt = Appointment.create({ businessId: biz.id, customerId, service, startsAt: starts_at, durationMin: duration_min, notes });
  await notifyOwner(biz, { subject: `Appointment booked via integration — ${biz.name}`, body: `${starts_at} (${duration_min} min) — ${service}` });
  res.status(201).json(appt);
});

export default router;
