const { Events } = require('discord.js');
const logger         = require('../../utils/logger');
const eventScheduler = require('../../utils/eventScheduler');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    logger.info(`Bot ready: ${client.user.tag}`);
    eventScheduler.start(client);
  },
};
