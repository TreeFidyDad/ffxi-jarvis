const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const { ROLES, EXTRA_STATUSES, STATUS } = require('../data/roles');
const { JOBS, jobLabel } = require('../data/jobs');
const { discordTime, discordRelative } = require('./time');

// ---- Component custom IDs --------------------------------------------------
const ID = {
  ROLE_PREFIX: 'evt:role:', // evt:role:<roleKey>
  STATUS_PREFIX: 'evt:status:', // evt:status:<statusKey>
  LEAVE: 'evt:leave',
  JOB_SELECT: 'evt:job',
};

function formatSignup(s) {
  const job = s.job ? `\`${jobLabel(s.job)}\`` : '`???`';
  return `${job} ${s.username}`;
}

function buildEmbed(event, signups) {
  const attending = signups.filter((s) => s.status === STATUS.ATTENDING);
  const tentative = signups.filter((s) => s.status === STATUS.TENTATIVE);
  const absence = signups.filter((s) => s.status === STATUS.ABSENCE);

  const closed = event.status === 'closed';

  const embed = new EmbedBuilder()
    .setTitle(`${closed ? '🔒 ' : '📅 '}${event.title}`)
    .setColor(closed ? 0x95a5a6 : 0x5865f2);

  const descParts = [];
  if (event.description) descParts.push(event.description);
  descParts.push('');
  descParts.push(`🕒 ${discordTime(event.start_ts)} (${discordRelative(event.start_ts)})`);
  if (closed) descParts.push('\n**Signups are closed.**');
  embed.setDescription(descParts.join('\n'));

  // One field per role, side by side.
  for (const role of ROLES) {
    const members = attending.filter((s) => s.role === role.key);
    const value = members.length ? members.map(formatSignup).join('\n') : '\u200b';
    embed.addFields({
      name: `${role.emoji} ${role.label} (${members.length})`,
      value,
      inline: true,
    });
  }

  // Attending but no role picked yet.
  const noRole = attending.filter((s) => !s.role);
  if (noRole.length) {
    embed.addFields({
      name: `📝 Attending — pick a role (${noRole.length})`,
      value: noRole.map(formatSignup).join('\n'),
      inline: false,
    });
  }

  if (tentative.length) {
    embed.addFields({
      name: `❔ Tentative (${tentative.length})`,
      value: tentative.map(formatSignup).join('\n'),
      inline: false,
    });
  }
  if (absence.length) {
    embed.addFields({
      name: `❌ Absence (${absence.length})`,
      value: absence.map((s) => s.username).join('\n'),
      inline: false,
    });
  }

  const total = attending.length;
  const footer = event.status === 'closed'
    ? `Event #${event.id} • ${total} attending • signups closed`
    : `Event #${event.id} • ${total} attending • sign up with the buttons below`;
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
      .addOptions(JOBS.map((j) => ({ label: `${j.name} (${j.code})`, value: j.code }))),
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
