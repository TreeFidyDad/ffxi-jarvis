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
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
  reminderMinutes: Number.parseInt(process.env.REMINDER_MINUTES ?? '15', 10) || 0,
  databasePath: process.env.DATABASE_PATH || 'data/ffxi-jarvis.db',
};

module.exports = config;
