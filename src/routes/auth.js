import express from 'express';
import { checkLogin, createSession, destroySession } from '../auth/index.js';

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (!checkLogin(email, password)) return res.status(401).json({ error: 'invalid credentials' });

  const token = createSession(email.toLowerCase());
  res.cookie('session', token, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12,
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  const token = req.signedCookies?.session;
  if (token) destroySession(token);
  res.clearCookie('session');
  res.json({ ok: true });
});

export default router;
