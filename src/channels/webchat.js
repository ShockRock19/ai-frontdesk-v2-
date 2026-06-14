import express from 'express';
import { Business } from '../models/business.js';
import { Conversation } from '../models/conversation.js';
import { runTurn } from '../agent/engine.js';
import { openingLine } from '../agent/prompt.js';

const router = express.Router();

// Public: returns the greeting + business display name for a widget to boot with.
router.get('/widget/:businessId', (req, res) => {
  const biz = Business.get(req.params.businessId);
  if (!biz || !biz.active) return res.status(404).json({ error: 'not_found' });
  res.json({ name: biz.name, greeting: openingLine(biz, 'webchat') });
});

// Public: a single chat turn. Body: { businessId, sessionId, message }.
router.post('/chat', async (req, res) => {
  const { businessId, sessionId, message } = req.body || {};
  if (!businessId || !sessionId || !message) {
    return res.status(400).json({ error: 'businessId, sessionId and message are required' });
  }
  const biz = Business.get(businessId);
  if (!biz || !biz.active) return res.status(404).json({ error: 'not_found' });

  const conversation = Conversation.findOrCreate({
    businessId: biz.id,
    channel: 'webchat',
    externalId: String(sessionId),
  });

  try {
    const reply = await runTurn(biz, conversation, String(message).trim(), 'webchat');
    res.json({ reply });
  } catch (err) {
    console.error('[webchat] turn failed:', err.message);
    res.status(500).json({ error: 'agent_error' });
  }
});

export default router;
