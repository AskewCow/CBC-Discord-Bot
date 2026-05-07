const { Events } = require('discord.js');
const db     = require('../../database/db');
const logger = require('../../utils/logger');

module.exports = {
  name: Events.GuildMemberRemove,
  once: false,
  execute(member) {
    logger.info(`Member left: ${member.user.tag} (${member.id})`);
    db.prepare('UPDATE members SET left_at = ? WHERE discord_id = ?').run(Date.now(), member.id);
  },
};
