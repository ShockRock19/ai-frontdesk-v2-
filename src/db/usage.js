import { nanoid } from 'nanoid';
import db from './index.js';

export async function logUsage(businessId, channel, inputTokens, outputTokens) {
  if (!inputTokens && !outputTokens) return;
  const date = new Date().toISOString().substring(0, 10);
  const existing = db.prepare(
    'SELECT id FROM usage_log WHERE business_id = ? AND date = ? AND channel = ?'
  ).get(businessId, date, channel);
  if (existing) {
    db.prepare(
      'UPDATE usage_log SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, conversations = conversations + 1 WHERE id = ?'
    ).run(inputTokens, outputTokens, existing.id);
  } else {
    db.prepare(
      'INSERT INTO usage_log (id, business_id, date, channel, input_tokens, output_tokens, conversations) VALUES (?,?,?,?,?,?,1)'
    ).run(nanoid(12), businessId, date, channel, inputTokens, outputTokens);
  }
}

export function getUsageSummary(businessId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().substring(0, 10);
  return db.prepare(
    'SELECT date, channel, input_tokens, output_tokens, conversations FROM usage_log WHERE business_id = ? AND date >= ? ORDER BY date ASC'
  ).all(businessId, since);
}
