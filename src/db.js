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

const now = () => Math.floor(Date.now() / 1000);

// ---- Events ----------------------------------------------------------------

const insertEventStmt = db.prepare(`
  INSERT INTO events (guild_id, channel_id, creator_id, title, description, start_ts, timezone, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function createEvent({ guildId, channelId, creatorId, title, description, startTs, timezone }) {
  const result = insertEventStmt.run(
    guildId,
    channelId,
    creatorId,
    title,
    description ?? null,
    startTs,
    timezone,
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

const getSignupsStmt = db.prepare('SELECT * FROM signups WHERE event_id = ? ORDER BY updated_at ASC');
function getSignups(eventId) {
  return getSignupsStmt.all(eventId);
}

const upsertSignupStmt = db.prepare(`
  INSERT INTO signups (event_id, user_id, username, role, job, status, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id, user_id) DO UPDATE SET
    username   = excluded.username,
    role       = excluded.role,
    job        = excluded.job,
    status     = excluded.status,
    updated_at = excluded.updated_at
`);

// Merge `changes` (role/job/status) onto any existing signup for this user.
function upsertSignup(eventId, userId, username, changes) {
  const existing = getSignup(eventId, userId);
  const role = changes.role !== undefined ? changes.role : existing?.role ?? null;
  const job = changes.job !== undefined ? changes.job : existing?.job ?? null;
  const status = changes.status !== undefined ? changes.status : existing?.status ?? 'attending';
  upsertSignupStmt.run(eventId, userId, username, role, job, status, now());
  return getSignup(eventId, userId);
}

const removeSignupStmt = db.prepare('DELETE FROM signups WHERE event_id = ? AND user_id = ?');
function removeSignup(eventId, userId) {
  removeSignupStmt.run(eventId, userId);
}

module.exports = {
  db,
  createEvent,
  getEvent,
  getEventByMessage,
  setEventMessage,
  setEventStatus,
  deleteEvent,
  getDueReminders,
  markReminderSent,
  getSignup,
  getSignups,
  upsertSignup,
  removeSignup,
};
