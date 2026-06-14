import { Customer, Appointment, Lead } from '../models/customer.js';
import { Conversation } from '../models/conversation.js';
import { notifyOwner } from '../notify/index.js';
import { dispatchWebhook } from '../notify/webhook.js';
import db from '../db/index.js';

/** Tool schemas exposed to Claude — v2 supercharged edition. */
export const toolDefs = [
  {
    name: 'save_customer_info',
    description:
      "Store or update the caller's contact details. Call this as soon as you learn any of their name, phone, or email.",
    input_schema: {
      type: 'object',
      properties: {
        name:  { type: 'string' },
        phone: { type: 'string', description: 'E.164 if possible, e.g. +15551234567' },
        email: { type: 'string' },
        notes: { type: 'string', description: 'Anything useful about what they want' },
        tags:  { type: 'string', description: 'Comma-separated tags e.g. "hot-lead,referral"' },
      },
    },
  },
  {
    name: 'book_appointment',
    description:
      'Book an appointment once the caller has agreed to a specific date and time. Confirm details with them first.',
    input_schema: {
      type: 'object',
      properties: {
        starts_at:    { type: 'string', description: 'ISO 8601 datetime with timezone offset' },
        duration_min: { type: 'integer', description: 'Length in minutes (default 30)' },
        service:      { type: 'string', description: 'What the appointment is for' },
        notes:        { type: 'string' },
      },
      required: ['starts_at'],
    },
  },
  {
    name: 'check_availability',
    description: 'Check whether a specific date/time slot is available before offering it to the caller. Use this to avoid offering times that are already booked.',
    input_schema: {
      type: 'object',
      properties: {
        starts_at:    { type: 'string', description: 'ISO 8601 datetime to check' },
        duration_min: { type: 'integer', description: 'Duration in minutes (default 30)' },
      },
      required: ['starts_at'],
    },
  },
  {
    name: 'record_lead',
    description:
      'Record your assessment of this contact as a sales lead. Call once you have enough signal to judge against the qualification criteria.',
    input_schema: {
      type: 'object',
      properties: {
        qualified:   { type: 'boolean' },
        score:       { type: 'integer', description: '0-100 confidence that this is a valuable lead' },
        summary:     { type: 'string', description: 'One line: who they are and what they need' },
        follow_up_at:{ type: 'string', description: 'ISO date if a follow-up was agreed, e.g. 2026-06-10' },
      },
      required: ['qualified', 'score', 'summary'],
    },
  },
  {
    name: 'notify_owner',
    description: 'Send an immediate alert to the business owner — use for human-handoff requests or anything urgent.',
    input_schema: {
      type: 'object',
      properties: {
        message:  { type: 'string', description: 'Short message for the owner' },
        priority: { type: 'string', enum: ['normal', 'urgent'], description: 'Use urgent for safety or revenue-critical situations' },
      },
      required: ['message'],
    },
  },
  {
    name: 'end_conversation',
    description: 'Mark the conversation as complete and record the outcome and sentiment. Call this when the caller says goodbye or the conversation is clearly finished.',
    input_schema: {
      type: 'object',
      properties: {
        outcome:   { type: 'string', enum: ['booked', 'lead_captured', 'info_provided', 'transferred', 'no_fit', 'hung_up'], description: 'What happened in this conversation' },
        sentiment: { type: 'number', description: 'Caller sentiment from -1 (very negative) to 1 (very positive)' },
      },
      required: ['outcome'],
    },
  },
  {
    name: 'lookup_customer',
    description: 'Look up an existing customer by phone or email to personalize the conversation. Use at the start if you have their caller ID.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        email: { type: 'string' },
      },
    },
  },
  {
    name: 'add_to_blocklist',
    description: 'Block a phone number or email that is spam, abusive, or clearly not a legitimate prospect. Use only when warranted.',
    input_schema: {
      type: 'object',
      properties: {
        phone:  { type: 'string' },
        email:  { type: 'string' },
        reason: { type: 'string' },
      },
    },
  },
];

/**
 * Execute a tool call. Returns a short string result for the model.
 * ctx = { biz, conversation, channel }
 */
export async function runTool(name, input, ctx) {
  const { biz, conversation, channel = 'unknown' } = ctx;

  switch (name) {

    case 'save_customer_info': {
      const customer = Customer.upsert({
        businessId: biz.id,
        name:  input.name  || '',
        phone: input.phone || '',
        email: input.email || '',
        notes: input.notes || '',
        tags:  input.tags  || '',
      });
      if (!conversation.customer_id) {
        Conversation.attachCustomer(conversation.id, customer.id);
        conversation.customer_id = customer.id;
      }
      await dispatchWebhook(biz, 'customer.captured', { customer_id: customer.id, name: customer.name, phone: customer.phone });
      return `Saved contact (id ${customer.id}).`;
    }

    case 'check_availability': {
      const duration = input.duration_min || 30;
      const conflict = Appointment.hasConflict(biz.id, input.starts_at, duration);
      if (conflict) return `UNAVAILABLE: that slot (${input.starts_at}, ${duration} min) is already booked. Offer an alternative time.`;
      // Check daily cap
      const dateStr = input.starts_at.substring(0, 10);
      const dayCount = db.prepare(
        "SELECT COUNT(*) n FROM appointments WHERE business_id = ? AND starts_at LIKE ? AND status = 'scheduled'"
      ).get(biz.id, `${dateStr}%`).n;
      const maxDaily = biz.max_daily_appointments || 20;
      if (dayCount >= maxDaily) return `UNAVAILABLE: maximum appointments for ${dateStr} (${maxDaily}) already reached. Suggest a different day.`;
      return `AVAILABLE: ${input.starts_at} is free for ${duration} minutes. Safe to offer.`;
    }

    case 'book_appointment': {
      const duration = input.duration_min || 30;
      if (Appointment.hasConflict(biz.id, input.starts_at, duration)) {
        return 'CONFLICT: that slot overlaps an existing appointment. Offer the caller a different time.';
      }
      const appt = Appointment.create({
        businessId:     biz.id,
        customerId:     conversation.customer_id,
        conversationId: conversation.id,
        service:        input.service || '',
        startsAt:       input.starts_at,
        durationMin:    duration,
        notes:          input.notes || '',
        sourceChannel:  channel,
      });
      const customer = conversation.customer_id ? Customer.get(conversation.customer_id) : null;
      const customerName = customer?.name || 'Unknown caller';
      const customerPhone = customer?.phone || '';
      await notifyOwner(biz, {
        subject: `📅 New appointment — ${biz.name}`,
        body: `${customerName}${customerPhone ? ` (${customerPhone})` : ''} booked ${input.service || 'an appointment'} on ${input.starts_at} (${duration} min).\n\nNotes: ${input.notes || 'none'}\nChannel: ${channel}`,
      });
      await dispatchWebhook(biz, 'appointment.booked', { appointment_id: appt.id, starts_at: input.starts_at, service: input.service, customer_name: customerName });
      // Update customer stats
      if (conversation.customer_id) {
        db.prepare('UPDATE customers SET total_appointments = total_appointments + 1, updated_at = datetime("now") WHERE id = ?').run(conversation.customer_id);
      }
      return `Booked appointment ${appt.id} for ${input.starts_at}. Confirm this back to the caller and let them know they'll receive a reminder.`;
    }

    case 'record_lead': {
      const lead = Lead.create({
        businessId:     biz.id,
        customerId:     conversation.customer_id,
        conversationId: conversation.id,
        qualified:      input.qualified,
        score:          input.score,
        summary:        input.summary || '',
        followUpAt:     input.follow_up_at || null,
        sourceChannel:  channel,
      });
      if (input.qualified) {
        const customer = conversation.customer_id ? Customer.get(conversation.customer_id) : null;
        await notifyOwner(biz, {
          subject: `🔥 Qualified lead (${input.score}/100) — ${biz.name}`,
          body: `${input.summary}\n\nContact: ${customer?.name || 'Unknown'} ${customer?.phone || ''} ${customer?.email || ''}\n${input.follow_up_at ? `Follow-up: ${input.follow_up_at}` : ''}\nChannel: ${channel}`,
        });
        await dispatchWebhook(biz, 'lead.qualified', { lead_id: lead.id, score: input.score, summary: input.summary });
      }
      return `Recorded lead ${lead.id} (qualified=${input.qualified}, score=${input.score}).`;
    }

    case 'notify_owner': {
      const prefix = input.priority === 'urgent' ? '🚨 URGENT — ' : '';
      await notifyOwner(biz, {
        subject: `${prefix}Front-desk alert — ${biz.name}`,
        body: input.message,
      });
      await dispatchWebhook(biz, 'owner.notified', { message: input.message, priority: input.priority || 'normal' });
      return 'Owner has been notified.';
    }

    case 'end_conversation': {
      Conversation.close(conversation.id, {
        outcome:   input.outcome,
        sentiment: input.sentiment ?? null,
      });
      await dispatchWebhook(biz, 'conversation.ended', { conversation_id: conversation.id, outcome: input.outcome, sentiment: input.sentiment });
      return `Conversation closed (outcome: ${input.outcome}).`;
    }

    case 'lookup_customer': {
      let row = null;
      if (input.phone) row = db.prepare('SELECT * FROM customers WHERE business_id = ? AND phone = ?').get(biz.id, input.phone);
      if (!row && input.email) row = db.prepare('SELECT * FROM customers WHERE business_id = ? AND email = ?').get(biz.id, input.email);
      if (!row) return 'No existing record found for that contact.';
      return `Returning customer: ${row.name || 'Unknown name'}, ${row.phone || 'no phone'}, ${row.email || 'no email'}. Prior notes: ${row.notes || 'none'}. Total appointments: ${row.total_appointments || 0}.`;
    }

    case 'add_to_blocklist': {
      const id = (await import('nanoid')).nanoid(12);
      db.prepare('INSERT INTO blocklist (id, business_id, phone, email, reason) VALUES (?,?,?,?,?)').run(
        id, biz.id, input.phone || '', input.email || '', input.reason || ''
      );
      return `Added to blocklist.`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
