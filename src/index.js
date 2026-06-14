const { Client, GatewayIntentBits, Events, MessageFlags, PermissionFlagsBits } = require('discord.js');

const config = require('./config');
const db = require('./db');
const eventCommand = require('./commands/event');
const { ID, buildEventMessage, buildEditModal } = require('./lib/embed');
const { ROLE_BY_KEY, STATUS } = require('./data/roles');
const { JOB_BY_CODE } = require('./data/jobs');
const { ensureGuildEmojis } = require('./lib/guildEmojis');
const { parseEventTime } = require('./lib/time');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildExpressions] });

// Only the event creator, or a member with Manage Events / Manage Server, may edit.
function canManageEvent(interaction, event) {
  if (event && interaction.user.id === event.creator_id) return true;
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    false
  );
}

// Re-render the event message after a signup change.
async function refreshEventMessage(interaction, event) {
  const signups = db.getSignups(event.id);
  await interaction.message.edit(buildEventMessage(event, signups)).catch(() => null);
}

async function handleComponent(interaction) {
  const event = db.getEventByMessage(interaction.message.id);
  if (!event) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: '⚠️ This event is no longer tracked by the bot.',
    });
  }
  if (event.status === 'closed') {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: '🔒 Signups are closed for this event.' });
  }

  // Edit button -> open a modal (creator/leader only). Show it before any other
  // awaits so we stay inside Discord's 3s window for showModal.
  if (interaction.customId === ID.EDIT) {
    if (!canManageEvent(interaction, event)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '⛔ Only the event creator or a member with Manage Events can edit this event.',
      });
    }
    return interaction.showModal(buildEditModal(event));
  }

  // Make sure this guild's custom job emojis are loaded before we re-render.
  await ensureGuildEmojis(client, event.guild_id);

  const userId = interaction.user.id;
  const username = interaction.member?.displayName || interaction.user.username;
  const customId = interaction.customId;

  // Role buttons -> attending with a role.
  if (customId.startsWith(ID.ROLE_PREFIX)) {
    const roleKey = customId.slice(ID.ROLE_PREFIX.length);
    if (!ROLE_BY_KEY.has(roleKey)) return interaction.deferUpdate();
    db.upsertSignup(event.id, userId, username, { role: roleKey, status: STATUS.ATTENDING });
    await refreshEventMessage(interaction, event);
    return interaction.deferUpdate();
  }

  // Status buttons -> tentative / absence (keep role + job).
  if (customId.startsWith(ID.STATUS_PREFIX)) {
    const status = customId.slice(ID.STATUS_PREFIX.length);
    db.upsertSignup(event.id, userId, username, { status });
    await refreshEventMessage(interaction, event);
    return interaction.deferUpdate();
  }

  // Withdraw.
  if (customId === ID.LEAVE) {
    db.removeSignup(event.id, userId);
    await refreshEventMessage(interaction, event);
    return interaction.deferUpdate();
  }

  // Job select menu.
  if (customId === ID.JOB_SELECT) {
    const code = interaction.values?.[0];
    if (!JOB_BY_CODE.has(code)) return interaction.deferUpdate();
    const existing = db.getSignup(event.id, userId);
    // Choosing a job opts you in as attending if you weren't already signed up.
    const status = existing ? existing.status : STATUS.ATTENDING;
    db.upsertSignup(event.id, userId, username, { job: code, status });
    await refreshEventMessage(interaction, event);
    return interaction.deferUpdate();
  }

  return interaction.deferUpdate();
}

// Handle the Edit Event modal submission.
async function handleEditModal(interaction) {
  const eventId = Number(interaction.customId.slice(ID.EDIT_MODAL_PREFIX.length));
  const event = db.getEvent(eventId);
  if (!event) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: '⚠️ This event is no longer tracked by the bot.',
    });
  }
  if (!canManageEvent(interaction, event)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: '⛔ Only the event creator or a member with Manage Events can edit this event.',
    });
  }

  const title = interaction.fields.getTextInputValue('title').trim();
  const date = interaction.fields.getTextInputValue('date').trim();
  const time = interaction.fields.getTextInputValue('time').trim();
  const capRaw = interaction.fields.getTextInputValue('cap').trim();
  const leaderRaw = interaction.fields.getTextInputValue('leader').trim();

  if (!title) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: '⚠️ Title cannot be empty.' });
  }

  const parsed = parseEventTime(date, time, event.timezone);
  if (!parsed.ok) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⚠️ ${parsed.error}` });
  }

  let cap = null;
  if (capRaw !== '') {
    const n = Number.parseInt(capRaw, 10);
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '⚠️ Cap must be a whole number from 1–99, or left blank for unlimited.',
      });
    }
    cap = n;
  }

  db.updateEvent(eventId, {
    title,
    start_ts: parsed.ts,
    cap,
    leader: leaderRaw || null,
  });

  const updated = db.getEvent(eventId);
  await ensureGuildEmojis(client, updated.guild_id);

  const channel = await client.channels.fetch(updated.channel_id).catch(() => null);
  const message = updated.message_id
    ? await channel?.messages.fetch(updated.message_id).catch(() => null)
    : null;
  if (message) {
    await message.edit(buildEventMessage(updated, db.getSignups(eventId))).catch(() => null);
  }

  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: `✅ Updated event **#${eventId}**.`,
  });
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'event') {
        if (interaction.guildId) await ensureGuildEmojis(client, interaction.guildId);
        await eventCommand.execute(interaction);
      }
      return;
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(ID.EDIT_MODAL_PREFIX)) {
        await handleEditModal(interaction);
      }
      return;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await handleComponent(interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction
        .reply({ flags: MessageFlags.Ephemeral, content: '⚠️ Something went wrong.' })
        .catch(() => null);
    }
  }
});

// ---- Reminders -------------------------------------------------------------
async function checkReminders() {
  if (config.reminderMinutes <= 0) return;
  const due = db.getDueReminders(config.reminderMinutes * 60);
  for (const event of due) {
    try {
      const channel = await client.channels.fetch(event.channel_id).catch(() => null);
      if (!channel) {
        db.markReminderSent(event.id);
        continue;
      }
      const attending = db.getSignups(event.id).filter((s) => s.status === STATUS.ATTENDING);
      const mentions = attending.map((s) => `<@${s.user_id}>`).join(' ');
      await channel.send({
        content:
          `🔔 **${event.title}** starts <t:${event.start_ts}:R>!` +
          (mentions ? `\n${mentions}` : '\nNo one has signed up yet.'),
      });
      db.markReminderSent(event.id);
    } catch (error) {
      console.error(`Reminder failed for event #${event.id}:`, error);
      db.markReminderSent(event.id);
    }
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  for (const guild of c.guilds.cache.values()) {
    try {
      await ensureGuildEmojis(client, guild.id, true);
    } catch (err) {
      console.error(`Failed to index emojis for guild ${guild.id}:`, err);
    }
  }
  if (config.reminderMinutes > 0) {
    setInterval(checkReminders, 60 * 1000);
    console.log(`Reminders enabled: ${config.reminderMinutes} minute(s) before start.`);
  }
});

// Refresh the cache whenever a guild's emojis change.
client.on(Events.GuildEmojisUpdate, (emojis, guild) => {
  const id = guild?.id || emojis?.first()?.guild?.id;
  if (id) ensureGuildEmojis(client, id, true).catch(() => null);
});

client.login(config.token);
