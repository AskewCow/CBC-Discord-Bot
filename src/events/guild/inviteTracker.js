const { Events } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  name: Events.InviteCreate,
  once: false,
  async execute(invite) {
    logger.debug(`Invite created: ${invite.code} by ${invite.inviter?.tag}`);
    // Phase 1: invite tracking will be implemented here
  },
};
