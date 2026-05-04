const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  const files = getJsFiles(eventsPath);
  let count = 0;

  for (const file of files) {
    const event = require(file);

    if (!event.name || !event.execute) {
      logger.warn(`Skipping ${file} — missing name or execute export`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    logger.debug(`Loaded event: ${event.name}`);
    count++;
  }

  logger.info(`Loaded ${count} event(s)`);
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

module.exports = { loadEvents };
