import { migrate } from './index.js';
import { Business } from '../models/business.js';

migrate();

const existing = Business.list();
if (existing.length) {
  console.log(`[seed] ${existing.length} business(es) already exist — skipping.`);
  process.exit(0);
}

const biz = Business.create({
  name: 'Evergreen Realty',
  industry: 'real estate',
  description:
    'A boutique residential real estate agency helping buyers and sellers in the greater metro area. We handle listings, buyer representation, and rental placements.',
  twilio_number: '+15551234567', // change to your real Twilio number
  tone: 'warm, professional, never pushy',
  target_market:
    'First-time home buyers and growing families looking in the $300k-$700k range within a 20-mile radius; also landlords needing tenant placement.',
  services:
    'Buyer consultations, listing appointments, home valuations, rental viewings. Appointments are usually 30 minutes, in person or video call.',
  qualification_criteria:
    'A qualified lead is actively buying or selling within 6 months, has a budget or property in our service area, and is willing to schedule a consultation. Tyre-kickers just browsing prices are low priority.',
  booking_instructions:
    'Office hours Mon-Sat 9am-6pm local time. Before booking, collect name, phone, and what they are looking for. Default appointment length 30 minutes.',
  faq:
    'Q: Do you charge buyers a fee? A: No, buyer representation is free; the seller pays commission.\nQ: What areas do you cover? A: The greater metro area within ~20 miles of downtown.',
  owner_phone: '', // put owner E.164 here to receive SMS lead alerts
  owner_email: '', // put owner email here to receive email lead alerts
  greeting: '',
  timezone: 'America/New_York',
});

console.log('[seed] Created example business:');
console.log(`  id:            ${biz.id}`);
console.log(`  name:          ${biz.name}`);
console.log(`  twilio_number: ${biz.twilio_number}  (edit this in the dashboard)`);
console.log('\nUse this id to test the web chat widget: open /widget.html?b=' + biz.id);
process.exit(0);
