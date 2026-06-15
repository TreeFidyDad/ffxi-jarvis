const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const { getTemplate, templateItems } = require('../data/popsets');

// ---- Component custom IDs --------------------------------------------------
const POP = {
  OPEN_PREFIX: 'pop:open:', // pop:open:<listId> -> open my-items picker
  SELECT_PREFIX: 'pop:select:', // pop:select:<listId> -> the multi-select submit
};

const MAX_HOLDERS_SHOWN = 8;

// Group marks by item key -> array of usernames.
function holdersByItem(marks) {
  const map = new Map();
  for (const m of marks) {
    if (!map.has(m.item_key)) map.set(m.item_key, []);
    map.get(m.item_key).push(m.username);
  }
  return map;
}

// Build the public checklist message: one embed field per god group, each line
// a ✅/⬜ item plus who has it.
function buildPopMessage(list, marks) {
  const template = getTemplate(list.template);
  if (!template) {
    return { content: '⚠️ Unknown pop-set template.', embeds: [], components: [] };
  }
  const holders = holdersByItem(marks);

  const items = templateItems(template);
  const haveCount = items.filter((it) => (holders.get(it.key) || []).length > 0).length;

  const embed = new EmbedBuilder()
    .setColor(haveCount === items.length ? 0x2ecc71 : 0x5865f2)
    .setTitle(`${template.emoji} ${list.title}`)
    .setDescription(
      [
        `Tap **✅ I have these** to mark the pop items you're holding.`,
        `Coverage: **${haveCount}/${items.length}** items held by at least one person.`,
      ].join('\n'),
    );

  for (const group of template.groups) {
    const lines = group.items.map((it) => {
      const who = holders.get(it.key) || [];
      const box = who.length ? '✅' : '⬜';
      const label = it.nm && it.nm !== it.item ? `**${it.item}** _(${it.nm})_` : `**${it.item}**`;
      let suffix = '';
      if (who.length) {
        const shown = who.slice(0, MAX_HOLDERS_SHOWN).join(', ');
        const extra = who.length > MAX_HOLDERS_SHOWN ? ` +${who.length - MAX_HOLDERS_SHOWN}` : '';
        suffix = ` — ${shown}${extra}`;
      }
      return `${box} ${label}${suffix}`;
    });
    embed.addFields({ name: `${group.emoji} ${group.name}`, value: lines.join('\n'), inline: false });
  }

  embed.setFooter({ text: `Pop list #${list.id}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${POP.OPEN_PREFIX}${list.id}`)
      .setLabel('I have these')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [row] };
}

// Ephemeral multi-select so a member can tick every item they hold at once.
// Pre-selects the items they've already marked. Carries the listId in the id.
function buildPopPicker(list, userMarks) {
  const template = getTemplate(list.template);
  const items = templateItems(template);
  const have = new Set(userMarks);

  const options = items.slice(0, 25).map((it) => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(`${it.item}`.slice(0, 100))
      .setValue(it.key)
      .setDescription(`${it.group}${it.nm && it.nm !== it.item ? ` · pops ${it.nm}` : ''}`.slice(0, 100))
      .setDefault(have.has(it.key));
    return opt;
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${POP.SELECT_PREFIX}${list.id}`)
    .setPlaceholder('Select every pop item you have…')
    .setMinValues(0)
    .setMaxValues(options.length)
    .addOptions(options);

  return [new ActionRowBuilder().addComponents(select)];
}

module.exports = { POP, buildPopMessage, buildPopPicker };
