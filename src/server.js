import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, assertConfig } from './config.js';
import { migrate } from './db/index.js';
import { ensureAdmin, requireAuth } from './auth/index.js';

import voiceRouter from './channels/voice.js';
import smsRouter from './channels/sms.js';
import webchatRouter from './channels/webchat.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';
import integrationRouter from './routes/integration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Boot ---
migrate();
ensureAdmin();
assertConfig();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Nginx on Hostinger

// Body parsers: Twilio posts urlencoded; the dashboard/web chat posts JSON.
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser(config.admin.sessionSecret));

// Health check (useful for uptime monitors / load balancers).
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Public channel webhooks ---
app.use('/voice', voiceRouter);
app.use('/sms', smsRouter);
app.use('/public', webchatRouter); // GET /public/widget/:id, POST /public/chat

// --- Auth ---
app.use('/auth', authRouter);

// --- Protected dashboard API ---
app.use('/api', requireAuth, apiRouter);

// --- Machine integration API (OpenClaw etc.), bearer-token protected ---
app.use('/integration', integrationRouter);

// --- Static files (login, dashboard, widget) ---
// Protect the dashboard page itself; everything else (login, widget, assets) is public.
app.get('/', (req, res) => res.redirect('/dashboard.html'));
app.get('/dashboard.html', requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, '../public/dashboard.html'))
);
app.use(express.static(path.join(__dirname, '../public')));

// 404
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(config.port, () => {
  console.log(`AI Front-Desk listening on :${config.port}  (${config.nodeEnv})`);
  console.log(`Dashboard: ${config.publicBaseUrl}/dashboard.html`);
});
