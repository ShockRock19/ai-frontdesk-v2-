import { nanoid } from 'nanoid';
import db from '../db/index.js';

const COLS = [
  'name', 'industry', 'description', 'twilio_number', 'tone', 'target_market',
  'services', 'qualification_criteria', 'booking_instructions', 'faq',
  'owner_phone', 'owner_email', 'greeting', 'timezone', 'active',
];

export const Business = {
  create(data = {}) {
    const id = nanoid(12);
    const row = { id };
    for (const c of COLS) {
      if (c === 'active') {
        row[c] = data[c] ?? 1;
      } else if (c === 'twilio_number') {
        // Allow blank numbers without colliding on the UNIQUE constraint.
        // An empty value is stored as NULL (multiple NULLs are allowed; multiple ''s are not).
        row[c] = data[c] ? data[c] : null;
      } else {
        row[c] = data[c] ?? '';
      }
    }
    const cols = ['id', ...COLS];
    db.prepare(
      `INSERT INTO businesses (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`
    ).run(row);
    return this.get(id);
  },

  get(id) {
    return db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
  },

  byTwilioNumber(number) {
    return db.prepare('SELECT * FROM businesses WHERE twilio_number = ? AND active = 1').get(number);
  },

  list() {
    return db.prepare('SELECT * FROM businesses ORDER BY created_at DESC').all();
  },

  update(id, data = {}) {
    const sets = [];
    const params = { id };
    for (const c of COLS) {
      if (c in data) {
        sets.push(`${c} = @${c}`);
        params[c] = data[c];
      }
    }
    if (!sets.length) return this.get(id);
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE businesses SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return this.get(id);
  },

  remove(id) {
    db.prepare('DELETE FROM businesses WHERE id = ?').run(id);
  },
};