const { DateTime } = require('luxon');

// Parse a wall-clock date + time in a given IANA timezone into a UTC unix timestamp (seconds).
// Accepts 24-hour (17:30, 5:30) and 12-hour (5:30pm, 5pm, 5:30 PM) time formats.
// Returns { ok: true, ts } or { ok: false, error }.
const TIME_FORMATS = ['HH:mm', 'H:mm', 'h:mma', 'h:mm a', 'ha', 'h a', 'hmma'];

function parseEventTime(date, time, timezone) {
  if (!DateTime.local().setZone(timezone).isValid) {
    return { ok: false, error: `Unknown timezone \`${timezone}\`. Use an IANA name like \`America/New_York\`.` };
  }

  // Normalize: drop internal spaces around am/pm and uppercase the meridiem so
  // "5:30 pm", "5:30PM" and "5:30pm" all parse the same way.
  const cleanTime = String(time).trim().replace(/\s+/g, '').toLowerCase();

  let dt;
  for (const fmt of TIME_FORMATS) {
    dt = DateTime.fromFormat(`${date} ${cleanTime}`, `yyyy-MM-dd ${fmt}`, { zone: timezone });
    if (dt.isValid) break;
  }

  if (!dt || !dt.isValid) {
    return {
      ok: false,
      error:
        'Could not read that date/time. Use date `YYYY-MM-DD` (e.g. `2026-06-27`) and a time ' +
        'like `13:00`, `5:30pm`, or `5pm`.',
    };
  }

  return { ok: true, ts: Math.floor(dt.toSeconds()) };
}

// Split a stored unix timestamp back into wall-clock { date, time } strings in
// the event's timezone — used to prefill the edit modal.
function formatLocalParts(ts, timezone) {
  const dt = DateTime.fromSeconds(ts, { zone: timezone });
  if (!dt.isValid) return { date: '', time: '' };
  return { date: dt.toFormat('yyyy-MM-dd'), time: dt.toFormat('HH:mm') };
}

// Discord renders these as localized timestamps in each viewer's own timezone.
const discordTime = (ts, style = 'F') => `<t:${ts}:${style}>`;
const discordRelative = (ts) => `<t:${ts}:R>`;

// Build a "Add to Google Calendar" link. startTs in unix seconds, duration in minutes.
function googleCalendarLink({ title, startTs, durationMin = 120, details, location }) {
  const fmt = (s) => DateTime.fromSeconds(s, { zone: 'utc' }).toFormat("yyyyLLdd'T'HHmmss'Z'");
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Event',
    dates: `${fmt(startTs)}/${fmt(startTs + durationMin * 60)}`,
  });
  if (details) params.set('details', details);
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// True if `tz` is a valid IANA timezone name (e.g. America/Los_Angeles).
function isValidTimezone(tz) {
  return !!tz && DateTime.local().setZone(tz).isValid;
}

module.exports = { parseEventTime, isValidTimezone, formatLocalParts, discordTime, discordRelative, googleCalendarLink };
