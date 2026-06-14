# Front-Desk skill for OpenClaw

This folder lets your **OpenClaw** agent manage the AI Front-Desk — checking appointments and leads, and booking slots — through natural language.

## How the two systems relate

- **AI Front-Desk (this project)** is a standalone Node service that answers live phone calls, SMS, and web chats using Claude, books appointments, qualifies leads, and serves the owner dashboard. It runs its own Claude loop so it can respond in real time on a call.
- **OpenClaw** is your always-on personal agent gateway (also Claude-powered, BYOK). It is *not* required for the front-desk to work. This skill simply gives OpenClaw a way to **query and drive** the front-desk, so your personal assistant can answer "what's on the calendar?" or book things for you.

You can run both on the same Hostinger VPS.

## Setup

1. In the front-desk `.env`, set a token:
   ```
   INTEGRATION_TOKEN=$(openssl rand -hex 24)
   ```
   Restart the front-desk so `/integration/*` becomes active.

2. In the **OpenClaw** process environment, set:
   ```
   FRONTDESK_URL=https://agent.yourdomain.com
   FRONTDESK_TOKEN=<the same INTEGRATION_TOKEN value>
   ```

3. Make `frontdesk-skill.js` available to OpenClaw. OpenClaw discovers skills/tools
   from its skills directory; the precise manifest format depends on your installed
   version, so follow the current **Skills / Tools** guide at
   <https://docs.openclaw.ai>. The exported async functions
   (`listBusinesses`, `listAppointments`, `listLeads`, `bookAppointment`) and the
   `tools` array are written to map directly onto a tool interface — wrap them in
   the descriptor your OpenClaw version expects.

4. Ask your OpenClaw agent things like:
   - "List the businesses on the front desk."
   - "What appointments does Evergreen Realty have?"
   - "Book a 30-minute consultation tomorrow at 3pm for Jane Doe, +15551112222."

## Security notes

- The `/integration` API is gated by the bearer token; keep it secret and serve the
  front-desk over HTTPS so the token is never sent in clear text.
- This skill only exposes read + appointment-create. It deliberately does **not**
  expose delete/cancel or password operations.
