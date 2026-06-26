const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { DateTime } = require('luxon');
const config = require('../config');
const db = require('../db');
const { parseEventTime, isValidTimezone } = require('../lib/time');
const { buildEventMessage, buildManageComponents, buildSuggestModal, buildSuggestBoardMessage, buildSuggestionList } = require('../lib/embed');
const { buildCalendarMessage } = require('../lib/calendar');

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
        o.setName('time').setDescription('Start time, e.g. 13:00, 5:30pm, or 5pm').setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('description').setDescription('Optional details / notes').setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('timezone')
          .setDescription('IANA timezone, e.g. America/New_York (defaults to bot setting)')
          .setRequired(false),
      )
      .addIntegerOption((o) =>
        o
          .setName('cap')
          .setDescription('Max attendees; extras go to Standby')
          .setMinValue(1)
          .setMaxValue(99)
          .setRequired(false),
      )
      .addIntegerOption((o) =>
        o
          .setName('duration')
          .setDescription('Length in minutes (default 120, used for the calendar link)')
          .setMinValue(15)
          .setMaxValue(1440)
          .setRequired(false),
      )
      .addStringOption((o) =>
        o.setName('leader').setDescription('Event leader/organizer name (defaults to you)').setRequired(false),
      )
      .addStringOption((o) =>
        o.setName('url').setDescription('Link shown on the title (e.g. a wiki page)').setRequired(false),
      )
      .addStringOption((o) =>
        o.setName('image').setDescription('Image/banner URL shown at the bottom').setRequired(false),
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
      .setName('manage')
      .setDescription('Get private Edit buttons for an event (only you can see them)')
      .addIntegerOption((o) => o.setName('id').setDescription('Event ID').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Delete an event and its roster')
      .addIntegerOption((o) => o.setName('id').setDescription('Event ID').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('timezone')
      .setDescription('Set your personal timezone, used when you create events')
      .addStringOption((o) =>
        o
          .setName('tz')
          .setDescription('IANA name, e.g. America/Los_Angeles, America/New_York, Europe/London')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('calendar')
      .setDescription('Show a monthly calendar of all scheduled events')
      .addIntegerOption((o) =>
        o
          .setName('month')
          .setDescription('Month number 1-12 (defaults to current or next month)')
          .setMinValue(1)
          .setMaxValue(12)
          .setRequired(false),
      )
      .addIntegerOption((o) =>
        o
          .setName('year')
          .setDescription('Year (defaults to current year)')
          .setMinValue(2024)
          .setMaxValue(2030)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) => sub.setName('help').setDescription('How to use the bot'))
  .addSubcommandGroup((group) =>
    group
      .setName('suggest')
      .setDescription('Submit and manage improvement suggestions')
      .addSubcommand((sub) =>
        sub.setName('add').setDescription('Submit an improvement idea (opens a form)'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('board')
          .setDescription('Post a standing Suggestion Box button here (organizers)'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('Privately list submitted suggestions (organizers)')
          .addStringOption((o) =>
            o
              .setName('status')
              .setDescription('Filter by status')
              .setRequired(false)
              .addChoices(
                { name: 'open', value: 'open' },
                { name: 'done', value: 'done' },
                { name: 'dismissed', value: 'dismissed' },
              ),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('resolve')
          .setDescription('Mark a suggestion done or dismissed (organizers)')
          .addIntegerOption((o) =>
            o.setName('id').setDescription('Suggestion ID').setRequired(true),
          )
          .addStringOption((o) =>
            o
              .setName('status')
              .setDescription('New status (default: done)')
              .setRequired(false)
              .addChoices(
                { name: 'done', value: 'done' },
                { name: 'dismissed', value: 'dismissed' },
                { name: 'open', value: 'open' },
              ),
          ),
      ),
  );

function canManage(interaction, event) {
  if (event && interaction.user.id === event.creator_id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

// Organizer check that isn't tied to a specific event (for the suggestion box).
function isOrganizer(interaction) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    false
  );
}

async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  if (group === 'suggest') {
    return executeSuggest(interaction);
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'help') {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: [
        '**FFXI Jarvis** — event signups',
        '• `/event create title:<...> date:YYYY-MM-DD time:HH:MM` — post an event.',
        '   Optional: `description` `timezone` `cap` (max attendees → Standby) `duration` (mins) `leader` `url` `image`.',
        '• Members sign up with the buttons: pick a **role** — Tank, **DPS** (then choose Melee / Physical Ranged / Magical Ranged), or Healer/Support — and a **Job** from the dropdown.',
        '• The roster groups attendees by **Job**, numbers them in signup order, and shows a role summary + headcount.',
        '• `Tentative` / `Absence` mark non-attendance. `Withdraw` removes you.',
        '• `/event calendar` — view all events for a month in a calendar view. Click any event to jump to its signup sheet.',
        '• `/event close id:<#>` locks signups. `/event delete id:<#>` removes it.',
        '• `/event manage id:<#>` gives you private **Edit Event** / **Edit Links/Image** buttons (only you can see them).',
        '• `/event timezone tz:<IANA>` saves **your** timezone, so the times you type when creating are read in your zone.',
        '• `/event suggest add` opens a form to send the organizers an improvement idea. Organizers: `/event suggest board` posts a standing button, `/event suggest list` reviews them, `/event suggest resolve id:<#>` closes one.',
        '• Each event includes an **Add to Google Calendar** link.',
        `• Times are shown in each member's local timezone automatically. Server default: \`${config.defaultTimezone}\`.`,
      ].join('\n'),
    });
  }

  if (sub === 'timezone') {
    const tz = interaction.options.getString('tz').trim();
    if (!isValidTimezone(tz)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content:
          `⚠️ \`${tz}\` isn't a valid timezone. Use an IANA name, e.g. ` +
          '`America/Los_Angeles`, `America/Denver`, `America/Chicago`, `America/New_York`, `Europe/London`, `Australia/Sydney`.',
      });
    }
    db.setUserTimezone(interaction.user.id, tz);
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        `✅ Saved. When **you** create events, times will be interpreted in \`${tz}\`.\n` +
        'Everyone still sees each event in their own local time automatically.',
    });
  }

  if (sub === 'calendar') {
    const timezone = db.getUserTimezone(interaction.user.id) || config.defaultTimezone;
    const now = DateTime.now().setZone(timezone);
    const year = interaction.options.getInteger('year') || now.year;
    const month = interaction.options.getInteger('month') || now.month;

    const monthStart = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone });
    const monthEnd = monthStart.plus({ months: 1 });
    const startTs = Math.floor(monthStart.toSeconds());
    const endTs = Math.floor(monthEnd.toSeconds());

    const events = db.getEventsByRange(interaction.guildId, startTs, endTs);
    const payload = buildCalendarMessage({
      year,
      month,
      events,
      guildId: interaction.guildId,
      timezone,
    });

    return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'create') {
    const title = interaction.options.getString('title');
    const date = interaction.options.getString('date');
    const time = interaction.options.getString('time');
    const description = interaction.options.getString('description');
    const explicitTz = interaction.options.getString('timezone');
    const timezone = explicitTz || db.getUserTimezone(interaction.user.id) || config.defaultTimezone;
    const cap = interaction.options.getInteger('cap');
    const durationMin = interaction.options.getInteger('duration') || 120;
    const leader =
      interaction.options.getString('leader') ||
      interaction.member?.displayName ||
      interaction.user.username;
    const url = interaction.options.getString('url');
    const imageUrl = interaction.options.getString('image') || config.defaultImageUrl || null;

    if (url && !/^https?:\/\//i.test(url)) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: '⚠️ `url` must start with http:// or https://' });
    }
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: '⚠️ `image` must start with http:// or https://' });
    }

    const parsed = parseEventTime(date, time, timezone);
    if (!parsed.ok) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⚠️ ${parsed.error}` });
    }

    // Remember an explicitly chosen timezone as this user's personal default.
    if (explicitTz) db.setUserTimezone(interaction.user.id, timezone);

    const event = db.createEvent({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      creatorId: interaction.user.id,
      creatorName: interaction.member?.displayName || interaction.user.username,
      leader,
      title,
      description,
      startTs: parsed.ts,
      timezone,
      url,
      imageUrl,
      cap,
      durationMin,
    });

    const payload = buildEventMessage(event, []);
    let message;
    try {
      message = await interaction.channel.send(payload);
    } catch (error) {
      // Roll back the event we just created so it doesn't dangle without a message.
      db.deleteEvent(event.id);
      if (error?.code === 50001 || error?.code === 50013) {
        return interaction.reply({
          flags: MessageFlags.Ephemeral,
          content:
            "⛔ I can't post in this channel. Please give **FFXI Jarvis** the **View Channel**, " +
            '**Send Messages**, and **Embed Links** permissions here (or run `/event create` in a ' +
            'channel where I have them), then try again.',
        });
      }
      throw error;
    }
    db.setEventMessage(event.id, message.id);

    const usedSavedOrExplicit = explicitTz || db.getUserTimezone(interaction.user.id);
    const tzNote = usedSavedOrExplicit
      ? `🕒 Times interpreted in your timezone \`${timezone}\`.`
      : `🕒 Times interpreted in the server default \`${timezone}\`. Set your own with \`/event timezone\`.`;

    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        `✅ Created event **#${event.id}** — ${title}.\n` +
        `${tzNote}\n` +
        'These **Edit** buttons are private to you. Re-open them anytime with ' +
        `\`/event manage id:${event.id}\`.`,
      components: buildManageComponents(event),
    });
  }

  if (sub === 'manage') {
    const id = interaction.options.getInteger('id');
    const event = db.getEvent(id);
    if (!event) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⚠️ No event with ID #${id}.` });
    }
    if (!canManage(interaction, event)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '⛔ Only the event creator or a member with Manage Events can manage this event.',
      });
    }
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `🛠️ Manage event **#${id}** — ${event.title}. Only you can see these buttons.`,
      components: buildManageComponents(event),
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

// ---- Suggestion box subcommands -------------------------------------------
async function executeSuggest(interaction) {
  const sub = interaction.options.getSubcommand();

  // Any member can submit an idea via the modal.
  if (sub === 'add') {
    return interaction.showModal(buildSuggestModal());
  }

  // Everything below is organizer-only.
  if (!isOrganizer(interaction)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: '⛔ Only organizers (Manage Events / Manage Server) can do that. Use `/event suggest add` to submit an idea.',
    });
  }

  if (sub === 'board') {
    try {
      await interaction.channel.send(buildSuggestBoardMessage());
    } catch (error) {
      if (error?.code === 50001 || error?.code === 50013) {
        return interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "⛔ I can't post in this channel. Give me **Send Messages** and **Embed Links** here, then try again.",
        });
      }
      throw error;
    }
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: '✅ Posted the Suggestion Box here. Members can submit ideas with the button.',
    });
  }

  if (sub === 'list') {
    const status = interaction.options.getString('status');
    const rows = db.getSuggestions(interaction.guildId, status);
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: buildSuggestionList(rows, { status }),
    });
  }

  if (sub === 'resolve') {
    const id = interaction.options.getInteger('id');
    const status = interaction.options.getString('status') || 'done';
    const existing = db.getSuggestion(id);
    if (!existing || existing.guild_id !== interaction.guildId) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⚠️ No suggestion with ID #${id}.` });
    }
    db.setSuggestionStatus(id, status);
    const verb = status === 'done' ? 'marked done' : status === 'dismissed' ? 'dismissed' : 'reopened';
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `✅ Suggestion **#${id}** ${verb}.`,
    });
  }
}

module.exports = { data, execute };