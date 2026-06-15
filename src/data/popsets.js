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
// `pop: true` marks an item that must be traded to spawn the god (an
// ingredient). Items without it (the god's own Seal, stray loot like Curtana)
// are tracked for coverage but don't gate how many times the god can be popped.
function buildTemplate(groups) {
  return groups.map((g) => ({
    name: g.name,
    emoji: g.emoji,
    items: g.items.map((it) => ({
      key: `${slug(g.name)}__${slug(it.item)}`,
      item: it.item, // the trade/pop item a player can hold
      nm: it.nm, // the NM / god this item pops (context)
      pop: Boolean(it.pop), // true = required to spawn the god
      trophy: Boolean(it.trophy), // true = the god's own Seal (reward)
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
          { nm: 'Seiryu', item: 'Seal of Seiryu', trophy: true },
          { nm: 'Steam Cleaner', item: 'Gem of the East', pop: true },
          { nm: 'Mother Globe', item: 'Springstone', pop: true },
        ],
      },
      {
        name: 'Suzaku',
        emoji: '🟥',
        items: [
          { nm: 'Suzaku', item: 'Seal of Suzaku', trophy: true },
          { nm: 'Brigandish Blade', item: 'Gem of the South', pop: true },
          { nm: 'Brigandish Blade', item: 'Curtana' },
          { nm: 'Faust', item: 'Summerstone', pop: true },
        ],
      },
      {
        name: 'Byakko',
        emoji: '⬜',
        items: [
          { nm: 'Byakko', item: 'Seal of Byakko', trophy: true },
          { nm: 'Despot', item: 'Gem of the West', pop: true },
          { nm: 'Ullikummi', item: 'Autumnstone', pop: true },
          { nm: 'Aura Statue', item: 'Diorite', pop: true },
        ],
      },
      {
        name: 'Genbu',
        emoji: '🟩',
        items: [
          { nm: 'Genbu', item: 'Seal of Genbu', trophy: true },
          { nm: 'Zipacna', item: 'Gem of the North', pop: true },
          { nm: 'Olla Grande', item: 'Winterstone', pop: true },
          { nm: 'Aura Pot', item: "Ro'Maeve Water", pop: true },
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
