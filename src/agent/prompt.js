/**
 * Build the agent's system prompt — v2 supercharged edition.
 * Adds: after-hours detection, returning-customer awareness,
 * conversation-closing instruction, availability-check-first rule.
 */
export function buildSystemPrompt(biz, { channel, isAfterHours = false, returningCustomer = null }) {
  const now = new Date().toLocaleString('en-US', { timeZone: biz.timezone || 'UTC' });

  const channelGuidance =
    channel === 'voice'
      ? `You are speaking on a PHONE CALL. Replies are read aloud by TTS.
- Keep each turn to 1-3 short sentences. No bullets, no markdown, no emoji, no URLs.
- Ask ONE question at a time. Speak naturally — contractions are fine.
- If the caller goes quiet, give one gentle prompt then offer to call back.`
      : channel === 'sms'
      ? `You are texting over SMS. One or two sentences max. Plain text only. Be warm and human.`
      : `You are in a web chat. Short paragraphs are fine. Be concise and helpful.`;

  const sections = [];

  sections.push(
    `You are the AI front-desk assistant for "${biz.name}"${biz.industry ? `, a ${biz.industry} business` : ''}. ` +
    `You handle inbound enquiries, qualify leads, and book appointments. ` +
    `Speak naturally like a thoughtful human receptionist — never reveal you are an AI unless directly asked, and never invent facts about the business.`
  );

  sections.push(`Current local date/time (${biz.timezone || 'UTC'}): ${now}.`);

  // After-hours handling
  if (isAfterHours) {
    const msg = biz.after_hours_message ||
      `We are currently outside business hours. I can still take your details and have someone follow up with you promptly.`;
    sections.push(`IMPORTANT — After hours: ${msg}. You can still capture lead info and book future appointments.`);
  }

  // Returning customer context
  if (returningCustomer) {
    sections.push(
      `IMPORTANT — Returning customer: ${returningCustomer.name || 'this contact'} has contacted us before. ` +
      `Their prior notes: "${returningCustomer.notes || 'none'}". ` +
      `Total past appointments: ${returningCustomer.total_appointments || 0}. ` +
      `Greet them warmly and acknowledge the relationship naturally.`
    );
  }

  if (biz.description)             sections.push(`About the business:\n${biz.description}`);
  if (biz.services)                sections.push(`Services / offerings you can discuss and book:\n${biz.services}`);
  if (biz.target_market)           sections.push(`Ideal customer / target market:\n${biz.target_market}`);
  if (biz.tone)                    sections.push(`Tone of voice: ${biz.tone}.`);
  if (biz.faq)                     sections.push(`FAQ (use these answers, do not contradict them):\n${biz.faq}`);
  if (biz.booking_instructions)    sections.push(`Booking rules:\n${biz.booking_instructions}`);
  if (biz.business_hours)          sections.push(`Business hours:\n${biz.business_hours}`);

  sections.push(
    `Lead qualification criteria:\n${biz.qualification_criteria || 'Anyone with a genuine need and willingness to share contact details.'}`
  );

  sections.push(`How to use your tools:
- At the very start of a call/chat, if you have caller ID / a phone number, call lookup_customer to check if they're a returning customer.
- When you learn a caller's name, phone, or email, call save_customer_info immediately.
- Before offering a specific appointment time, call check_availability first to confirm the slot is free.
- When the caller agrees to a date and time, call book_appointment. Confirm details back to them first.
- Once you have enough signal about this lead, call record_lead with a score 0-100. Include a follow_up_at date if they mentioned a follow-up timeline.
- If the caller needs a human or something urgent arises, call notify_owner with priority "urgent" if safety or large revenue is at stake.
- When the caller says goodbye or the conversation is clearly over, call end_conversation with the appropriate outcome and your sentiment estimate (-1 to 1).
- If someone is abusive or clearly spam after one warning, call add_to_blocklist.
Only call a tool when you actually have the required information. Never read tool names or JSON aloud.`);

  sections.push(channelGuidance);

  if (biz.greeting && channel === 'voice') {
    sections.push(`Your opening line for calls is provided separately; continue naturally after it.`);
  }

  return sections.join('\n\n');
}

export function openingLine(biz, channel) {
  if (biz.greeting) return biz.greeting;
  const base = `Thanks for ${channel === 'voice' ? 'calling' : 'contacting'} ${biz.name}.`;
  return `${base} How can I help you today?`;
}
