/**
 * Qoria lightweight JSON database (file-backed).
 * Persist users, sessions meta, conversations, messages, memories, usage.
 * On Render free disk is ephemeral — document disk upgrade for production.
 *
 * Usage tracking:
 * - Free: daily counters (date = YYYY-MM-DD) for images / videos
 * - Pro: calendar-week counters (weekStart = Monday YYYY-MM-DD, America/Toronto)
 *   Soft weekly ceilings so spend stays profitable while feeling generous vs Free.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'qoria.json');
const TZ = 'America/Toronto';

function empty() {
  return {
    users: [],
    conversations: [],
    messages: [],
    memories: [],
    usage: {}, // userId -> daily + weekly counters
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

/** Local calendar date YYYY-MM-DD in America/Toronto */
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Monday of the current calendar week (America/Toronto), YYYY-MM-DD.
 * Soft Pro ceilings reset every Monday — message: « revient lundi ».
 */
function weekStart() {
  const dateStr = today(); // YYYY-MM-DD Toronto
  const [y, m, d] = dateStr.split('-').map(Number);
  // Noon UTC on that civil date → stable weekday for Toronto (no DST edge at midnight)
  const noon = new Date(Date.UTC(y, m - 1, d, 16, 0, 0)); // ~12:00 ET
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(noon);
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[weekday] ?? 0;
  const monday = new Date(Date.UTC(y, m - 1, d - offset, 16, 0, 0));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(monday);
}

function blankDaily() {
  return { date: today(), messages: 0, images: 0, videos: 0, ensemble: 0 };
}

function blankWeekly() {
  return {
    weekStart: weekStart(),
    weekMessages: 0,
    weekImages: 0,
    weekVideos: 0,
    weekEnsemble: 0,
  };
}

/** Daily usage (Free quotas). Also carries weekly fields for Pro. */
function getUsage(db, userId) {
  const stored = db.usage[userId] || {};
  const daily =
    stored.date === today()
      ? {
          date: stored.date,
          messages: stored.messages || 0,
          images: stored.images || 0,
          videos: stored.videos || 0,
          ensemble: stored.ensemble || 0,
        }
      : blankDaily();

  const weekly =
    stored.weekStart === weekStart()
      ? {
          weekStart: stored.weekStart,
          weekMessages: stored.weekMessages || 0,
          weekImages: stored.weekImages || 0,
          weekVideos: stored.weekVideos || 0,
          weekEnsemble: stored.weekEnsemble || 0,
        }
      : blankWeekly();

  return { ...daily, ...weekly };
}

function setUsage(db, userId, usage) {
  db.usage[userId] = usage;
}

module.exports = {
  uuidv4,
  load,
  save,
  today,
  weekStart,
  getUsage,
  setUsage,
  DATA_DIR,
  DB_PATH,
  TZ,
};
