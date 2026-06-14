# AI Front-Desk

An AI receptionist that answers **inbound phone calls, SMS, and web chat** for any business, **books appointments**, **qualifies leads**, and **alerts the owner** the moment a good lead comes in. Every business detail — description, tone of voice, target market, lead-qualification criteria, booking rules — is configured from a **dashboard**, so the same code works for real estate, insurance, clinics, or anything else.

Built on **Node.js + Express**, **Claude** (via the official SDK with tool-use), **Twilio** (voice + SMS), and **SQLite**. Designed to run on a **Hostinger VPS** and to be drivable by **OpenClaw** as a skill.

---

## What it does

- **Phone calls** — Twilio transcribes the caller, Claude replies naturally, Twilio speaks the reply back. A real back-and-forth conversation, not a phone tree.
- **SMS & web chat** — same agent, same business config, different channel.
- **Appointment booking** — the agent collects details, checks for conflicts, books, and notifies the owner.
- **Lead qualification** — the agent scores each contact against your criteria and flags qualified leads instantly by SMS/email.
- **Customizable dashboard** — set business details, tone, target market, qualification criteria, booking rules, FAQ, and owner alert contacts. View leads, appointments, transcripts, and customers.
- **Multi-business** — one deployment serves many businesses; inbound is routed by the Twilio number it arrives on.
- **OpenClaw-ready** — a token-protected API + skill wrapper lets your OpenClaw agent query and book on the front-desk's behalf.

---

## Architecture

```
            ┌──────────── Twilio ────────────┐
   Caller ──► Voice webhook  /voice/incoming  │
   Texter ──► SMS webhook    /sms/incoming    │
            └───────────────┬─────────────────┘
 Website ── widget ─► /public/chat            │
                                ▼
                    ┌────────────────────┐
                    │  Agent turn engine  │  build system prompt from the
                    │  (src/agent/*)      │  business row → call Claude with
                    └─────────┬───────────┘  tools → run tools → reply
                              ▼
   Claude tools: save_customer_info · book_appointment · record_lead · notify_owner
                              ▼
        SQLite (businesses, conversations, messages, customers, appointments, leads)
                              ▼
   Owner alerts (Twilio SMS + SMTP email)   ·   Dashboard (/dashboard.html)
   OpenClaw ─► /integration/* (bearer token)
```

The agent's entire personality and rules come from the `businesses` row, assembled into a system prompt in `src/agent/prompt.js`. Swap industries by editing the profile in the dashboard — no code changes.

---

## Quick start (local)

Requires **Node.js 20+**.

```bash
cp .env.example .env          # then edit .env (at minimum ANTHROPIC_API_KEY, ADMIN_*)
npm install
npm run init-db               # create the SQLite schema
npm run seed                  # optional: create an example business
npm start
```

Open <http://localhost:3000/dashboard.html>, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, and fill in your business profile under **Settings**. Test the web chat from the **Connect** tab.

> The first time you log in with the env password, the app stores a salted hash and you can rotate the password from the dashboard.

---

## Connecting Twilio

1. Buy a number in the [Twilio console](https://console.twilio.com) with Voice + SMS.
2. In the number's settings:
   - **A Call Comes In** → Webhook → `https://YOUR_DOMAIN/voice/incoming` (HTTP POST)
   - **A Message Comes In** → Webhook → `https://YOUR_DOMAIN/sms/incoming` (HTTP POST)
3. Put that same number (E.164, e.g. `+15551234567`) in the business profile's **Twilio phone number** field so inbound traffic routes to it.
4. Set `TWILIO_VALIDATE_SIGNATURE=true` and a correct `PUBLIC_BASE_URL` in production so only genuine Twilio requests are accepted.

The voice agent uses Twilio's speech `<Gather>` loop, which works on any HTTPS server. For lower latency you can later upgrade to Twilio **Media Streams** with a streaming TTS provider; the conversation engine (`runTurn`) stays the same — only the transport changes.

---

## Embedding the web chat

From the dashboard **Connect** tab, copy the one-line snippet onto any website:

```html
<script src="https://YOUR_DOMAIN/js/widget-embed.js" data-business="BUSINESS_ID"></script>
```

A chat bubble appears bottom-right and talks to the same agent.

---

## Deploying on Hostinger

> Use a **Hostinger VPS** (KVM) plan. Shared/web hosting cannot run a persistent Node process or open the webhook port.

```bash
# On the VPS (Ubuntu):
sudo apt update && sudo apt install -y nginx
# install Node 20+ (nvm or NodeSource), then:
git clone <your repo> /opt/ai-frontdesk && cd /opt/ai-frontdesk
cp .env.example .env && nano .env          # fill in real values, set PUBLIC_BASE_URL
npm install --omit=dev
npm run init-db
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup                    # run the printed command to enable on boot
```

Put Nginx in front as an HTTPS reverse proxy to `127.0.0.1:3000`:

```nginx
server {
  server_name agent.yourdomain.com;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Real-IP $remote_addr; }
}
```

Then issue a certificate with `certbot --nginx -d agent.yourdomain.com`. Twilio **requires HTTPS** for webhooks.

Point your Hostinger-managed DNS `A` record (`agent`) at the VPS IP.

---

## Using MySQL instead of SQLite

SQLite is the zero-config default and is plenty for a single VPS. To use Hostinger's MySQL:

1. The data access lives behind the models in `src/models/*` and `src/db/index.js`. Replace `better-sqlite3` with a MySQL client (e.g. `mysql2`) and translate the queries (they are plain SQL). The `schema.sql` types map closely; change `datetime('now')` defaults to `CURRENT_TIMESTAMP` and `INTEGER PRIMARY KEY` admin row to a `TINYINT`.
2. Move session storage out of memory (it already survives restarts only by re-login) if you run multiple instances.

Most users never need this — keep SQLite unless you have a specific reason.

---

## OpenClaw integration

See [`openclaw/skill/SKILL.md`](openclaw/skill/SKILL.md). In short: set `INTEGRATION_TOKEN` in this app, set `FRONTDESK_URL` + `FRONTDESK_TOKEN` in your OpenClaw process, and register `openclaw/skill/frontdesk-skill.js` following the current skill format at <https://docs.openclaw.ai>. Your OpenClaw agent can then list/book on the front-desk in natural language.

---

## Configuration reference

All settings live in `.env` (see `.env.example`). Key ones: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` (check current ids at <https://docs.claude.com>), `TWILIO_*`, `ADMIN_*`, `SESSION_SECRET`, optional `SMTP_*`, and `INTEGRATION_TOKEN`.

## Project layout

```
src/
  server.js            Express app + routing
  config.js            env loading
  db/                  schema.sql, connection, init, seed
  models/              businesses, conversations/messages, customers/appointments/leads
  agent/               claude.js, prompt.js (persona), tools.js, engine.js (turn loop)
  channels/            voice.js, sms.js, webchat.js, validate.js
  notify/              owner SMS + email
  auth/                admin login, scrypt hashing, sessions
  routes/              auth, dashboard api, integration api
public/                login, dashboard, widget, css/js
openclaw/skill/        OpenClaw skill wrapper + docs
```

## Cost & latency notes

- Each conversational turn is one (or a few, if tools are called) Claude requests. For live phone calls, **Haiku** is fastest/cheapest; **Sonnet** gives noticeably better judgment for qualification. Set `CLAUDE_MODEL` accordingly.
- Twilio bills per voice minute and per SMS segment separately from Claude usage.

## Security

- Twilio signature validation, scrypt-hashed admin password, signed HTTP-only session cookies, bearer-token integration API, and privacy-preserving defaults. Always run behind HTTPS in production and set a strong `SESSION_SECRET`.
- This is a solid foundation, not a compliance certification. If you handle health or financial data, review the relevant regulations (HIPAA, etc.) before going live.
