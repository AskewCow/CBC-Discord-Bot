const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

// Clear guild commands
rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] })
  .then(() => console.log('Cleared guild commands'))
  .catch(console.error);

// Clear global commands
rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] })
  .then(() => console.log('Cleared global commands'))
  .catch(console.error);