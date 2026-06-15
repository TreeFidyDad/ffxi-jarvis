const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

// Ensure the directory for the database file exists.
const dbPath = path.resolve(config.databasePath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id      TEXT NOT NULL,
    channel_id    TEXT NOT NULL,
    message_id    TEXT,
    creator_id    TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    start_ts      INTEGER NOT NULL,
    timezone      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open',
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signups (
    event_id   INTEGER NOT NULL,
    user_id    TEXT NOT NULL,
    username   TEXT NOT NULL,
    role       TEXT,
    job        TEXT,
    status     TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_events_message ON events(message_id);
  CREATE INDEX IF NOT EXISTS idx_signups_event ON signups(event_id);
`);

// ---- Lightweight migrations (idempotent) -----------------------------------
function tableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
}

function addColumnIfMissing(table, column, definition) {
  if (!tableColumns(table).has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Newer event metadata.
addColumnIfMissing('events', 'creator_name', 'TEXT');
addColumnIfMissing('events', 'leader', 'TEXT');
addColumnIfMissing('events', 'url', 'TEXT');
addColumnIfMissing('events', 'image_url', 'TEXT');
addColumnIfMissing('events', 'cap', 'INTEGER');
addColumnIfMissing('events', 'duration_min', 'INTEGER NOT NULL DEFAULT 120');

// Immutable signup order used for stable slot numbers. Backfill existing rows.
if (!tableColumns('signups').has('created_at')) {
  db.exec('ALTER TABLE signups ADD COLUMN created_at INTEGER');
  db.exec('UPDATE signups SET created_at = updated_at WHERE created_at IS NULL');
}

// Per-user remembered timezone, so each member's typed event times are
// interpreted in their own zone (Discord doesn't expose a user's timezone).
db.exec(`
  CREATE TABLE IF NOT EXISTS user_prefs (
    user_id  TEXT PRIMARY KEY,
    timezone TEXT
  );
`);

// Player-submitted improvement suggestions for the bot / events.
db.exec(`
  CREATE TABLE IF NOT EXISTS suggestions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT,
    user_id    TEXT NOT NULL,
    username   TEXT NOT NULL,
    text       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );
`);

const now = () => Math.floor(Date.now() / 1000);

// ---- Events ----------------------------------------------------------------

const insertEventStmt = db.prepare(`
  INSERT INTO events
    (guild_id, channel_id, creator_id, creator_name, leader, title, description,
     start_ts, timezone, url, image_url, cap, duration_min, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function createEvent({
  guildId,
  channelId,
  creatorId,
  creatorName,
  leader,
  title,
  description,
  startTs,
  timezone,
  url,
  imageUrl,
  cap,
  durationMin,
}) {
  const result = insertEventStmt.run(
    guildId,
    channelId,
    creatorId,
    creatorName ?? null,
    leader ?? null,
    title,
    description ?? null,
    startTs,
    timezone,
    url ?? null,
    imageUrl ?? null,
    cap ?? null,
    durationMin ?? 120,
    now(),
  );
  return getEvent(Number(result.lastInsertRowid));
}

const getEventStmt = db.prepare('SELECT * FROM events WHERE id = ?');
function getEvent(id) {
  return getEventStmt.get(id) || null;
}

const getEventByMessageStmt = db.prepare('SELECT * FROM events WHERE message_id = ?');
function getEventByMessage(messageId) {
  return getEventByMessageStmt.get(messageId) || null;
}

const setEventMessageStmt = db.prepare('UPDATE events SET message_id = ? WHERE id = ?');
function setEventMessage(id, messageId) {
  setEventMessageStmt.run(messageId, id);
}

const setEventStatusStmt = db.prepare('UPDATE events SET status = ? WHERE id = ?');
function setEventStatus(id, status) {
  setEventStatusStmt.run(status, id);
}

// Update a whitelisted set of event columns. Pass only the fields to change.
// Changing start_ts resets reminder_sent so the reminder fires for the new time.
const UPDATABLE_COLUMNS = new Set([
  'title',
  'description',
  'start_ts',
  'timezone',
  'leader',
  'url',
  'image_url',
  'cap',
  'duration_min',
]);
function updateEvent(id, fields) {
  const entries = Object.entries(fields).filter(([k]) => UPDATABLE_COLUMNS.has(k));
  if (!entries.length) return getEvent(id);
  const sets = entries.map(([k]) => `${k} = ?`);
  const values = entries.map(([, v]) => (v === undefined ? null : v));
  if (entries.some(([k]) => k === 'start_ts')) sets.push('reminder_sent = 0');
  db.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  return getEvent(id);
}

const deleteEventStmt = db.prepare('DELETE FROM events WHERE id = ?');
const deleteSignupsForEventStmt = db.prepare('DELETE FROM signups WHERE event_id = ?');
function deleteEvent(id) {
  deleteSignupsForEventStmt.run(id);
  deleteEventStmt.run(id);
}

// Events that are open, in the future, and due for a reminder within `windowSeconds`.
const dueRemindersStmt = db.prepare(`
  SELECT * FROM events
  WHERE status = 'open'
    AND reminder_sent = 0
    AND start_ts > ?
    AND start_ts <= ?
`);
function getDueReminders(windowSeconds) {
  const ts = now();
  return dueRemindersStmt.all(ts, ts + windowSeconds);
}

const markReminderSentStmt = db.prepare('UPDATE events SET reminder_sent = 1 WHERE id = ?');
function markReminderSent(id) {
  markReminderSentStmt.run(id);
}

// ---- Signups ---------------------------------------------------------------

const getSignupStmt = db.prepare('SELECT * FROM signups WHERE event_id = ? AND user_id = ?');
function getSignup(eventId, userId) {
  return getSignupStmt.get(eventId, userId) || null;
}

// Stable order: by first-signup time, falling back to updated_at for legacy rows.
const getSignupsStmt = db.prepare(
  'SELECT * FROM signups WHERE event_id = ? ORDER BY COALESCE(created_at, updated_at) ASC, rowid ASC',
);
function getSignups(eventId) {
  return getSignupsStmt.all(eventId);
}

const upsertSignupStmt = db.prepare(`
  INSERT INTO signups (event_id, user_id, username, role, job, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id, user_id) DO UPDATE SET
    username   = excluded.username,
    role       = excluded.role,
    job        = excluded.job,
    status     = excluded.status,
    updated_at = excluded.updated_at
`);

// Merge `changes` (role/job/status) onto any existing signup for this user.
// created_at is set once on first signup and never changed (stable slot order).
function upsertSignup(eventId, userId, username, changes) {
  const existing = getSignup(eventId, userId);
  const role = changes.role !== undefined ? changes.role : existing?.role ?? null;
  const job = changes.job !== undefined ? changes.job : existing?.job ?? null;
  const status = changes.status !== undefined ? changes.status : existing?.status ?? 'attending';
  const ts = now();
  const createdAt = existing?.created_at ?? ts;
  upsertSignupStmt.run(eventId, userId, username, role, job, status, createdAt, ts);
  return getSignup(eventId, userId);
}

const removeSignupStmt = db.prepare('DELETE FROM signups WHERE event_id = ? AND user_id = ?');
function removeSignup(eventId, userId) {
  removeSignupStmt.run(eventId, userId);
}

// ---- Suggestions -----------------------------------------------------------

const insertSuggestionStmt = db.prepare(`
  INSERT INTO suggestions (guild_id, user_id, username, text, status, created_at)
  VALUES (?, ?, ?, ?, 'open', ?)
`);
function addSuggestion({ guildId, userId, username, text }) {
  const result = insertSuggestionStmt.run(guildId ?? null, userId, username, text, now());
  return getSuggestion(Number(result.lastInsertRowid));
}

const getSuggestionStmt = db.prepare('SELECT * FROM suggestions WHERE id = ?');
function getSuggestion(id) {
  return getSuggestionStmt.get(id) || null;
}

const getSuggestionsAllStmt = db.prepare(
  'SELECT * FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC, id DESC',
);
const getSuggestionsByStatusStmt = db.prepare(
  'SELECT * FROM suggestions WHERE guild_id = ? AND status = ? ORDER BY created_at DESC, id DESC',
);
function getSuggestions(guildId, status) {
  return status
    ? getSuggestionsByStatusStmt.all(guildId, status)
    : getSuggestionsAllStmt.all(guildId);
}

const setSuggestionStatusStmt = db.prepare('UPDATE suggestions SET status = ? WHERE id = ?');
function setSuggestionStatus(id, status) {
  setSuggestionStatusStmt.run(status, id);
  return getSuggestion(id);
}

// ---- User preferences ------------------------------------------------------

const getUserTimezoneStmt = db.prepare('SELECT timezone FROM user_prefs WHERE user_id = ?');
function getUserTimezone(userId) {
  return getUserTimezoneStmt.get(userId)?.timezone || null;
}

const setUserTimezoneStmt = db.prepare(`
  INSERT INTO user_prefs (user_id, timezone) VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone
`);
function setUserTimezone(userId, timezone) {
  setUserTimezoneStmt.run(userId, timezone);
}

module.exports = {
  db,
  createEvent,
  getEvent,
  getEventByMessage,
  setEventMessage,
  setEventStatus,
  updateEvent,
  deleteEvent,
  getDueReminders,
  markReminderSent,
  getSignup,
  getSignups,
  upsertSignup,
  removeSignup,
  getUserTimezone,
  setUserTimezone,
  addSuggestion,
  getSuggestion,
  getSuggestions,
  setSuggestionStatus,
};
