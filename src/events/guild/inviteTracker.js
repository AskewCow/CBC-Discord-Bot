const { Events } = require('discord.js');
const db     = require('../../database/db');
const logger = require('../../utils/logger');

module.exports = {
  name: Events.InviteCreate,
  once: false,
  execute(invite) {
    if (!invite.guild || !invite.inviter) return;

    const cached = invite.client.inviteCache.get(invite.guild.id) ?? new Map();
    cached.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter.id });
    invite.client.inviteCache.set(invite.guild.id, cached);

    db.prepare(`
      INSERT INTO invites (code, inviter_id, uses, guild_id, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET uses = excluded.uses
    `).run(invite.code, invite.inviter.id, invite.uses ?? 0, invite.guild.id, Date.now());

    logger.debug(`Invite created: ${invite.code} by ${invite.inviter.tag}`);
  },
};
