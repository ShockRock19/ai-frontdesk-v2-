/**
 * AI Front-Desk — OpenClaw skill wrapper
 * ----------------------------------------
 * This module exposes the front-desk to your OpenClaw agent as a set of tools,
 * so you can say things to your personal OpenClaw assistant like:
 *   "What appointments does Evergreen Realty have today?"
 *   "Book a 30-minute consultation for tomorrow at 3pm for John (+15551112222)."
 *
 * It talks to this app's bearer-token-protected /integration API. It does NOT
 * embed the front-desk's Claude logic — the front-desk runs its own agent for
 * live calls/chats; this is the management/automation surface for OpenClaw.
 *
 * HOW TO REGISTER:
 *   OpenClaw loads skills/tools from your skills directory. The exact manifest
 *   format evolves, so confirm the current convention at https://docs.openclaw.ai
 *   (Skills / Tools section). The functions below are plain async JS and map
 *   cleanly onto OpenClaw's tool interface — wrap each in whatever descriptor
 *   your installed OpenClaw version expects, or call them from a custom skill.
 *
 * ENV expected by the OpenClaw process:
 *   FRONTDESK_URL    e.g. https://agent.yourdomain.com
 *   FRONTDESK_TOKEN  the INTEGRATION_TOKEN from the front-desk .env
 */

const BASE = (process.env.FRONTDESK_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.FRONTDESK_TOKEN || '';

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`Front-desk API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** List businesses configured in the front-desk. */
export async function listBusinesses() {
  return call('/integration/businesses');
}

/** List upcoming appointments for a business id. */
export async function listAppointments(businessId) {
  return call(`/integration/businesses/${businessId}/appointments`);
}

/** List captured leads for a business id. */
export async function listLeads(businessId) {
  return call(`/integration/businesses/${businessId}/leads`);
}

/**
 * Book an appointment.
 * @param {string} businessId
 * @param {{starts_at:string, duration_min?:number, service?:string, notes?:string,
 *          customer?:{name?:string,phone?:string,email?:string}}} details
 */
export async function bookAppointment(businessId, details) {
  return call(`/integration/businesses/${businessId}/appointments`, { method: 'POST', body: details });
}

// Optional: a self-describing tool catalogue your skill can iterate over.
export const tools = [
  { name: 'frontdesk_list_businesses', description: 'List front-desk businesses', handler: () => listBusinesses() },
  { name: 'frontdesk_list_appointments', description: 'List a business\'s appointments', handler: ({ businessId }) => listAppointments(businessId) },
  { name: 'frontdesk_list_leads', description: 'List a business\'s leads', handler: ({ businessId }) => listLeads(businessId) },
  { name: 'frontdesk_book_appointment', description: 'Book an appointment', handler: ({ businessId, ...d }) => bookAppointment(businessId, d) },
];
