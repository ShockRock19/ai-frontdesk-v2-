import { nanoid } from 'nanoid';
import db from '../db/index.js';

export const Customer = {
  create({ businessId, name = '', phone = '', email = '', notes = '' }) {
    const id = nanoid(12);
    db.prepare(
      'INSERT INTO customers (id, business_id, name, phone, email, notes) VALUES (?,?,?,?,?,?)'
    ).run(id, businessId, name, phone, email, notes);
    return this.get(id);
  },
  get(id) {
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  },
  /** Match by phone or email within a business, else create. */
  upsert({ businessId, name = '', phone = '', email = '', notes = '' }) {
    let row;
    if (phone) row = db.prepare('SELECT * FROM customers WHERE business_id = ? AND phone = ?').get(businessId, phone);
    if (!row && email) row = db.prepare('SELECT * FROM customers WHERE business_id = ? AND email = ?').get(businessId, email);
    if (row) {
      db.prepare(
        `UPDATE customers SET name = COALESCE(NULLIF(?, ''), name),
           email = COALESCE(NULLIF(?, ''), email),
           phone = COALESCE(NULLIF(?, ''), phone),
           notes = TRIM(notes || ' ' || ?) WHERE id = ?`
      ).run(name, email, phone, notes, row.id);
      return this.get(row.id);
    }
    return this.create({ businessId, name, phone, email, notes });
  },
  list(businessId) {
    return db.prepare('SELECT * FROM customers WHERE business_id = ? ORDER BY created_at DESC').all(businessId);
  },
};

export const Appointment = {
  create({ businessId, customerId = null, conversationId = null, service = '', startsAt, durationMin = 30, notes = '' }) {
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO appointments (id, business_id, customer_id, conversation_id, service, starts_at, duration_min, notes)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, businessId, customerId, conversationId, service, startsAt, durationMin, notes);
    return this.get(id);
  },
  get(id) {
    return db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  },
  /** Naive overlap check: any scheduled appt that intersects [startsAt, startsAt+duration). */
  hasConflict(businessId, startsAtISO, durationMin) {
    const start = new Date(startsAtISO).getTime();
    const end = start + durationMin * 60000;
    const rows = db
      .prepare("SELECT starts_at, duration_min FROM appointments WHERE business_id = ? AND status = 'scheduled'")
      .all(businessId);
    return rows.some((r) => {
      const s = new Date(r.starts_at).getTime();
      const e = s + r.duration_min * 60000;
      return start < e && s < end;
    });
  },
  list(businessId) {
    return db
      .prepare("SELECT * FROM appointments WHERE business_id = ? AND status = 'scheduled' ORDER BY starts_at ASC")
      .all(businessId);
  },
  cancel(id) {
    db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(id);
  },
};

export const Lead = {
  create({ businessId, customerId = null, conversationId = null, qualified = 0, score = 0, summary = '' }) {
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO leads (id, business_id, customer_id, conversation_id, qualified, score, summary)
       VALUES (?,?,?,?,?,?,?)`
    ).run(id, businessId, customerId, conversationId, qualified ? 1 : 0, score, summary);
    return this.get(id);
  },
  get(id) {
    return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  },
  list(businessId) {
    return db
      .prepare(
        `SELECT l.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
         FROM leads l LEFT JOIN customers c ON c.id = l.customer_id
         WHERE l.business_id = ? ORDER BY l.created_at DESC`
      )
      .all(businessId);
  },
  setStatus(id, status) {
    db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, id);
  },
};
