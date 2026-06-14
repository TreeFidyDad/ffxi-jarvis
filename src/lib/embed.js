const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const { ROLES, EXTRA_STATUSES, STATUS } = require('../data/roles');
const { JOBS, jobLabel, jobEmoji, jobName } = require('../data/jobs');
const { discordTime, discordRelative, googleCalendarLink } = require('./time');
const { jobEmojiMention, jobEmojiComponent } = require('./guildEmojis');

// ---- Component custom IDs --------------------------------------------------
const ID = {
  ROLE_PREFIX: 'evt:role:', // evt:role:<roleKey>
  STATUS_PREFIX: 'evt:status:', // evt:status:<statusKey>
  LEAVE: 'evt:leave',
  JOB_SELECT: 'evt:job',
};

const ROLE_EMOJI = Object.fromEntries(ROLES.map((r) => [r.key, r.emoji]));

// "`3` ⚔️ Name" — slot number, role emoji, display name.
function formatMember(s, slot) {
  const roleIcon = s.role ? `${ROLE_EMOJI[s.role]} ` : '';
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
  const roleCounts = ROLES.map(
    (r) => `${r.emoji} ${r.label} **${attending.filter((s) => s.role === r.key).length}**`,
  ).join('   ');
  const head = (cap ? Math.min(attending.length, cap) : attending.length) + (cap ? `/${cap}` : '');
  const tentSuffix = tentative.length ? ` (+${tentative.length})` : '';

  const lines = [];
  if (event.url) lines.push(event.url);
  if (event.description) lines.push(event.description);
  lines.push('');
  if (event.leader || event.creator_name) {
    lines.push(`🏳️ **Leader:** ${event.leader || event.creator_name}`);
  }
  lines.push(`🕒 ${discordTime(event.start_ts)} (${discordRelative(event.start_ts)})`);
  lines.push(`👥 **${head}** signed up${tentSuffix}`);
  lines.push(roleCounts);
  const gcal = googleCalendarLink({
    title: event.title,
    startTs: event.start_ts,
    durationMin: event.duration_min || 120,
    details: event.url || event.description || undefined,
  });
  lines.push(`📅 [Add to Google Calendar](${gcal})`);
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
      value: members.map((s) => formatMember(s, slot.get(s.user_id))).join('\n'),
      inline: true,
    });
  }

  // Attending but no Job chosen yet.
  const noJob = main.filter((s) => !s.job);
  if (noJob.length) {
    embed.addFields({
      name: `❔ No Job selected (${noJob.length})`,
      value: noJob.map((s) => formatMember(s, slot.get(s.user_id))).join('\n'),
      inline: true,
    });
  }

  if (standby.length) {
    embed.addFields({
      name: `🪑 Standby (${standby.length})`,
      value: standby
        .map((s) => `${formatMember(s, slot.get(s.user_id))} \`${jobLabel(s.job)}\``)
        .join('\n'),
      inline: false,
    });
  }

  if (tentative.length) {
    embed.addFields({
      name: `❔ Tentative (${tentative.length})`,
      value: tentative
        .map((s) => `${formatMember(s, slot.get(s.user_id))} \`${jobLabel(s.job)}\``)
        .join('\n'),
      inline: false,
    });
  }
  if (absence.length) {
    embed.addFields({
      name: `❌ Absence (${absence.length})`,
      value: absence.map((s) => `\`${String(slot.get(s.user_id)).padStart(2, ' ')}\` ${s.username}`).join('\n'),
      inline: false,
    });
  }

  const footer = closed
    ? `Event #${event.id} • ${attending.length} attending • signups closed`
    : `Event #${event.id} • ${attending.length} attending • sign up with the buttons below`;
  embed.setFooter({ text: footer });

  return embed;
}

function buildComponents(event) {
  if (event.status === 'closed') return [];

  const roleRow = new ActionRowBuilder().addComponents(
    ...ROLES.map((role) =>
      new ButtonBuilder()
        .setCustomId(`${ID.ROLE_PREFIX}${role.key}`)
        .setLabel(role.label)
        .setEmoji(role.emoji)
        .setStyle(ButtonStyle.Primary),
    ),
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

function buildEventMessage(event, signups) {
  return {
    embeds: [buildEmbed(event, signups)],
    components: buildComponents(event),
  };
}

module.exports = { ID, buildEventMessage };
