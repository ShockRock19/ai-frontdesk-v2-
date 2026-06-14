/**
 * Runtime context helpers — after-hours detection, returning customer lookup.
 */
import db from '../db/index.js';

/**
 * Check if the current time is outside the business's configured hours.
 * business_hours is a JSON string: [{"day":"Mon","open":"09:00","close":"17:00"}, ...]
 * Day names: Sun Mon Tue Wed Thu Fri Sat
 */
export function isAfterHours(biz) {
  if (!biz.business_hours) return false;
  let hours;
  try { hours = JSON.parse(biz.business_hours); } catch { return false; }
  if (!Array.isArray(hours) || !hours.length) return false;

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: biz.timezone || 'UTC' }));
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayName = dayNames[now.getDay()];
  const todayEntry = hours.find((h) => h.day === todayName);
  if (!todayEntry) return true; // no entry = closed today

  const [openH, openM]   = todayEntry.open.split(':').map(Number);
  const [closeH, closeM] = todayEntry.close.split(':').map(Number);
  const nowMinutes  = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  return nowMinutes < openMinutes || nowMinutes >= closeMinutes;
}

/**
 * Look up a returning customer by phone number.
 */
export async function getReturningCustomer(businessId, phone) {
  if (!phone) return null;
  return db.prepare('SELECT * FROM customers WHERE business_id = ? AND phone = ?').get(businessId, phone) || null;
}

/**
 * Check if a phone/email is on the blocklist.
 */
export function isBlocked(businessId, { phone, email }) {
  if (phone) {
    const r = db.prepare('SELECT id FROM blocklist WHERE business_id = ? AND phone = ?').get(businessId, phone);
    if (r) return true;
  }
  if (email) {
    const r = db.prepare('SELECT id FROM blocklist WHERE business_id = ? AND email = ?').get(businessId, email);
    if (r) return true;
  }
  return false;
}
