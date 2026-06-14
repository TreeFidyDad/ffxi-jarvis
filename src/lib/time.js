const { DateTime } = require('luxon');

// Parse a wall-clock date + time in a given IANA timezone into a UTC unix timestamp (seconds).
// Returns { ok: true, ts } or { ok: false, error }.
function parseEventTime(date, time, timezone) {
  if (!DateTime.local().setZone(timezone).isValid) {
    return { ok: false, error: `Unknown timezone \`${timezone}\`. Use an IANA name like \`America/New_York\`.` };
  }

  const dt = DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm', { zone: timezone });
  if (!dt.isValid) {
    return {
      ok: false,
      error: `Could not read that date/time. Use date \`YYYY-MM-DD\` and time \`HH:MM\` (24h). (${dt.invalidReason || 'invalid'})`,
    };
  }

  return { ok: true, ts: Math.floor(dt.toSeconds()) };
}

// Discord renders these as localized timestamps in each viewer's own timezone.
const discordTime = (ts, style = 'F') => `<t:${ts}:${style}>`;
const discordRelative = (ts) => `<t:${ts}:R>`;

module.exports = { parseEventTime, discordTime, discordRelative };
