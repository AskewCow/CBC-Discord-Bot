const { Events } = require('discord.js');
const { deleteLeaderboard } = require('../../utils/inviteUtils');
const logger = require('../../utils/logger');

module.exports = {
  name: Events.MessageDelete,
  once: false,
  execute(message) {
    deleteLeaderboard(message.id);
    logger.debug(`Checked message ${message.id} for live leaderboard cleanup`);
  },
};
