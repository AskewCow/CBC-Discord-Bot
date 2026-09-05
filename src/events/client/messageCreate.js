const { Events, ChannelType } = require('discord.js');
const logger               = require('../../utils/logger');
const onb                  = require('../../utils/onboarding');
const { resumeAfterText }  = require('../../utils/onboardingFlow');

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (message.author.bot) return;
    if (message.channel.type !== ChannelType.DM) return;

    const session = onb.getActiveSessionByUser(message.author.id);
    if (!session) return;

    // resumeAfterText re-checks that the session's current step is a text step
    // and no-ops otherwise, so no need to duplicate that here.
    try {
      await resumeAfterText(message, session);
    } catch (err) {
      logger.error(`Onboarding text reply error for ${message.author.tag}: ${err.message}`, err);
    }
  },
};
