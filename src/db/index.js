import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure the data directory exists.
const dbDir = path.dirname(path.resolve(config.dbPath));
fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(path.resolve(config.dbPath));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Create tables if they do not exist. Safe to call on every boot. */
export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

export default db;
