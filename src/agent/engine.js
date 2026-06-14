import { createMessage } from './claude.js';
import { buildSystemPrompt } from './prompt.js';
import { toolDefs, runTool } from './tools.js';
import { Message } from '../models/conversation.js';
import { isAfterHours, getReturningCustomer } from './context.js';
import { logUsage } from '../db/usage.js';

const MAX_TOOL_ROUNDS = 8; // increased from 5 — new tools need more rounds

/**
 * Run one conversational turn — v2 supercharged edition.
 * @param {object} biz          - business row
 * @param {object} conversation - conversation row
 * @param {string} userText     - what the caller just said/typed
 * @param {string} channel      - 'voice' | 'sms' | 'webchat'
 * @param {object} [opts]       - { callerPhone } for caller-ID lookup
 * @returns {Promise<string>}
 */
export async function runTurn(biz, conversation, userText, channel, opts = {}) {
  // Build rich context for the prompt
  const afterHours = isAfterHours(biz);
  const returningCustomer = opts.callerPhone
    ? await getReturningCustomer(biz.id, opts.callerPhone)
    : null;

  const system = buildSystemPrompt(biz, { channel, isAfterHours: afterHours, returningCustomer });

  const messages = Message.history(conversation.id);
  messages.push({ role: 'user', content: userText });
  Message.add(conversation.id, 'user', userText);

  let finalText = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let resp;
    try {
      resp = await createMessage({ system, messages, tools: toolDefs });
    } catch (err) {
      console.error('[engine] Claude error:', err.message);
      finalText = channel === 'voice'
        ? "I'm sorry, I'm having a little trouble right now. Could you say that again?"
        : "Sorry, I hit a snag — could you try again in a moment?";
      break;
    }

    // Track token usage
    if (resp.usage) {
      totalInputTokens  += resp.usage.input_tokens  || 0;
      totalOutputTokens += resp.usage.output_tokens || 0;
    }

    const assistantBlocks = resp.content;
    const textParts = assistantBlocks.filter((b) => b.type === 'text').map((b) => b.text);
    const toolUses  = assistantBlocks.filter((b) => b.type === 'tool_use');

    if (resp.stop_reason === 'tool_use' && toolUses.length) {
      messages.push({ role: 'assistant', content: assistantBlocks });
      const results = [];
      for (const tu of toolUses) {
        let result;
        try {
          result = await runTool(tu.name, tu.input || {}, { biz, conversation, channel });
        } catch (err) {
          console.error(`[engine] tool ${tu.name} failed:`, err.message);
          result = `Error running ${tu.name}: ${err.message}`;
        }
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: String(result) });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    finalText = textParts.join(' ').trim();
    break;
  }

  if (!finalText) finalText = 'Thanks — is there anything else I can help with?';
  Message.add(conversation.id, 'assistant', finalText);

  // Log usage asynchronously (non-blocking)
  logUsage(biz.id, channel, totalInputTokens, totalOutputTokens).catch(() => {});

  return finalText;
}
