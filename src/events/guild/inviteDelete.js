const { Events } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  name: Events.InviteDelete,
  once: false,
  execute(invite) {
    if (!invite.guild) return;
    const cached = invite.client.inviteCache.get(invite.guild.id);
    if (cached) cached.delete(invite.code);
    logger.debug(`Invite deleted: ${invite.code}`);
  },
};
