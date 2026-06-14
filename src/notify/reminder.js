/**
 * Appointment reminder system.
 * Call this on a schedule (e.g. every hour via setInterval or a cron job).
 * Sends SMS reminders to customers before their appointments.
 */
import twilio from 'twilio';
import { config } from '../config.js';
import db from '../db/index.js';

export async function sendDueReminders() {
  if (!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.notifyFrom) return;

  // Find all businesses with reminder_hours set
  const businesses = db.prepare("SELECT * FROM businesses WHERE active = 1").all();

  for (const biz of businesses) {
    const reminderHours = biz.reminder_hours || 24;
    const windowStart = new Date(Date.now() + (reminderHours - 0.5) * 3600000).toISOString();
    const windowEnd   = new Date(Date.now() + (reminderHours + 0.5) * 3600000).toISOString();

    const appts = db.prepare(
      `SELECT a.*, c.name as customer_name, c.phone as customer_phone
       FROM appointments a LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.business_id = ? AND a.status = 'scheduled'
         AND a.reminder_sent = 0
         AND a.starts_at >= ? AND a.starts_at <= ?`
    ).all(biz.id, windowStart, windowEnd);

    for (const appt of appts) {
      if (!appt.customer_phone) continue;
      const dt = new Date(appt.starts_at).toLocaleString('en-US', { timeZone: biz.timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' });
      const msg = `Reminder: You have an appointment at ${biz.name} on ${dt}${appt.service ? ` for ${appt.service}` : ''}. Reply CANCEL to cancel or call us to reschedule.`;

      try {
        const client = twilio(config.twilio.accountSid, config.twilio.authToken);
        await client.messages.create({ to: appt.customer_phone, from: config.twilio.notifyFrom, body: msg });
        db.prepare("UPDATE appointments SET reminder_sent = 1 WHERE id = ?").run(appt.id);
        console.log(`[reminder] Sent to ${appt.customer_phone} for appt ${appt.id}`);
      } catch (err) {
        console.error(`[reminder] Failed for appt ${appt.id}:`, err.message);
      }
    }
  }
}
