const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { DateTime } = require('luxon');

// Custom IDs for calendar navigation buttons.
const CAL = {
  PREV: 'cal:prev:',   // cal:prev:<year>:<month>
  NEXT: 'cal:next:',   // cal:next:<year>:<month>
};

// Day-of-week headers (Mon–Sun).
const DOW_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Build a calendar embed + navigation buttons for a given month.
 * @param {object} opts
 * @param {number} opts.year - 4-digit year
 * @param {number} opts.month - 1-12
 * @param {Array} opts.events - rows from the events table for this guild/month
 * @param {string} opts.guildId - used to build message links
 * @param {string} opts.timezone - IANA timezone for rendering day boundaries
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildCalendarMessage({ year, month, events, guildId, timezone }) {
  const zone = timezone || 'America/New_York';
  const monthStart = DateTime.fromObject({ year, month, day: 1 }, { zone });
  const monthName = monthStart.toFormat('LLLL yyyy');
  const daysInMonth = monthStart.daysInMonth;

  // Filter out expired events (past their end time).
  const nowTs = Math.floor(Date.now() / 1000);
  const upcoming = events.filter((evt) => {
    const endTs = evt.start_ts + (evt.duration_min || 120) * 60;
    return endTs > nowTs;
  });

  // Group events by day-of-month.
  const byDay = new Map();
  for (const evt of upcoming) {
    const dt = DateTime.fromSeconds(evt.start_ts, { zone });
    const day = dt.day;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(evt);
  }

  // Sort events within each day by start time.
  for (const [, dayEvents] of byDay) {
    dayEvents.sort((a, b) => a.start_ts - b.start_ts);
  }

  // Build the calendar body — list events by day.
  const lines = [];
  lines.push(`## 📅 ${monthName}`);
  lines.push('');

  if (events.length === 0) {
    lines.push('*No events scheduled this month.*');
  } else {
    for (let day = 1; day <= daysInMonth; day++) {
      if (!byDay.has(day)) continue;
      const dayEvents = byDay.get(day);
      const dt = DateTime.fromObject({ year, month, day }, { zone });
      const dow = dt.toFormat('ccc'); // Mon, Tue, etc.
      lines.push(`### ${dow}, ${dt.toFormat('LLLL d')}`);
      for (const evt of dayEvents) {
        const evtDt = DateTime.fromSeconds(evt.start_ts, { zone });
        const time = evtDt.toFormat('h:mm a');
        const link = buildEventLink(evt, guildId);
        const status = evt.status === 'closed' ? ' 🔒' : '';
        if (link) {
          lines.push(`> ⏰ **${time}** — [${evt.title}](${link})${status}`);
        } else {
          lines.push(`> ⏰ **${time}** — **${evt.title}**${status}`);
        }
      }
      lines.push('');
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`📅  ${monthName} Events`)
    .setDescription(lines.slice(2).join('\n')) // skip the markdown title since we use embed title
    .setColor(0x5865f2)
    .setFooter({ text: `Timezone: ${zone} • Click an event to open its signup sheet` });

  // Navigation buttons.
  const prev = monthStart.minus({ months: 1 });
  const next = monthStart.plus({ months: 1 });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CAL.PREV}${prev.year}:${prev.month}`)
      .setLabel(`◀ ${prev.toFormat('LLL yyyy')}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CAL.NEXT}${next.year}:${next.month}`)
      .setLabel(`${next.toFormat('LLL yyyy')} ▶`)
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Build a Discord message link for an event (jump-to-message).
 */
function buildEventLink(event, guildId) {
  if (!event.message_id || !event.channel_id) return null;
  return `https://discord.com/channels/${guildId}/${event.channel_id}/${event.message_id}`;
}

module.exports = { CAL, buildCalendarMessage };
