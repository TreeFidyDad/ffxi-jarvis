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
};

const ROLE_EMOJI = Object.fromEntries([...ROLE_BY_KEY.values()].map((r) => [r.key, r.emoji]));
const ROLE_ICONS_BY_KEY = Object.fromEntries([...ROLE_BY_KEY.values()].map((r) => [r.key, r.icons]));

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

  // Stable slot number per user, in signup order across all statuses.
  const slot = new Map();
  signups.forEach((s, i) => slot.set(s.user_id, i + 1));

  const embed = new EmbedBuilder()
    .setTitle(`${closed ? '🔒 ' : '📅 '}${event.title}`)
    .setColor(closed ? 0x95a5a6 : 0x5865f2);
  if (event.url) embed.setURL(event.url);
  if (event.image_url) embed.setImage(event.image_url);

  // ---- Header / description block ----
  const cap = event.cap || 0;
  const roleCounts = ROLE_GROUPS.map((g) => {
    const n = attending.filter((s) => g.keys.includes(s.role)).length;
    const icon = roleEmojiMention(event.guild_id, g.icons) || g.emoji;
    return `${icon} ${g.label} **${n}**`;
  }).join('   ');
  const head = (cap ? Math.min(attending.length, cap) : attending.length) + (cap ? `/${cap}` : '');
  const tentSuffix = tentative.length ? ` (+${tentative.length})` : '';

  const lines = [];
  if (event.url) lines.push(event.url);
  if (event.description) lines.push(event.description);
  lines.push('');

  // Compact meta chip row: leader · date · time · countdown.
  const metaBits = [];
  if (event.leader || event.creator_name) metaBits.push(`🏳️ **${event.leader || event.creator_name}**`);
  metaBits.push(`📅 ${discordTime(event.start_ts, 'D')}`);
  metaBits.push(`🕒 ${discordTime(event.start_ts, 't')}`);
  metaBits.push(`⏳ ${discordRelative(event.start_ts)}`);
  lines.push(metaBits.join('  •  '));

  lines.push(`👥 **${head}** signed up${tentSuffix}`);
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
      name: `${emoji} ${jobName(job.code)} (${members.length})`,
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

  // ---- Footer link row (Web View | Gcal) ----
  const gcal = googleCalendarLink({
    title: event.title,
    startTs: event.start_ts,
    durationMin: event.duration_min || 120,
    details: event.url || event.description || undefined,
  });
  const linkBits = [];
  if (event.message_id) {
    linkBits.push(
      `[Web View](https://discord.com/channels/${event.guild_id}/${event.channel_id}/${event.message_id})`,
    );
  }
  linkBits.push(`[Add to Google Calendar](${gcal})`);
  embed.addFields({ name: '\u200b', value: linkBits.join('  |  '), inline: false });

  const footer = closed
    ? `Event #${event.id} • ${attending.length} attending • signups closed`
    : `Event #${event.id} • ${attending.length} attending • sign up with the buttons below`;
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

module.exports = { ID, buildEventMessage, buildManageComponents, buildDpsPicker, buildEditModal, buildEditLinksModal };
