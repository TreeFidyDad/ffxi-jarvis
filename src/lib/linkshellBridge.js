/**
 * Linkshell <-> Discord Bridge (supports two linkshells)
 *
 * File-based IPC between FFXI (Ashita addon) and Discord bot.
 * - Reads FFXI linkshell messages from ffxi_to_discord.txt and routes each line
 *   to the Discord channel for its linkshell (LS1 or LS2).
 * - Writes Discord messages to discord_to_ffxi.txt (tagged with the target LS)
 *   for the addon to broadcast into the matching linkshell.
 *
 * IPC line format (both files): "LS1|name|message text"
 * Untagged lines are treated as LS1 for backward compatibility.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FFXI_TO_DISCORD = path.join(DATA_DIR, 'ffxi_to_discord.txt');
const DISCORD_TO_FFXI = path.join(DATA_DIR, 'discord_to_ffxi.txt');

// Ensure files exist
if (!fs.existsSync(FFXI_TO_DISCORD)) fs.writeFileSync(FFXI_TO_DISCORD, '');
if (!fs.existsSync(DISCORD_TO_FFXI)) fs.writeFileSync(DISCORD_TO_FFXI, '');

let lastReadPos = 0;
let pollInterval = null;

// Map of LS key -> Discord channel object, and the reverse (channelId -> LS key).
const channels = {};        // { LS1: <Channel>, LS2: <Channel> }
const channelIdToLS = {};   // { "<id>": "LS1", ... }

/**
 * Start the bridge: poll for FFXI messages and forward to Discord.
 * @param {import('discord.js').Client} client
 * @param {{ LS1?: string, LS2?: string }} channelIds - Discord channel id per linkshell
 */
function start(client, channelIds) {
  const ids = channelIds || {};
  const configured = Object.entries(ids).filter(([, id]) => !!id);

  if (configured.length === 0) {
    console.log('[Bridge] No bridge channel ids set, linkshell bridge disabled.');
    return;
  }

  // Reset read position to end of file (don't replay old messages on restart)
  try {
    lastReadPos = fs.statSync(FFXI_TO_DISCORD).size;
  } catch {
    lastReadPos = 0;
  }

  // Fetch each configured channel once client is ready
  for (const [ls, id] of configured) {
    channelIdToLS[id] = ls;
    client.channels.fetch(id).then((ch) => {
      channels[ls] = ch;
      console.log(`[Bridge] ${ls} linked to Discord channel: #${ch.name}`);
    }).catch((err) => {
      console.error(`[Bridge] Failed to fetch ${ls} channel (${id}):`, err.message);
    });
  }

  pollInterval = setInterval(() => pollFFXIMessages(), 2000);
  console.log(`[Bridge] Polling started (2s interval) for ${configured.map(([ls]) => ls).join(', ')}.`);
}

/**
 * Parse an IPC line "LS1|name|message". Falls back to LS1 for untagged
 * "name: message" lines.
 */
function parseLine(line) {
  const m = line.match(/^(LS\d)\|([^|]*)\|([\s\S]*)$/);
  if (m) {
    return { ls: m[1], name: m[2], message: m[3] };
  }
  return { ls: 'LS1', name: null, message: line };
}

/**
 * Check for new lines in ffxi_to_discord.txt and route to the right channel.
 */
function pollFFXIMessages() {
  try {
    const stat = fs.statSync(FFXI_TO_DISCORD);
    if (stat.size <= lastReadPos) return; // no new data

    const fd = fs.openSync(FFXI_TO_DISCORD, 'r');
    const buf = Buffer.alloc(stat.size - lastReadPos);
    fs.readSync(fd, buf, 0, buf.length, lastReadPos);
    fs.closeSync(fd);
    lastReadPos = stat.size;

    const lines = buf.toString('utf8').split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const { ls, name, message } = parseLine(line);
      const channel = channels[ls];
      if (!channel) continue; // that linkshell isn't bridged / not ready yet

      const body = name ? `${name}: ${message}` : message;
      const formatted = `💬 **[${ls}]** ${body}`;
      channel.send(formatted).catch((err) => {
        console.error(`[Bridge] Failed to send to Discord (${ls}):`, err.message);
      });
    }
  } catch (err) {
    // File might be temporarily locked by the addon, ignore
  }
}

/**
 * Append a Discord message to discord_to_ffxi.txt, tagged with the target LS.
 */
function sendToFFXI(ls, username, message) {
  const line = `${ls}|${username}|${message}\n`;
  try {
    fs.appendFileSync(DISCORD_TO_FFXI, line, 'utf8');
  } catch (err) {
    console.error('[Bridge] Failed to write to FFXI file:', err.message);
  }
}

/**
 * Handle incoming Discord messages in any bridge channel.
 * @param {import('discord.js').Message} message
 */
function handleDiscordMessage(message) {
  const ls = channelIdToLS[message.channel.id];
  if (!ls) return;             // not a bridge channel
  if (message.author.bot) return; // don't relay bot messages back

  const username = message.member?.displayName || message.author.username;
  const content = message.content;
  if (!content || content.length === 0) return;

  // Truncate to FFXI chat limit (~150 chars)
  sendToFFXI(ls, username, content.substring(0, 150));
}

function stop() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

module.exports = { start, stop, handleDiscordMessage, FFXI_TO_DISCORD, DISCORD_TO_FFXI };
