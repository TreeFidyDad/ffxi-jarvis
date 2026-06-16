/**
 * Linkshell <-> Discord Bridge
 * 
 * File-based IPC between FFXI (Ashita addon) and Discord bot.
 * - Reads FFXI linkshell messages from ffxi_to_discord.txt
 * - Writes Discord messages to discord_to_ffxi.txt for the addon to display
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
let discordChannel = null;
let pollInterval = null;

/**
 * Start the bridge: poll for FFXI messages and forward to Discord.
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} channelId - Discord channel ID for the bridge
 */
function start(client, channelId) {
  if (!channelId) {
    console.log('[Bridge] No BRIDGE_CHANNEL_ID set, linkshell bridge disabled.');
    return;
  }

  // Reset read position to end of file (don't replay old messages on restart)
  try {
    const stat = fs.statSync(FFXI_TO_DISCORD);
    lastReadPos = stat.size;
  } catch {
    lastReadPos = 0;
  }

  // Fetch the channel once client is ready
  client.channels.fetch(channelId).then((ch) => {
    discordChannel = ch;
    console.log(`[Bridge] Linked to Discord channel: #${ch.name}`);
  }).catch((err) => {
    console.error('[Bridge] Failed to fetch channel:', err.message);
  });

  // Poll for new FFXI messages every 2 seconds
  pollInterval = setInterval(() => pollFFXIMessages(), 2000);
  console.log('[Bridge] Polling started (2s interval).');
}

/**
 * Check for new lines in ffxi_to_discord.txt
 */
function pollFFXIMessages() {
  if (!discordChannel) return;

  try {
    const stat = fs.statSync(FFXI_TO_DISCORD);
    if (stat.size <= lastReadPos) return; // no new data

    const fd = fs.openSync(FFXI_TO_DISCORD, 'r');
    const buf = Buffer.alloc(stat.size - lastReadPos);
    fs.readSync(fd, buf, 0, buf.length, lastReadPos);
    fs.closeSync(fd);
    lastReadPos = stat.size;

    const newData = buf.toString('utf8');
    const lines = newData.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      // Format from addon: "CharName: message text"
      const formatted = `💬 **[LS]** ${line}`;
      discordChannel.send(formatted).catch((err) => {
        console.error('[Bridge] Failed to send to Discord:', err.message);
      });
    }
  } catch (err) {
    // File might be temporarily locked by addon, ignore
  }
}

/**
 * Send a Discord message to FFXI (append to discord_to_ffxi.txt)
 * @param {string} username - Discord username
 * @param {string} message - Message content
 */
function sendToFFXI(username, message) {
  const line = `${username}: ${message}\n`;
  try {
    fs.appendFileSync(DISCORD_TO_FFXI, line, 'utf8');
  } catch (err) {
    console.error('[Bridge] Failed to write to FFXI file:', err.message);
  }
}

/**
 * Handle incoming Discord messages in the bridge channel
 * @param {import('discord.js').Message} message
 * @param {string} channelId - The bridge channel ID
 */
function handleDiscordMessage(message, channelId) {
  if (!channelId) return;
  if (message.channel.id !== channelId) return;
  if (message.author.bot) return; // don't relay bot messages back
  
  const username = message.member?.displayName || message.author.username;
  const content = message.content;
  if (!content || content.length === 0) return;
  
  // Truncate to FFXI chat limit (~150 chars)
  const truncated = content.substring(0, 150);
  sendToFFXI(username, truncated);
}

/**
 * Stop the bridge
 */
function stop() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

module.exports = { start, stop, handleDiscordMessage, FFXI_TO_DISCORD, DISCORD_TO_FFXI };
