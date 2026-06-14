import express from 'express';
import twilio from 'twilio';
import { Business } from '../models/business.js';
import { Conversation } from '../models/conversation.js';
import { Customer } from '../models/customer.js';
import { runTurn } from '../agent/engine.js';
import { validateTwilio } from './validate.js';

const MessagingResponse = twilio.twiml.MessagingResponse;
const router = express.Router();

// Configure this as the Messaging webhook for your Twilio number.
router.post('/incoming', validateTwilio, async (req, res) => {
  const twiml = new MessagingResponse();
  const biz = Business.byTwilioNumber(req.body.To);
  if (!biz) {
    twiml.message('This number is not configured.');
    return res.type('text/xml').send(twiml.toString());
  }

  const from = req.body.From;
  const conversation = Conversation.findOrCreate({ businessId: biz.id, channel: 'sms', externalId: from });

  // Attach the sender's phone as a customer record immediately.
  if (!conversation.customer_id) {
    const cust = Customer.upsert({ businessId: biz.id, phone: from });
    Conversation.attachCustomer(conversation.id, cust.id);
    conversation.customer_id = cust.id;
  }

  let reply;
  try {
    reply = await runTurn(biz, conversation, (req.body.Body || '').trim(), 'sms');
  } catch (err) {
    console.error('[sms] turn failed:', err.message);
    reply = 'Sorry, I had trouble with that. Please try again.';
  }

  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

export default router;
