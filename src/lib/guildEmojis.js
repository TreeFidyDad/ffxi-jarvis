// Per-guild cache of custom FFXI job + role emojis.
// Any emoji named `ffxi_<jobcode>` (e.g. ffxi_whm) is matched to that job, and
// any emoji named `role_<group>` (role_tank / role_dps / role_healer or
// role_support) is matched to that role group. Used in roster embeds, the Job
// dropdown, and the role buttons. Works on any server without hardcoding IDs.

const { Routes } = require('discord.js');

// guildId -> Map(JOBCODE -> { id, name, animated, mention })
const cache = new Map();
// guildId -> Map(GROUPKEY -> { id, name, animated, mention }) for role icons.
const roleCache = new Map();

// Normalize the various role-emoji spellings to a canonical group key.
const ROLE_GROUP_ALIASES = {
  tank: 'tank',
  dps: 'dps',
  dd: 'dps',
  healer: 'healer',
  heal: 'healer',
  support: 'healer',
};

function indexEmojis(guildId, emojis) {
  const map = new Map();
  const roles = new Map();
  for (const e of emojis) {
    const animated = !!e.animated;
    const info = {
      id: e.id,
      name: e.name,
      animated,
      mention: `<${animated ? 'a' : ''}:${e.name}:${e.id}>`,
    };

    const job = /^ffxi[_-]([a-z]{3})$/i.exec(e.name || '');
    if (job) {
      map.set(job[1].toUpperCase(), info);
      continue;
    }

    const role = /^role[_-]([a-z]+)$/i.exec(e.name || '');
    if (role) {
      const group = ROLE_GROUP_ALIASES[role[1].toLowerCase()];
      if (group) roles.set(group, info);
    }
  }
  cache.set(guildId, map);
  roleCache.set(guildId, roles);
  return map;
}

// Fetch + cache a guild's emojis once. Safe to call repeatedly; only hits the
// API when not already cached unless `force` is set.
async function ensureGuildEmojis(client, guildId, force = false) {
  if (!guildId) return new Map();
  if (!force && cache.has(guildId)) return cache.get(guildId);
  try {
    const emojis = await client.rest.get(Routes.guildEmojis(guildId));
    return indexEmojis(guildId, emojis);
  } catch {
    cache.set(guildId, cache.get(guildId) || new Map());
    roleCache.set(guildId, roleCache.get(guildId) || new Map());
    return cache.get(guildId);
  }
}

// Emoji mention string for an embed, or null if this guild has no custom one.
function jobEmojiMention(guildId, code) {
  return cache.get(guildId)?.get(code)?.mention || null;
}

// Emoji object for a message component (button/select option), or null.
function jobEmojiComponent(guildId, code) {
  const e = cache.get(guildId)?.get(code);
  return e ? { id: e.id, name: e.name, animated: e.animated } : null;
}

// Role-group icon (group key: tank | dps | healer) as a mention, or null.
function roleEmojiMention(guildId, group) {
  return roleCache.get(guildId)?.get(group)?.mention || null;
}

// Role-group icon as a component object, or null.
function roleEmojiComponent(guildId, group) {
  const e = roleCache.get(guildId)?.get(group);
  return e ? { id: e.id, name: e.name, animated: e.animated } : null;
}

module.exports = {
  indexEmojis,
  ensureGuildEmojis,
  jobEmojiMention,
  jobEmojiComponent,
  roleEmojiMention,
  roleEmojiComponent,
};
