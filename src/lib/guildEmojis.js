// Per-guild cache of custom FFXI job + role emojis.
// Any emoji named `ffxi_<jobcode>` (e.g. ffxi_whm) is matched to that job, and
// any emoji named `role_<name>` (role_tank / role_dps / role_healer /
// role_melee / role_pranged / role_mranged ...) is indexed by that name. Used
// in roster embeds, the Job dropdown, and the role buttons. Works on any server
// without hardcoding IDs.

const { Routes } = require('discord.js');

// guildId -> Map(JOBCODE -> { id, name, animated, mention })
const cache = new Map();
// guildId -> Map(ROLENAME -> { id, name, animated, mention }) for role icons,
// keyed by the lowercase suffix after `role_` and any normalized alias.
const roleCache = new Map();

// Extra keys an emoji should also be registered under (alias -> canonical use).
const ROLE_NAME_ALIASES = {
  dd: 'dps',
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
      const name = role[1].toLowerCase();
      roles.set(name, info);
      const alias = ROLE_NAME_ALIASES[name];
      if (alias && !roles.has(alias)) roles.set(alias, info);
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

function lookupRole(guildId, names) {
  const m = roleCache.get(guildId);
  if (!m) return null;
  for (const n of [].concat(names || [])) {
    const hit = m.get(String(n).toLowerCase());
    if (hit) return hit;
  }
  return null;
}

// Role icon as a mention, given one name or a priority list of names, or null.
function roleEmojiMention(guildId, names) {
  return lookupRole(guildId, names)?.mention || null;
}

// Role icon as a component object, given one name or a priority list, or null.
function roleEmojiComponent(guildId, names) {
  const e = lookupRole(guildId, names);
  return e ? { id: e.id, name: e.name, animated: e.animated } : null;
}

// Copy ffxi_* and role_* emojis from a source guild to a target guild.
// Skips any emoji the target already has (by name). Requires Manage Emojis.
async function syncEmojisToGuild(client, sourceGuildId, targetGuildId) {
  if (sourceGuildId === targetGuildId) return;

  // Fetch emojis from both guilds.
  const sourceEmojis = await client.rest.get(Routes.guildEmojis(sourceGuildId)).catch(() => []);
  const targetEmojis = await client.rest.get(Routes.guildEmojis(targetGuildId)).catch(() => []);

  const targetNames = new Set(targetEmojis.map((e) => e.name));

  // Filter source emojis to only ffxi_* and role_* that target is missing.
  const toSync = sourceEmojis.filter((e) => {
    if (targetNames.has(e.name)) return false;
    return /^(ffxi|role)[_-]/i.test(e.name || '');
  });

  if (!toSync.length) return;

  console.log(`[Emoji Sync] Copying ${toSync.length} emoji(s) from ${sourceGuildId} to ${targetGuildId}...`);

  for (const emoji of toSync) {
    try {
      const ext = emoji.animated ? 'gif' : 'png';
      const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}`;
      const res = await fetch(url);
      const buffer = Buffer.from(await res.arrayBuffer());
      const base64 = `data:image/${ext};base64,${buffer.toString('base64')}`;

      await client.rest.post(Routes.guildEmojis(targetGuildId), {
        body: { name: emoji.name, image: base64 },
      });
      console.log(`[Emoji Sync] ✓ ${emoji.name}`);
    } catch (err) {
      console.error(`[Emoji Sync] ✗ ${emoji.name}: ${err.message || err}`);
    }
  }

  // Re-index the target guild's emojis after upload.
  await ensureGuildEmojis(client, targetGuildId, true);
}

module.exports = {
  indexEmojis,
  ensureGuildEmojis,
  syncEmojisToGuild,
  jobEmojiMention,
  jobEmojiComponent,
  roleEmojiMention,
  roleEmojiComponent,
};
