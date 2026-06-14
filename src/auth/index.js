import crypto from 'node:crypto';
import db from '../db/index.js';
import { config } from '../config.js';

// In-memory session store (token -> { email, created }). Cleared on restart;
// operators simply log in again. For multi-instance setups, back this with the DB.
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

/** Ensure the admin row exists (seeded from env on first boot). */
export function ensureAdmin() {
  const row = db.prepare('SELECT * FROM admin_user WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT INTO admin_user (id, email) VALUES (1, ?)').run(config.admin.email);
  }
}

/** Validate credentials. On first successful login with the env password, store a hash. */
export function checkLogin(email, password) {
  const row = db.prepare('SELECT * FROM admin_user WHERE id = 1').get();
  if (!row) return false;
  if (email.toLowerCase() !== row.email.toLowerCase()) return false;

  if (!row.password_hash) {
    // First login: accept the env password and persist a salted hash.
    if (password && password === config.admin.password) {
      const salt = crypto.randomBytes(16).toString('hex');
      db.prepare('UPDATE admin_user SET password_hash = ?, salt = ? WHERE id = 1').run(hash(password, salt), salt);
      return true;
    }
    return false;
  }
  const candidate = hash(password, row.salt);
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(row.password_hash));
}

export function changePassword(newPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE admin_user SET password_hash = ?, salt = ? WHERE id = 1').run(hash(newPassword, salt), salt);
}

export function createSession(email) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email, created: Date.now() });
  return token;
}

export function destroySession(token) {
  sessions.delete(token);
}

/** Express middleware — requires a valid session cookie. */
export function requireAuth(req, res, next) {
  const token = req.signedCookies?.session;
  const sess = token && sessions.get(token);
  if (!sess || Date.now() - sess.created > SESSION_TTL_MS) {
    if (token) sessions.delete(token);
    // Use originalUrl: req.path is mount-relative, so it would be "/businesses"
    // (not "/api/businesses") when this middleware is mounted under /api.
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
    return res.redirect('/login.html');
  }
  req.admin = sess;
  next();
}
