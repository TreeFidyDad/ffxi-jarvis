// Per-guild cache of custom FFXI job emojis.
// Any emoji named `ffxi_<jobcode>` (e.g. ffxi_whm) is matched to that job and
// used in roster embeds / the Job dropdown. Works on any server without
// hardcoding IDs — the bot discovers them at runtime.

const { Routes } = require('discord.js');

// guildId -> Map(JOBCODE -> { id, name, animated, mention })
const cache = new Map();

function indexEmojis(guildId, emojis) {
  const map = new Map();
  for (const e of emojis) {
    const m = /^ffxi[_-]([a-z]{3})$/i.exec(e.name || '');
    if (!m) continue;
    const code = m[1].toUpperCase();
    const animated = !!e.animated;
    map.set(code, {
      id: e.id,
      name: e.name,
      animated,
      mention: `<${animated ? 'a' : ''}:${e.name}:${e.id}>`,
    });
  }
  cache.set(guildId, map);
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

module.exports = {
  indexEmojis,
  ensureGuildEmojis,
  jobEmojiMention,
  jobEmojiComponent,
};
