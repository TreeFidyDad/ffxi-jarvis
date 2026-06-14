const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');

const config = require('./config');
const db = require('./db');
const eventCommand = require('./commands/event');
const { ID, buildEventMessage } = require('./lib/embed');
const { ROLE_BY_KEY, STATUS } = require('./data/roles');
const { JOB_BY_CODE } = require('./data/jobs');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'event') {
        await eventCommand.execute(interaction);
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

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  if (config.reminderMinutes > 0) {
    setInterval(checkReminders, 60 * 1000);
    console.log(`Reminders enabled: ${config.reminderMinutes} minute(s) before start.`);
  }
});

client.login(config.token);
