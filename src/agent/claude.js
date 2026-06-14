import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client = null;
function getClient() {
  if (!client) {
    if (!config.claude.apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey: config.claude.apiKey });
  }
  return client;
}

/**
 * Single call to the Messages API.
 * @param {object} opts
 * @param {string} opts.system - system prompt
 * @param {Array}  opts.messages - Claude message array
 * @param {Array}  [opts.tools] - tool definitions
 * @returns {Promise<object>} the raw response (has .content, .stop_reason)
 */
export async function createMessage({ system, messages, tools }) {
  const anthropic = getClient();
  return anthropic.messages.create({
    model: config.claude.model,
    max_tokens: config.claude.maxTokens,
    system,
    messages,
    ...(tools && tools.length ? { tools } : {}),
  });
}
