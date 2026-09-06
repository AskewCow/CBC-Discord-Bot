const { Events } = require('discord.js');
const { nowSec } = require('../../utils/time');
const pg     = require('../../database/pg');
const logger = require('../../utils/logger');
const { revalidateWebsite } = require('../../utils/websiteRevalidate');
const { syncRoster } = require('../../utils/roster');

module.exports = {
  name: Events.GuildMemberRemove,
  once: false,
  async execute(member) {
    if (member.user.bot) return;

    logger.info(`Member left: ${member.user.tag} (${member.id})`);
    const now = nowSec();
    await pg.query('UPDATE members SET left_at = $1 WHERE discord_id = $2', [now, member.id])
      .catch(err => logger.warn(`Could not mark ${member.id} as left: ${err.message}`));
    revalidateWebsite(['stats']).catch(() => {});

    // If the departed member was an ambassador/committee member, drop them from
    // the public roster too.
    await syncRoster(member.guild).catch(err =>
      logger.warn(`Roster sync on member leave failed: ${err.message}`),
    );
  },
};
