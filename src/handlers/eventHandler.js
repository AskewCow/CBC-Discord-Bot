const path = require('path');
const logger = require('../utils/logger');
const { walkJs } = require('../utils/walkJs');

function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  let count = 0;

  for (const file of walkJs(eventsPath)) {
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

module.exports = { loadEvents };
