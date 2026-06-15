const { Client, GatewayIntentBits, Events, MessageFlags, PermissionFlagsBits } = require('discord.js');

const config = require('./config');
const db = require('./db');
const eventCommand = require('./commands/event');
const popCommand = require('./commands/pop');
const { ID, SUG, buildEventMessage, buildManageComponents, buildDpsPicker, buildEditModal, buildEditLinksModal, buildSuggestModal } = require('./lib/embed');
const { POP, buildPopMessage, buildPopPicker } = require('./lib/poplist');
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

  // Make sure this guild's custom job emojis are loaded before we re-render.
  await ensureGuildEmojis(client, event.guild_id);

  const userId = interaction.user.id;
  const username = interaction.member?.displayName || interaction.user.username;
  const customId = interaction.customId;

  // DPS button -> open the ephemeral subtype picker (Melee / Phys / Magic).
  if (customId === ID.DPS_OPEN) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: '🗡️ Which kind of DPS are you?',
      components: buildDpsPicker(event),
    });
  }

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

// DPS subtype picker buttons. Clicked from the ephemeral picker (not tracked by
// message id), so the eventId is embedded in the customId:
// evt:dpsset:<eventId>:<roleKey>.
async function handleDpsSet(interaction) {
  const rest = interaction.customId.slice(ID.DPS_SET_PREFIX.length);
  const sep = rest.indexOf(':');
  const eventId = Number(rest.slice(0, sep));
  const roleKey = rest.slice(sep + 1);
  const event = db.getEvent(eventId);
  if (!event) {
    return interaction.update({ content: '⚠️ This event is no longer tracked by the bot.', components: [] });
  }
  if (event.status === 'closed') {
    return interaction.update({ content: '🔒 Signups are closed for this event.', components: [] });
  }
  if (!ROLE_BY_KEY.has(roleKey)) {
    return interaction.update({ content: '⚠️ Unknown DPS type.', components: [] });
  }

  const userId = interaction.user.id;
  const username = interaction.member?.displayName || interaction.user.username;
  db.upsertSignup(event.id, userId, username, { role: roleKey, status: STATUS.ATTENDING });
  await rerenderEvent(eventId);

  const label = ROLE_BY_KEY.get(roleKey).label;
  return interaction.update({ content: `✅ Signed up as **${label}**.`, components: [] });
}

// Edit Event / Edit Links buttons from the private control panel. The eventId
// is in the customId, so these work from an ephemeral message (not tracked in
// the DB). Permission is re-checked on click.
async function handleManageButton(interaction) {
  const isLinks = interaction.customId.startsWith(ID.EDIT_LINKS_PREFIX);
  const prefix = isLinks ? ID.EDIT_LINKS_PREFIX : ID.EDIT_PREFIX;
  const eventId = Number(interaction.customId.slice(prefix.length));
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
  return interaction.showModal(isLinks ? buildEditLinksModal(event) : buildEditModal(event));
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

  await rerenderEvent(eventId);

  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: `✅ Updated event **#${eventId}**.`,
  });
}

// Re-fetch an event and re-render its posted message in place.
async function rerenderEvent(eventId) {
  const updated = db.getEvent(eventId);
  if (!updated) return;
  await ensureGuildEmojis(client, updated.guild_id);
  const channel = await client.channels.fetch(updated.channel_id).catch(() => null);
  const message = updated.message_id
    ? await channel?.messages.fetch(updated.message_id).catch(() => null)
    : null;
  if (message) {
    await message.edit(buildEventMessage(updated, db.getSignups(eventId))).catch(() => null);
  }
}

// Handle the Edit Links/Image modal submission.
async function handleEditLinksModal(interaction) {
  const eventId = Number(interaction.customId.slice(ID.EDIT_LINKS_MODAL_PREFIX.length));
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

  const description = interaction.fields.getTextInputValue('description').trim();
  const url = interaction.fields.getTextInputValue('url').trim();
  const image = interaction.fields.getTextInputValue('image').trim();

  if (url && !/^https?:\/\//i.test(url)) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: '⚠️ Event link must start with http:// or https://' });
  }
  if (image && !/^https?:\/\//i.test(image)) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: '⚠️ Image URL must start with http:// or https://' });
  }

  db.updateEvent(eventId, {
    description: description || null,
    url: url || null,
    image_url: image || null,
  });

  await rerenderEvent(eventId);

  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: `✅ Updated links/image for event **#${eventId}**.`,
  });
}

// ---- Pop-item checklist ----------------------------------------------------
// "I have these" button -> open an ephemeral multi-select pre-filled with the
// member's current ticks for this list.
async function handlePopOpen(interaction) {
  const listId = Number(interaction.customId.slice(POP.OPEN_PREFIX.length));
  const list = db.getPopList(listId);
  if (!list) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: '⚠️ This pop list is no longer tracked by the bot.' });
  }
  const mine = db.getUserPopMarks(listId, interaction.user.id);
  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: `✅ Select **every** pop item you currently have for **${list.title}**, then close the menu. Unticking removes it.`,
    components: buildPopPicker(list, mine),
  });
}

// Multi-select submit -> replace the member's ticks and refresh the public board.
async function handlePopSelect(interaction) {
  const listId = Number(interaction.customId.slice(POP.SELECT_PREFIX.length));
  const list = db.getPopList(listId);
  if (!list) {
    return interaction.update({ content: '⚠️ This pop list is no longer tracked by the bot.', components: [] });
  }
  const username = interaction.member?.displayName || interaction.user.username;
  db.setUserPopMarks(listId, interaction.user.id, username, interaction.values || []);

  // Refresh the posted board in place.
  const channel = await client.channels.fetch(list.channel_id).catch(() => null);
  const message = list.message_id
    ? await channel?.messages.fetch(list.message_id).catch(() => null)
    : null;
  if (message) {
    await message.edit(buildPopMessage(list, db.getPopMarks(listId))).catch(() => null);
  }

  const n = (interaction.values || []).length;
  return interaction.update({
    content: n
      ? `✅ Saved — you're marked as having **${n}** item${n === 1 ? '' : 's'}. The checklist is updated.`
      : '✅ Saved — you have **no** items marked now. The checklist is updated.',
    components: [],
  });
}

// Save a submitted suggestion and privately confirm to the member.
async function handleSuggestModal(interaction) {
  const text = interaction.fields.getTextInputValue(SUG.INPUT).trim();
  if (!text) {
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: '⚠️ Suggestion cannot be empty.' });
  }
  const username = interaction.member?.displayName || interaction.user.username;
  const saved = db.addSuggestion({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    username,
    text,
  });
  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: `✅ Thanks! Your suggestion was recorded as **#${saved.id}**. Organizers can review it with \`/event suggest list\`.`,
  });
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'event') {
        if (interaction.guildId) await ensureGuildEmojis(client, interaction.guildId);
        await eventCommand.execute(interaction);
      } else if (interaction.commandName === 'pop') {
        await popCommand.execute(interaction);
      }
      return;
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === SUG.MODAL) {
        await handleSuggestModal(interaction);
      } else if (interaction.customId.startsWith(ID.EDIT_MODAL_PREFIX)) {
        await handleEditModal(interaction);
      } else if (interaction.customId.startsWith(ID.EDIT_LINKS_MODAL_PREFIX)) {
        await handleEditLinksModal(interaction);
      }
      return;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      // Suggestion box button -> open the suggestion modal.
      if (interaction.customId === SUG.OPEN) {
        await interaction.showModal(buildSuggestModal());
        return;
      }
      // Pop checklist: open the member's "I have these" picker.
      if (interaction.customId.startsWith(POP.OPEN_PREFIX)) {
        await handlePopOpen(interaction);
        return;
      }
      // Pop checklist: member submitted their multi-select of held items.
      if (interaction.customId.startsWith(POP.SELECT_PREFIX)) {
        await handlePopSelect(interaction);
        return;
      }
      // Private control-panel edit buttons carry the eventId in their customId
      // and may be clicked from an ephemeral message, so route them first.
      if (
        interaction.customId.startsWith(ID.EDIT_LINKS_PREFIX) ||
        interaction.customId.startsWith(ID.EDIT_PREFIX)
      ) {
        await handleManageButton(interaction);
        return;
      }
      // DPS subtype picker buttons carry the eventId and are clicked from an
      // ephemeral message, so route them before the tracked-message handler.
      if (interaction.customId.startsWith(ID.DPS_SET_PREFIX)) {
        await handleDpsSet(interaction);
        return;
      }
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

// ---- Expiry re-render ------------------------------------------------------
// Re-render events that have just passed their end time so they flip to the
// red "ended" look on their own, without anyone needing to interact.
async function checkExpired() {
  const expired = db.getJustExpired();
  for (const event of expired) {
    try {
      await rerenderEvent(event.id);
    } catch (error) {
      console.error(`Expiry re-render failed for event #${event.id}:`, error);
    }
    db.markExpiredRendered(event.id);
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
  // Flip events to the red "ended" look shortly after they finish.
  checkExpired().catch((err) => console.error('Expiry sweep failed:', err));
  setInterval(() => checkExpired().catch((err) => console.error('Expiry sweep failed:', err)), 60 * 1000);
  console.log('Expiry re-render sweep enabled (every 60s).');
});

// Refresh the cache whenever a guild's emojis change.
client.on(Events.GuildEmojisUpdate, (emojis, guild) => {
  const id = guild?.id || emojis?.first()?.guild?.id;
  if (id) ensureGuildEmojis(client, id, true).catch(() => null);
});

client.login(config.token);
