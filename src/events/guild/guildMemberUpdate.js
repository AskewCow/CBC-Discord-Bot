const { Events } = require('discord.js');
const logger = require('../../utils/logger');
const cfg = require('../../utils/config');
const { CONFIG_KEYS } = require('../../constants');
const { syncRoster } = require('../../utils/roster');

// Keep the public roster in step with Discord: re-sync when a member's
// nickname changes, or when they gain/lose the ambassador or committee role.
module.exports = {
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(oldMember, newMember) {
    const guild = newMember.guild;

    const rosterRoleIds = new Set([
      ...cfg.getValues(guild.id, CONFIG_KEYS.AMBASSADOR_ROLE),
      ...cfg.getValues(guild.id, CONFIG_KEYS.COMMITTEE_ROLE),
    ]);
    if (rosterRoleIds.size === 0) return;

    const roleChanged = [...rosterRoleIds].some(
      (id) => oldMember.roles.cache.has(id) !== newMember.roles.cache.has(id),
    );

    const onRoster = [...rosterRoleIds].some((id) => newMember.roles.cache.has(id));
    const nickChanged = oldMember.nickname !== newMember.nickname;

    if (!roleChanged && !(nickChanged && onRoster)) return;

    logger.debug(`roster: member update for ${newMember.id} → re-sync`);
    await syncRoster(guild).catch((err) =>
      logger.warn(`Roster sync on member update failed: ${err.message}`),
    );
  },
};
