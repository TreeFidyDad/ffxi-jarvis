const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const db = require('../db');
const { getTemplate, TEMPLATES } = require('../data/popsets');
const { buildPopMessage } = require('../lib/poplist');

const TEMPLATE_CHOICES = Object.values(TEMPLATES).map((t) => ({ name: t.title, value: t.id }));

const data = new SlashCommandBuilder()
  .setName('pop')
  .setDescription('Shared pop-item checklists for NM / god runs')
  .addSubcommand((sub) =>
    sub
      .setName('board')
      .setDescription('Post a pop-item checklist members can tick (organizers)')
      .addStringOption((o) => {
        o.setName('template').setDescription('Which checklist to post').setRequired(false);
        TEMPLATE_CHOICES.forEach((c) => o.addChoices(c));
        return o;
      }),
  )
  .addSubcommand((sub) =>
    sub
      .setName('reset')
      .setDescription('Clear everyone’s ticks on a pop list (organizers)')
      .addIntegerOption((o) => o.setName('id').setDescription('Pop list ID').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Delete a pop list and its message (organizers)')
      .addIntegerOption((o) => o.setName('id').setDescription('Pop list ID').setRequired(true)),
  );

function isOrganizer(interaction) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    false
  );
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (!isOrganizer(interaction)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: '⛔ Only organizers (Manage Events / Manage Server) can manage pop lists. Members tick items with the **✅ I have these** button.',
    });
  }

  if (sub === 'board') {
    const templateId = interaction.options.getString('template') || 'sky';
    const template = getTemplate(templateId);
    if (!template) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⚠️ Unknown template \`${templateId}\`.` });
    }

    const list = db.createPopList({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      creatorId: interaction.user.id,
      template: template.id,
      title: template.title,
    });

    let message;
    try {
      message = await interaction.channel.send(buildPopMessage(list, []));
    } catch (error) {
      db.deletePopList(list.id);
      if (error?.code === 50001 || error?.code === 50013) {
        return interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: "⛔ I can't post here. Give me **Send Messages** and **Embed Links** in this channel, then try again.",
        });
      }
      throw error;
    }
    db.setPopListMessage(list.id, message.id);

    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `✅ Posted **${template.title}** (pop list #${list.id}). Members tick what they have with the button. Clear it later with \`/pop reset id:${list.id}\`.`,
    });
  }

  if (sub === 'reset' || sub === 'delete') {
    const id = interaction.options.getInteger('id');
    const list = db.getPopList(id);
    if (!list || list.guild_id !== interaction.guildId) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `⚠️ No pop list with ID #${id}.` });
    }

    const channel = await interaction.client.channels.fetch(list.channel_id).catch(() => null);
    const message = list.message_id
      ? await channel?.messages.fetch(list.message_id).catch(() => null)
      : null;

    if (sub === 'reset') {
      db.resetPopList(id);
      if (message) await message.edit(buildPopMessage(list, [])).catch(() => null);
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `♻️ Cleared all ticks on pop list #${id}.` });
    }

    if (message) await message.delete().catch(() => null);
    db.deletePopList(id);
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: `🗑️ Deleted pop list #${id}.` });
  }
}

module.exports = { data, execute };
