const { Events } = require('discord.js');
const logger                  = require('../../utils/logger');
const { startOnboardingFlow } = require('../../utils/onboardingFlow');

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    logger.info(`New member joined: ${member.user.tag} (${member.id})`);

    try {
      await startOnboardingFlow(member, member.guild);
    } catch (err) {
      logger.error(`Onboarding DM failed for ${member.user.tag}: ${err.message}`, err);
    }
  },
};
