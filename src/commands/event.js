const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const config = require('../config');
const db = require('../db');
const { parseEventTime } = require('../lib/time');
const { buildEventMessage } = require('../lib/embed');

const data = new SlashCommandBuilder()
  .setName('event')
  .setDescription('Create and manage FFXI event signups')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Post a new event with signup buttons')
      .addStringOption((o) => o.setName('title').setDescription('Event title').setRequired(true))
      .addStringOption((o) =>
        o.setName('date').setDescription('Date as YYYY-MM-DD').setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('time').setDescription('Start time as HH:MM (24-hour)').setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('description').setDescription('Optional details / notes').setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('timezone')
          .setDescription('IANA timezone, e.g. America/New_York (defaults to bot setting)')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('close')
      .setDescription('Lock signups for an event (keeps the roster)')
      .addIntegerOption((o) => o.setName('id').setDescription('Event ID').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Delete an event and its roster')
      .addIntegerOption((o) => o.setName('id').setDescription('Event ID').setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName('help').setDescription('How to use the bot'));

function canManage(interaction, event) {
  if (event && interaction.user.id === event.creator_id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'help') {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: [
        '**FFXI Raid Helper**',
        '• `/event create title:<...> date:YYYY-MM-DD time:HH:MM` — post an event.',
        '• Members sign up with the buttons: pick a **role** (Tank / Melee / Ranged / Support) and a **Job** from the dropdown.',
        '• `Tentative` / `Absence` mark non-attendance. `Withdraw` removes you.',
        '• `/event close id:<#>` locks signups. `/event delete id:<#>` removes it.',
        `• Times are shown in each member's local timezone automatically. Default timezone: \`${config.defaultTimezone}\`.`,
      ].join('\n'),
    });
  }

  if (sub === 'create') {
    const title = interaction.options.getString('title');
    const date = interaction.options.getString('date');
    const time = interaction.options.getString('time');
    const description = interaction.options.getString('description');
    const timezone = interaction.options.getString('timezone') || config.defaultTimezone;

    const parsed = parseEventTime(date, time, timezone);
    if (!parsed.ok) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⚠️ ${parsed.error}` });
    }

    const event = db.createEvent({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      creatorId: interaction.user.id,
      title,
      description,
      startTs: parsed.ts,
      timezone,
    });

    const payload = buildEventMessage(event, []);
    const message = await interaction.channel.send(payload);
    db.setEventMessage(event.id, message.id);

    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `✅ Created event **#${event.id}** — ${title}.`,
    });
  }

  if (sub === 'close' || sub === 'delete') {
    const id = interaction.options.getInteger('id');
    const event = db.getEvent(id);
    if (!event) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⚠️ No event with ID #${id}.` });
    }
    if (!canManage(interaction, event)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '⛔ Only the event creator or a member with Manage Events can do that.',
      });
    }

    const channel = await interaction.client.channels.fetch(event.channel_id).catch(() => null);
    const message = event.message_id
      ? await channel?.messages.fetch(event.message_id).catch(() => null)
      : null;

    if (sub === 'close') {
      db.setEventStatus(id, 'closed');
      const updated = db.getEvent(id);
      if (message) await message.edit(buildEventMessage(updated, db.getSignups(id))).catch(() => null);
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `🔒 Closed event #${id}.` });
    }

    // delete
    if (message) await message.delete().catch(() => null);
    db.deleteEvent(id);
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: `🗑️ Deleted event #${id}.` });
  }
}

module.exports = { data, execute };
