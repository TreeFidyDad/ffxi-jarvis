// Pop-item checklists. A "pop set" is a named template of Notorious Monsters /
// gods grouped together, each with the item that pops (spawns) it. Players tick
// the items they personally have so the group can see coverage before a run.
//
// `key` on each item is a stable slug stored in the database; labels/order come
// from this file at render time, so templates can be tweaked without migrations.

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Build a template's groups, auto-deriving each item's stable key.
function buildTemplate(groups) {
  return groups.map((g) => ({
    name: g.name,
    emoji: g.emoji,
    items: g.items.map((it) => ({
      key: `${slug(g.name)}__${slug(it.item)}`,
      item: it.item, // the trade/pop item a player can hold
      nm: it.nm, // the NM / god this item pops (context)
    })),
  }));
}

const TEMPLATES = {
  // HorizonXI Sky — the four Lesser Gods and their pop-item trees.
  sky: {
    id: 'sky',
    title: 'Sky Gods — Pop Item Checklist',
    emoji: '🗝️',
    groups: buildTemplate([
      {
        name: 'Seiryu',
        emoji: '🟦',
        items: [
          { nm: 'Seiryu', item: 'Seal of Seiryu' },
          { nm: 'Steam Cleaner', item: 'Gem of the East' },
          { nm: 'Mother Globe', item: 'Springstone' },
        ],
      },
      {
        name: 'Suzaku',
        emoji: '🟥',
        items: [
          { nm: 'Suzaku', item: 'Seal of Suzaku' },
          { nm: 'Brigandish Blade', item: 'Gem of the South' },
          { nm: 'Brigandish Blade', item: 'Curtana' },
          { nm: 'Faust', item: 'Summerstone' },
        ],
      },
      {
        name: 'Byakko',
        emoji: '⬜',
        items: [
          { nm: 'Byakko', item: 'Seal of Byakko' },
          { nm: 'Despot', item: 'Gem of the West' },
          { nm: 'Ullikummi', item: 'Autumnstone' },
          { nm: 'Aura Statue', item: 'Diorite' },
        ],
      },
      {
        name: 'Genbu',
        emoji: '🟩',
        items: [
          { nm: 'Genbu', item: 'Seal of Genbu' },
          { nm: 'Zipacna', item: 'Gem of the North' },
          { nm: 'Olla Grande', item: 'Winterstone' },
          { nm: 'Aura Pot', item: "Ro'Maeve Water" },
        ],
      },
    ]),
  },
};

function getTemplate(id) {
  return TEMPLATES[id] || null;
}

// Flat list of every item in a template (used for the picker menu).
function templateItems(template) {
  return template.groups.flatMap((g) =>
    g.items.map((it) => ({ ...it, group: g.name, groupEmoji: g.emoji })),
  );
}

// Look up a single item across a template by its stable key.
function findItem(template, key) {
  return templateItems(template).find((it) => it.key === key) || null;
}

module.exports = { TEMPLATES, getTemplate, templateItems, findItem, slug };
