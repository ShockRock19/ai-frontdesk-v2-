import dotenv from 'dotenv';
dotenv.config();

function bool(v, dflt = false) {
  if (v === undefined) return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  nodeEnv: process.env.NODE_ENV || 'development',

  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '600', 10),
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    notifyFrom: process.env.TWILIO_NOTIFY_FROM || '',
    validateSignature: bool(process.env.TWILIO_VALIDATE_SIGNATURE, false),
  },

  admin: {
    email: (process.env.ADMIN_EMAIL || '').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
    sessionSecret: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'AI Front-Desk <no-reply@example.com>',
  },

  dbPath: process.env.DB_PATH || './data/frontdesk.db',

  // Bearer token for the machine-to-machine /integration API (used by OpenClaw).
  integrationToken: process.env.INTEGRATION_TOKEN || '',
};

export function assertConfig() {
  const missing = [];
  if (!config.claude.apiKey) missing.push('ANTHROPIC_API_KEY');
  if (!config.admin.email) missing.push('ADMIN_EMAIL');
  if (!config.admin.password) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    console.warn(`[config] Warning — missing recommended env vars: ${missing.join(', ')}`);
  }
  if (config.admin.sessionSecret === 'insecure-dev-secret-change-me' && config.nodeEnv === 'production') {
    console.warn('[config] SESSION_SECRET is the default — set a strong value in production.');
  }
}
