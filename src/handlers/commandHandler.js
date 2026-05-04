const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../utils/logger');

function loadCommands(client) {
  client.commands = new Collection();

  const commandsPath = path.join(__dirname, '..', 'commands');
  const files = getJsFiles(commandsPath);

  for (const file of files) {
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

function getJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

module.exports = { loadCommands };
