require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    console.error('Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
  return value;
}

const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: process.env.GUILD_ID || null,
  // Additional guilds to register slash commands in (comma-separated). Useful
  // when the linkshell bridge channel lives in a different server than the main
  // events guild, so /bridge etc. appear there too.
  extraGuildIds: (process.env.EXTRA_GUILD_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
  defaultImageUrl: process.env.DEFAULT_IMAGE_URL || null,
  reminderMinutes: Number.parseInt(process.env.REMINDER_MINUTES ?? '15', 10) || 0,
  databasePath: process.env.DATABASE_PATH || 'data/ffxi-jarvis.db',
  bridgeChannelId: process.env.BRIDGE_CHANNEL_ID || null,
  bridgeChannelId2: process.env.BRIDGE_CHANNEL_ID_2 || null,
  relayPort: Number.parseInt(process.env.RELAY_PORT ?? '3007', 10) || 3007,
  relayChannelIds: (process.env.RELAY_CHANNEL_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  tunnelAnnounceChannelId: process.env.TUNNEL_ANNOUNCE_CHANNEL_ID || null,
};

module.exports = config;
