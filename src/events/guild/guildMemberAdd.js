const { Events } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    logger.info(`New member joined: ${member.user.tag} (${member.id})`);
    // Phase 1: onboarding DM will be implemented here
  },
};
