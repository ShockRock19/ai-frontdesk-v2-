import express from 'express';
import twilio from 'twilio';
import { Business } from '../models/business.js';
import { Conversation } from '../models/conversation.js';
import { runTurn } from '../agent/engine.js';
import { openingLine } from '../agent/prompt.js';
import { validateTwilio } from './validate.js';
import { isBlocked } from '../agent/context.js';

const VoiceResponse = twilio.twiml.VoiceResponse;
const router = express.Router();

const SAY_OPTS = { voice: 'Polly.Joanna-Neural' };
const RESPOND_PATH = '/voice/respond';

function gatherInto(twiml, prompt) {
  const gather = twiml.gather({
    input: 'speech',
    action: RESPOND_PATH,
    method: 'POST',
    speechTimeout: 'auto',
    actionOnEmptyResult: true,
    // NEW: enhanced speech model for better accuracy
    speechModel: 'phone_call',
    enhanced: 'true',
  });
  if (prompt) gather.say(SAY_OPTS, prompt);
  return gather;
}

router.post('/incoming', validateTwilio, (req, res) => {
  const twiml = new VoiceResponse();
  const toNumber = req.body.To;
  const fromNumber = req.body.From;
  const biz = Business.byTwilioNumber(toNumber);

  if (!biz) {
    twiml.say(SAY_OPTS, 'Sorry, this number is not configured. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  // NEW: blocklist check
  if (isBlocked(biz.id, { phone: fromNumber })) {
    twiml.say(SAY_OPTS, 'We are unable to take your call at this time. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  Conversation.findOrCreate({ businessId: biz.id, channel: 'voice', externalId: req.body.CallSid });
  gatherInto(twiml, openingLine(biz, 'voice'));
  res.type('text/xml').send(twiml.toString());
});

router.post('/respond', validateTwilio, async (req, res) => {
  const twiml = new VoiceResponse();
  const biz = Business.byTwilioNumber(req.body.To);
  if (!biz) {
    twiml.say(SAY_OPTS, 'Sorry, something went wrong. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  const conversation = Conversation.findOrCreate({
    businessId: biz.id,
    channel: 'voice',
    externalId: req.body.CallSid,
  });

  const speech = (req.body.SpeechResult || '').trim();
  const empties = parseInt(req.query.empty || '0', 10);

  if (!speech) {
    if (empties >= 2) {
      twiml.say(SAY_OPTS, "I'm having trouble hearing you. Please call back anytime. Goodbye.");
      twiml.hangup();
      Conversation.close(conversation.id);
      return res.type('text/xml').send(twiml.toString());
    }
    const g = twiml.gather({
      input: 'speech',
      action: `${RESPOND_PATH}?empty=${empties + 1}`,
      method: 'POST',
      speechTimeout: 'auto',
      actionOnEmptyResult: true,
      speechModel: 'phone_call',
      enhanced: 'true',
    });
    g.say(SAY_OPTS, empties === 0 ? "Sorry, I didn't quite catch that — could you say it again?" : "Still having trouble hearing you. Take your time.");
    return res.type('text/xml').send(twiml.toString());
  }

  // Check for CANCEL keyword (appointment cancellation via SMS/voice)
  if (/^cancel$/i.test(speech.trim())) {
    twiml.say(SAY_OPTS, `To cancel your appointment with ${biz.name}, please call us directly or reply with your name and appointment date and we'll take care of it.`);
    gatherInto(twiml, 'Is there anything else I can help you with?');
    return res.type('text/xml').send(twiml.toString());
  }

  let reply;
  try {
    reply = await runTurn(biz, conversation, speech, 'voice', { callerPhone: req.body.From });
  } catch (err) {
    console.error('[voice] turn failed:', err.message);
    reply = "I'm sorry, I hit a problem. Please try again in a moment.";
  }

  gatherInto(twiml, reply);
  res.type('text/xml').send(twiml.toString());
});

// NEW: Call status callback — Twilio posts here when the call ends
router.post('/status', validateTwilio, (req, res) => {
  const callStatus = req.body.CallStatus;
  const callSid    = req.body.CallSid;
  const biz = Business.byTwilioNumber(req.body.To);
  if (biz && callStatus === 'completed') {
    const conv = Conversation.findOpen(biz.id, 'voice', callSid);
    if (conv) Conversation.close(conv.id);
  }
  res.sendStatus(204);
});

export default router;
