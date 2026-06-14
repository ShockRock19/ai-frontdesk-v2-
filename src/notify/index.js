import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let twilioClient = null;
function getTwilio() {
  if (!twilioClient && config.twilio.accountSid && config.twilio.authToken) {
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

let mailer = null;
function getMailer() {
  if (!mailer && config.smtp.host) {
    mailer = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return mailer;
}

/**
 * Notify a business owner about a lead/appointment/alert via SMS and/or email.
 * Failures are logged but never thrown — notifications must not break a call.
 */
export async function notifyOwner(biz, { subject, body }) {
  const tasks = [];

  if (biz.owner_phone && config.twilio.notifyFrom) {
    const client = getTwilio();
    if (client) {
      tasks.push(
        client.messages
          .create({ to: biz.owner_phone, from: config.twilio.notifyFrom, body: `${subject}\n${body}` })
          .catch((e) => console.error('[notify] SMS failed:', e.message))
      );
    }
  }

  if (biz.owner_email) {
    const m = getMailer();
    if (m) {
      tasks.push(
        m
          .sendMail({ from: config.smtp.from, to: biz.owner_email, subject, text: body })
          .catch((e) => console.error('[notify] email failed:', e.message))
      );
    }
  }

  if (!tasks.length) {
    console.log(`[notify] (no channel configured) ${subject} — ${body}`);
  }
  await Promise.allSettled(tasks);
}
