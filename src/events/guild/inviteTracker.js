const { Events } = require('discord.js');
const logger = require('../../utils/logger');
const { upsertInviteCreated } = require('../../utils/inviteUtils');

module.exports = {
  name: Events.InviteCreate,
  once: false,
  execute(invite) {
    if (!invite.guild || !invite.inviter) return;

    const cached = invite.client.inviteCache.get(invite.guild.id) ?? new Map();
    cached.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter.id });
    invite.client.inviteCache.set(invite.guild.id, cached);

    upsertInviteCreated(invite.code, invite.inviter.id, invite.uses ?? 0, invite.guild.id);

    logger.debug(`Invite created: ${invite.code} by ${invite.inviter.tag}`);
  },
};
