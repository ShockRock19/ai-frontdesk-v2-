import { nanoid } from 'nanoid';
import db from '../db/index.js';

export const Conversation = {
  /** Find an open conversation for a channel/external id, or create one. */
  findOrCreate({ businessId, channel, externalId }) {
    let row = db
      .prepare(
        `SELECT * FROM conversations
         WHERE business_id = ? AND channel = ? AND external_id = ? AND status = 'open'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(businessId, channel, externalId);
    if (row) return row;
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO conversations (id, business_id, channel, external_id) VALUES (?,?,?,?)`
    ).run(id, businessId, channel, externalId);
    return this.get(id);
  },

  get(id) {
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  },

  list(businessId, limit = 100) {
    return db
      .prepare('SELECT * FROM conversations WHERE business_id = ? ORDER BY updated_at DESC LIMIT ?')
      .all(businessId, limit);
  },

  attachCustomer(id, customerId) {
    db.prepare('UPDATE conversations SET customer_id = ? WHERE id = ?').run(customerId, id);
  },

  close(id) {
    db.prepare("UPDATE conversations SET status = 'closed' WHERE id = ?").run(id);
  },

  touch(id) {
    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(id);
  },
};

export const Message = {
  add(conversationId, role, content) {
    const id = nanoid(12);
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content) VALUES (?,?,?,?)'
    ).run(id, conversationId, role, content);
    Conversation.touch(conversationId);
    return id;
  },

  /** Return messages as Claude-format {role, content} array. */
  history(conversationId, limit = 40) {
    const rows = db
      .prepare(
        'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
      )
      .all(conversationId, limit);
    return rows.map((r) => ({ role: r.role, content: r.content }));
  },

  list(conversationId) {
    return db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId);
  },
};
