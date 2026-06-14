/**
 * Outbound webhook dispatcher — fires signed HTTP POST events to a business's
 * configured webhook_url for every key event (lead.qualified, appointment.booked, etc.)
 *
 * Payload is signed with HMAC-SHA256 using webhook_secret so the receiver can verify.
 * Events are logged in the webhook_events table for debugging / replay.
 */
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import db from '../db/index.js';

const TIMEOUT_MS = 8000;

export async function dispatchWebhook(biz, eventType, data) {
  if (!biz.webhook_url) return; // not configured

  const payload = JSON.stringify({ event: eventType, business_id: biz.id, timestamp: new Date().toISOString(), data });
  const eventId = nanoid(12);

  // Log intent
  db.prepare(
    'INSERT INTO webhook_events (id, business_id, event_type, payload) VALUES (?,?,?,?)'
  ).run(eventId, biz.id, eventType, payload);

  // Sign
  const sig = biz.webhook_secret
    ? crypto.createHmac('sha256', biz.webhook_secret).update(payload).digest('hex')
    : '';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(biz.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sig ? { 'X-FrontDesk-Signature': `sha256=${sig}` } : {}),
        'X-FrontDesk-Event': eventType,
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timer);
    db.prepare('UPDATE webhook_events SET delivered = ?, attempts = 1 WHERE id = ?').run(res.ok ? 1 : 0, eventId);
  } catch (err) {
    db.prepare('UPDATE webhook_events SET attempts = 1, last_error = ? WHERE id = ?').run(err.message, eventId);
    console.warn(`[webhook] dispatch failed for ${eventType}:`, err.message);
  }
}
