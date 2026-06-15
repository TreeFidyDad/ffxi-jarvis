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

// Build the public checklist message. A header embed explains the board, then
// each god gets its own embed (with artwork thumbnail) listing its items —
// ✅/⬜ plus how many people have each (×N) and who. Each god's title shows how
// many times it can be popped = the lowest count among its required pop items.
function buildPopMessage(list, marks) {
  const template = getTemplate(list.template);
  if (!template) {
    return { content: '⚠️ Unknown pop-set template.', embeds: [], components: [] };
  }
  const holders = holdersByItem(marks);
  const countOf = (it) => (holders.get(it.key) || []).length;

  // How many full pops a god group can assemble = min count across its
  // required ingredients (items flagged pop:true).
  function popsReady(group) {
    const ingredients = group.items.filter((it) => it.pop);
    if (!ingredients.length) return null;
    return Math.min(...ingredients.map(countOf));
  }

  const totalPops = template.groups.reduce((sum, g) => sum + (popsReady(g) || 0), 0);

  const header = new EmbedBuilder()
    .setColor(totalPops > 0 ? 0x2ecc71 : 0x5865f2)
    .setTitle(`${template.emoji} ${list.title}`)
    .setDescription(
      [
        `Tap **✅ I have these** to mark the pop items you're holding.`,
        `🔁 **Pops ready** = how many times the group can spawn that god right now (limited by the rarest required item).`,
      ].join('\n'),
    );

  const embeds = [header];

  for (const group of template.groups) {
    const ready = popsReady(group);
    const lines = group.items.map((it) => {
      const who = holders.get(it.key) || [];
      const n = who.length;
      const box = it.trophy ? '🏆' : n ? '✅' : '⬜';
      const label = it.nm && it.nm !== it.item ? `**${it.item}** _(${it.nm})_` : `**${it.item}**`;
      const tag = it.trophy ? ' _(seal)_' : it.pop ? '' : ' _(extra)_';
      let suffix = '';
      if (n) {
        const shown = who.slice(0, MAX_HOLDERS_SHOWN).join(', ');
        const extra = n > MAX_HOLDERS_SHOWN ? ` +${n - MAX_HOLDERS_SHOWN}` : '';
        suffix = ` — ${shown}${extra}`;
      }
      const countBadge = n ? ` \`×${n}\`` : '';
      return `${box} ${label}${tag}${countBadge}${suffix}`;
    });

    const title = ready === null ? `${group.emoji} ${group.name}` : `${group.emoji} ${group.name} — 🔁 ${ready} ready`;
    const godEmbed = new EmbedBuilder()
      .setColor(ready ? 0x2ecc71 : 0x4f545c)
      .setTitle(title)
      .setDescription(lines.join('\n'));
    if (group.image) godEmbed.setThumbnail(group.image);
    embeds.push(godEmbed);
  }

  embeds[embeds.length - 1].setFooter({ text: `Pop list #${list.id} · counts = how many people have each item` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${POP.OPEN_PREFIX}${list.id}`)
      .setLabel('I have these')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );

  return { embeds, components: [row] };
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
