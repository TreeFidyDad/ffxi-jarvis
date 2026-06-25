const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const db = require('../db');
const linkshellBridge = require('../lib/linkshellBridge');

// Persisted setting key for the Discord -> FFXI relay direction.
const SETTING_KEY = 'bridge_discord_to_ffxi';

// Apply the persisted toggle on startup so the bridge resumes its last state
// after a bot restart. Defaults to ON when never set.
function applyPersistedState() {
  const stored = db.getSetting(SETTING_KEY, 'on');
  linkshellBridge.setDiscordToFfxi(stored !== 'off');
  return stored !== 'off';
}

const data = new SlashCommandBuilder()
  .setName('bridge')
  .setDescription('Control the Discord \u2194 FFXI linkshell relay')
  .addSubcommand((sub) =>
    sub
      .setName('on')
      .setDescription('Relay Discord messages into the FFXI linkshell (2-way)'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('off')
      .setDescription('Stop relaying Discord messages into FFXI (one-way: FFXI \u2192 Discord only)'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription('Show whether the 2-way relay is currently on or off'),
  );

function isOrganizer(interaction) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) ||
    false
  );
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'status') {
    const on = linkshellBridge.isDiscordToFfxiEnabled();
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: on
        ? '🔁 **2-way relay is ON.** Discord messages are pushed into the FFXI linkshell.'
        : '➡️ **2-way relay is OFF.** Only FFXI → Discord is active; Discord messages stay out of the game.',
    });
  }

  if (!isOrganizer(interaction)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: '⛔ Only organizers (Manage Server / Manage Events) can change the relay. Use `/bridge status` to check it.',
    });
  }

  const enable = sub === 'on';
  linkshellBridge.setDiscordToFfxi(enable);
  db.setSetting(SETTING_KEY, enable ? 'on' : 'off');

  return interaction.reply({
    content: enable
      ? '🔁 **2-way relay enabled.** Discord messages will now be relayed into the FFXI linkshell.'
      : '➡️ **2-way relay disabled.** FFXI chat still mirrors to Discord, but Discord messages will no longer be sent into the game.',
  });
}

module.exports = { data, execute, applyPersistedState };
