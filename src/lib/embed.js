const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { ROLES, EXTRA_STATUSES, ROLE_GROUPS, STATUS, ROLE_BY_KEY, MAIN_ROLE_BUTTONS, DPS_ROLES } = require('../data/roles');
const { JOBS, jobLabel, jobEmoji, jobName } = require('../data/jobs');
const { discordTime, discordRelative, googleCalendarLink, formatLocalParts } = require('./time');
const { jobEmojiMention, jobEmojiComponent, roleEmojiMention, roleEmojiComponent } = require('./guildEmojis');

// ---- Component custom IDs --------------------------------------------------
const ID = {
  ROLE_PREFIX: 'evt:role:', // evt:role:<roleKey>
  DPS_OPEN: 'evt:dps', // opens the DPS subtype picker
  DPS_SET_PREFIX: 'evt:dpsset:', // evt:dpsset:<eventId>:<roleKey>
  STATUS_PREFIX: 'evt:status:', // evt:status:<statusKey>
  LEAVE: 'evt:leave',
  JOB_SELECT: 'evt:job',
  EDIT_PREFIX: 'evt:edit:', // evt:edit:<eventId>
  EDIT_LINKS_PREFIX: 'evt:editlinks:', // evt:editlinks:<eventId>
  EDIT_MODAL_PREFIX: 'evt:editmodal:', // evt:editmodal:<eventId>
  EDIT_LINKS_MODAL_PREFIX: 'evt:editlinksmodal:', // evt:editlinksmodal:<eventId>
  CREATE_OPEN: 'evt:createopen', // persistent "Create Event" button
  CREATE_MODAL: 'evt:createmodal', // modal submitted from the board
};

// ---- Suggestion box custom IDs ---------------------------------------------
const SUG = {
  OPEN: 'sug:open', // persistent "Suggest an improvement" button
  MODAL: 'sug:modal', // modal submitted by a member
  INPUT: 'text', // modal text input id
};

const ROLE_EMOJI = Object.fromEntries([...ROLE_BY_KEY.values()].map((r) => [r.key, r.emoji]));
const ROLE_ICONS_BY_KEY = Object.fromEntries([...ROLE_BY_KEY.values()].map((r) => [r.key, r.icons]));

// Render a short title with spaced-out letters for the clean "S K Y  G O D S"
// look (embed titles are already shown bold by Discord). Plain spacing renders
// reliably on every client — unlike emoji block letters, which tofu on some.
// Long titles are left untouched so they don't wrap awkwardly.
function blockifyTitle(title) {
  const text = String(title || '').trim();
  if (!text || text.length > 28) return text;
  return [...text.toUpperCase()]
    .map((ch) => (ch === ' ' ? '\u2002' : ch)) // en-space between words
    .join('\u2009'); // thin space between letters
}

// An event is "expired" once its scheduled end (start + duration) has passed.
function isExpired(event) {
  const end = event.start_ts + (event.duration_min || 120) * 60;
  return Math.floor(Date.now() / 1000) >= end;
}

// "`3` ⚔️ Name" — slot number, role icon (custom if available), display name.
function formatMember(s, slot, guildId) {
  let roleIcon = '';
  if (s.role) {
    const custom = roleEmojiMention(guildId, ROLE_ICONS_BY_KEY[s.role]);
    roleIcon = `${custom || ROLE_EMOJI[s.role] || '⚔️'} `;
  }
  return `\`${String(slot).padStart(2, ' ')}\` ${roleIcon}${s.username}`;
}

function buildEmbed(event, signups) {
  const attending = signups.filter((s) => s.status === STATUS.ATTENDING);
  const tentative = signups.filter((s) => s.status === STATUS.TENTATIVE);
  const absence = signups.filter((s) => s.status === STATUS.ABSENCE);
  const closed = event.status === 'closed';
  const expired = isExpired(event);

  // Stable slot number per user, in signup order across all statuses.
  const slot = new Map();
  signups.forEach((s, i) => slot.set(s.user_id, i + 1));

  // Expired events go red, closed (but not yet past) go grey, upcoming blurple.
  const color = expired ? 0xed4245 : closed ? 0x95a5a6 : 0x5865f2;
  const titlePrefix = closed ? '🔒 ' : expired ? '🔴 ' : '';
  const embed = new EmbedBuilder()
    .setTitle(`${titlePrefix}${blockifyTitle(event.title)}`)
    .setColor(color);
  if (event.image_url) embed.setImage(event.image_url);

  // ---- Header / description block ----
  const cap = event.cap || 0;
  const GAP = '\u2003\u2003'; // wide gap to fake columns in the description
  const roleCounts = ROLE_GROUPS.map((g) => {
    const n = attending.filter((s) => g.keys.includes(s.role)).length;
    const icon = roleEmojiMention(event.guild_id, g.icons) || g.emoji;
    return `${icon} ${g.label} **${n}**`;
  }).join(GAP);
  const head = (cap ? Math.min(attending.length, cap) : attending.length) + (cap ? `/${cap}` : '');
  const tentSuffix = tentative.length ? ` (+${tentative.length})` : '';

  const lines = [];
  if (event.url) lines.push(event.url);
  if (event.description) lines.push(event.description);
  lines.push('');

  // Row 1: leader + headcount.
  const topBits = [];
  if (event.leader || event.creator_name) topBits.push(`🏳️ **${event.leader || event.creator_name}**`);
  topBits.push(`👥 **${head}**${tentSuffix}`);
  lines.push(topBits.join(GAP));

  // Row 2: date · time · countdown.
  lines.push(
    [`🗓️ ${discordTime(event.start_ts, 'D')}`, `🕒 ${discordTime(event.start_ts, 't')}`, `⏳ ${discordRelative(event.start_ts)}`].join(GAP),
  );

  // Row 3: role breakdown on its own line.
  lines.push('');
  lines.push(roleCounts);
  if (closed) lines.push('\n**Signups are closed.**');
  embed.setDescription(lines.join('\n'));

  // ---- Standby split (overflow beyond cap), by signup order ----
  const main = cap ? attending.slice(0, cap) : attending;
  const standby = cap ? attending.slice(cap) : [];

  // ---- One column per Job that has attendees ----
  for (const job of JOBS) {
    const members = main.filter((s) => s.job === job.code);
    if (!members.length) continue;
    const emoji = jobEmojiMention(event.guild_id, job.code) || job.emoji;
    embed.addFields({
      name: `${emoji} **__${jobName(job.code)}__** (${members.length})`,
      value: members.map((s) => formatMember(s, slot.get(s.user_id), event.guild_id)).join('\n'),
      inline: true,
    });
  }

  // Attending but no Job chosen yet.
  const noJob = main.filter((s) => !s.job);
  if (noJob.length) {
    embed.addFields({
      name: `❔ No Job selected (${noJob.length})`,
      value: noJob.map((s) => formatMember(s, slot.get(s.user_id), event.guild_id)).join('\n'),
      inline: true,
    });
  }

  if (standby.length) {
    embed.addFields({
      name: `🪑 Standby (${standby.length})`,
      value: standby
        .map((s) => `${formatMember(s, slot.get(s.user_id), event.guild_id)} \`${jobLabel(s.job)}\``)
        .join('\n'),
      inline: false,
    });
  }

  // ---- Tentative / Absence: compact single-line lists ----
  const inlineList = (arr) =>
    arr.map((s) => `\`${slot.get(s.user_id)}\` ${s.username}`).join(', ');
  const statusBlock = [];
  if (tentative.length) statusBlock.push(`❔ **Tentative (${tentative.length}):** ${inlineList(tentative)}`);
  if (absence.length) statusBlock.push(`❌ **Absence (${absence.length}):** ${inlineList(absence)}`);
  if (statusBlock.length) {
    embed.addFields({ name: '\u200b', value: statusBlock.join('\n'), inline: false });
  }

  // ---- Footer link row (Add to Google Calendar) ----
  const gcal = googleCalendarLink({
    title: event.title,
    startTs: event.start_ts,
    durationMin: event.duration_min || 120,
    details: event.url || event.description || undefined,
  });
  embed.addFields({ name: '\u200b', value: `[Add to Google Calendar](${gcal})`, inline: false });

  const footer = closed
    ? `Event #${event.id} • signups closed`
    : expired
      ? `Event #${event.id} • ended`
      : `Event #${event.id}`;
  embed.setFooter({ text: footer });

  return embed;
}

function buildComponents(event) {
  if (event.status === 'closed') return [];

  const roleRow = new ActionRowBuilder().addComponents(
    ...MAIN_ROLE_BUTTONS.map((b) => {
      const customId = b.kind === 'dps' ? ID.DPS_OPEN : `${ID.ROLE_PREFIX}${b.key}`;
      return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(b.label)
        .setEmoji(roleEmojiComponent(event.guild_id, b.icons) || b.emoji)
        .setStyle(ButtonStyle.Primary);
    }),
  );

  const statusRow = new ActionRowBuilder().addComponents(
    ...EXTRA_STATUSES.map((s) =>
      new ButtonBuilder()
        .setCustomId(`${ID.STATUS_PREFIX}${s.key}`)
        .setLabel(s.label)
        .setEmoji(s.emoji)
        .setStyle(ButtonStyle.Secondary),
    ),
    new ButtonBuilder()
      .setCustomId(ID.LEAVE)
      .setLabel('Withdraw')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(SUG.OPEN)
      .setLabel('Suggest')
      .setEmoji('💡')
      .setStyle(ButtonStyle.Secondary),
  );

  const jobRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ID.JOB_SELECT)
      .setPlaceholder('Select your Job')
      .addOptions(
        JOBS.map((j) => {
          const option = { label: `${j.name} (${j.code})`, value: j.code };
          const custom = jobEmojiComponent(event.guild_id, j.code);
          if (custom) option.emoji = custom;
          return option;
        }),
      ),
  );

  return [roleRow, statusRow, jobRow];
}

// Ephemeral DPS subtype picker shown when a member clicks the DPS button.
// Each button carries the eventId so it works from an untracked ephemeral
// message: evt:dpsset:<eventId>:<roleKey>.
function buildDpsPicker(event) {
  const row = new ActionRowBuilder().addComponents(
    ...DPS_ROLES.map((role) =>
      new ButtonBuilder()
        .setCustomId(`${ID.DPS_SET_PREFIX}${event.id}:${role.key}`)
        .setLabel(role.label)
        .setEmoji(roleEmojiComponent(event.guild_id, role.icons) || role.emoji)
        .setStyle(ButtonStyle.Primary),
    ),
  );
  return [row];
}

// Private (ephemeral) control panel buttons for the creator / leader.
// The eventId is embedded in the customId so the buttons work from an
// ephemeral message that isn't tracked in the database.
function buildManageComponents(event) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ID.EDIT_PREFIX}${event.id}`)
        .setLabel('Edit Event')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${ID.EDIT_LINKS_PREFIX}${event.id}`)
        .setLabel('Edit Links/Image')
        .setEmoji('🖼️')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// Modal shown to the creator/leader to edit the headline event fields.
function buildEditModal(event) {
  const { date, time } = formatLocalParts(event.start_ts, event.timezone);

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setValue(event.title ?? '');

  const dateInput = new TextInputBuilder()
    .setCustomId('date')
    .setLabel(`Date (YYYY-MM-DD, ${event.timezone})`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(date);

  const timeInput = new TextInputBuilder()
    .setCustomId('time')
    .setLabel('Time (e.g. 13:00, 5:30pm, 5pm)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(time);

  const capInput = new TextInputBuilder()
    .setCustomId('cap')
    .setLabel('Attendee cap (blank = unlimited)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(event.cap != null ? String(event.cap) : '');

  const leaderInput = new TextInputBuilder()
    .setCustomId('leader')
    .setLabel('Leader (blank to clear)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(event.leader ?? '');

  return new ModalBuilder()
    .setCustomId(`${ID.EDIT_MODAL_PREFIX}${event.id}`)
    .setTitle(`Edit Event #${event.id}`)
    .addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(dateInput),
      new ActionRowBuilder().addComponents(timeInput),
      new ActionRowBuilder().addComponents(capInput),
      new ActionRowBuilder().addComponents(leaderInput),
    );
}

// Modal for description, event link, and image/banner URL.
function buildEditLinksModal(event) {
  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description / notes (blank to clear)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setValue(event.description ?? '');

  const urlInput = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('Event link, e.g. a wiki page (blank clears)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(event.url ?? '');

  const imageInput = new TextInputBuilder()
    .setCustomId('image')
    .setLabel('Image/banner URL (blank to clear)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(event.image_url ?? '');

  return new ModalBuilder()
    .setCustomId(`${ID.EDIT_LINKS_MODAL_PREFIX}${event.id}`)
    .setTitle(`Edit Links/Image #${event.id}`)
    .addComponents(
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(urlInput),
      new ActionRowBuilder().addComponents(imageInput),
    );
}

function buildEventMessage(event, signups) {
  return {
    embeds: [buildEmbed(event, signups)],
    components: buildComponents(event),
  };
}

// ---- Suggestion box --------------------------------------------------------

// Modal a member fills in to submit an improvement idea.
function buildSuggestModal() {
  const input = new TextInputBuilder()
    .setCustomId(SUG.INPUT)
    .setLabel('Your suggestion')
    .setPlaceholder('What would make events / the bot better?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  return new ModalBuilder()
    .setCustomId(SUG.MODAL)
    .setTitle('💡 Suggest an improvement')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

// The persistent "Suggest an improvement" button row.
function buildSuggestButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SUG.OPEN)
      .setLabel('Suggest an improvement')
      .setEmoji('💡')
      .setStyle(ButtonStyle.Primary),
  );
}

// A standing message members can use any time to drop suggestions.
function buildSuggestBoardMessage() {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('💡 Suggestion Box')
    .setDescription(
      [
        'Have an idea to improve events or the bot? Tap the button below.',
        'Your suggestion is sent privately to the organizers — no public spam.',
      ].join('\n'),
    );
  return { embeds: [embed], components: [buildSuggestButtonRow()] };
}

// Ephemeral list of suggestions for organizers.
function buildSuggestionList(rows, { status } = {}) {
  const label = status ? `${status} ` : '';
  if (!rows.length) {
    return `📭 No ${label}suggestions yet.`;
  }
  const lines = rows.slice(0, 25).map((s) => {
    const mark = s.status === 'done' ? '✅' : s.status === 'dismissed' ? '🚫' : '•';
    const when = `<t:${s.created_at}:d>`;
    const text = s.text.length > 180 ? `${s.text.slice(0, 177)}…` : s.text;
    return `${mark} \`#${s.id}\` ${when} — **${s.username}**: ${text}`;
  });
  const header = `**💡 Suggestions${status ? ` (${status})` : ''}** — ${rows.length} total`;
  const more = rows.length > 25 ? `\n…and ${rows.length - 25} more.` : '';
  return [header, ...lines].join('\n') + more;
}

// ---- Event creation board (GUI for creating events) -------------------------

// A standing message with a "Create Event" button — anyone with Manage Events
// can click it and fill in a form to post a new event, no slash command needed.
function buildCreateBoardMessage() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📅 Create an Event')
    .setDescription(
      [
        'Click the button below to create a new event with signup buttons.',
        'Fill in the form and the event will be posted in this channel.',
        '',
        '**Tip:** Set your timezone first with `/event timezone` so times are read correctly.',
      ].join('\n'),
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ID.CREATE_OPEN)
      .setLabel('Create Event')
      .setEmoji('📅')
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

// Modal shown when a user clicks "Create Event" on the board.
function buildCreateModal() {
  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Event title')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('e.g. Sky - Kirin Run');

  const dateInput = new TextInputBuilder()
    .setCustomId('date')
    .setLabel('Date (YYYY-MM-DD)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('e.g. 2026-07-05');

  const timeInput = new TextInputBuilder()
    .setCustomId('time')
    .setLabel('Start time (e.g. 6pm, 6:30pm, 18:00)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('e.g. 6pm');

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description / notes (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder('Any extra info about the event');

  const leaderInput = new TextInputBuilder()
    .setCustomId('leader')
    .setLabel('Leader name (optional, defaults to you)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('Leave blank to use your display name');

  return new ModalBuilder()
    .setCustomId(ID.CREATE_MODAL)
    .setTitle('📅 Create Event')
    .addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(dateInput),
      new ActionRowBuilder().addComponents(timeInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(leaderInput),
    );
}

module.exports = {
  ID,
  SUG,
  isExpired,
  buildEventMessage,
  buildManageComponents,
  buildDpsPicker,
  buildEditModal,
  buildEditLinksModal,
  buildCreateBoardMessage,
  buildCreateModal,
  buildSuggestModal,
  buildSuggestButtonRow,
  buildSuggestBoardMessage,
  buildSuggestionList,
};
