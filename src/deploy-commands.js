const { REST, Routes } = require('discord.js');
const config = require('./config');
const eventCommand = require('./commands/event');

const commands = [eventCommand.data.toJSON()];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: commands,
      });
      console.log(`Registered ${commands.length} command(s) to guild ${config.guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
      console.log(`Registered ${commands.length} global command(s). May take up to ~1h to appear.`);
    }
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
})();
