/**
 * Qoria lightweight JSON database (file-backed).
 * Persist users, sessions meta, conversations, messages, memories, usage.
 * On Render free disk is ephemeral — document disk upgrade for production.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'qoria.json');

function empty() {
  return {
    users: [],
    conversations: [],
    messages: [],
    memories: [],
    usage: {}, // userId -> { date: 'YYYY-MM-DD', messages: n, images: n, ensemble: n }
  };
}

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(empty(), null, 2));
  }
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    const e = empty();
    save(e);
    return e;
  }
}

function save(db) {
  ensure();
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getUsage(db, userId) {
  const u = db.usage[userId] || { date: today(), messages: 0, images: 0, ensemble: 0 };
  if (u.date !== today()) {
    return { date: today(), messages: 0, images: 0, ensemble: 0 };
  }
  return u;
}

function setUsage(db, userId, usage) {
  db.usage[userId] = usage;
}

module.exports = {
  uuidv4,
  load,
  save,
  today,
  getUsage,
  setUsage,
  DATA_DIR,
  DB_PATH,
};
