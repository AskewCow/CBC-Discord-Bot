const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../utils/logger');
const { walkJs } = require('../utils/walkJs');

function loadCommands(client) {
  client.commands = new Collection();

  const commandsPath = path.join(__dirname, '..', 'commands');

  for (const file of walkJs(commandsPath)) {
    const command = require(file);

    if (!command.data || !command.execute) {
      logger.warn(`Skipping ${file} — missing data or execute export`);
      continue;
    }

    client.commands.set(command.data.name, command);
    logger.debug(`Loaded command: ${command.data.name}`);
  }

  logger.info(`Loaded ${client.commands.size} command(s)`);
}

module.exports = { loadCommands };
