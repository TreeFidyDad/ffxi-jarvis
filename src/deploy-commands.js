const { REST, Routes } = require('discord.js');
const config = require('./config');
const eventCommand = require('./commands/event');
const popCommand = require('./commands/pop');
const bridgeCommand = require('./commands/bridge');

const commands = [eventCommand.data.toJSON(), popCommand.data.toJSON(), bridgeCommand.data.toJSON()];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    if (config.guildId) {
      // Register to the main guild plus any extra guilds (e.g. a linkshell
      // server whose bridge channel lives outside the events guild).
      const guildIds = [config.guildId, ...config.extraGuildIds].filter(
        (id, i, arr) => id && arr.indexOf(id) === i,
      );
      for (const gid of guildIds) {
        await rest.put(Routes.applicationGuildCommands(config.clientId, gid), {
          body: commands,
        });
        console.log(`Registered ${commands.length} command(s) to guild ${gid}.`);
      }
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
      console.log(`Registered ${commands.length} global command(s). May take up to ~1h to appear.`);
    }
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
})();
