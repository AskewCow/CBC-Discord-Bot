const { Events } = require('discord.js');
const db             = require('../../database/db');   // SQLite — invites
const pg             = require('../../database/pg');   // Postgres — members
const logger         = require('../../utils/logger');
const eventScheduler   = require('../../utils/eventScheduler');
const projectScheduler = require('../../utils/projectScheduler');
const backupScheduler  = require('../../utils/backupScheduler');
const { syncRoster }   = require('../../utils/roster');
const { buildInviteMap, syncInviteFromFetch } = require('../../utils/inviteUtils');

const syncInvitesTx = db.transaction((invites, guildId) => {
  for (const inv of invites.values()) {
    if (inv.inviter) syncInviteFromFetch(inv.code, inv.inviter.id, inv.uses ?? 0, guildId);
  }
});

async function cacheGuildInvites(client) {
  client.inviteCache = new Map();
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      syncInvitesTx(invites, guild.id);

      const map = buildInviteMap(invites);
      client.inviteCache.set(guild.id, map);
      logger.debug(`Cached and synced ${map.size} invites for guild ${guild.id}`);

      await reconcileDepartedMembers(guild);
    } catch (err) {
      logger.warn(`Could not fetch invites for guild ${guild.id}: ${err.message}`);
      client.inviteCache.set(guild.id, new Map());
    }
  }
}

async function reconcileDepartedMembers(guild) {
  try {
    const guildMembers = await guild.members.fetch();
    const currentIds   = [...guildMembers.keys()];
    const now = Math.floor(Date.now() / 1000);

    // Mark anyone still flagged present in the DB who is no longer in the guild.
    await pg.query(
      `UPDATE members
          SET left_at = $1
        WHERE left_at IS NULL
          AND discord_id <> ALL($2::text[])`,
      [now, currentIds],
    );

    logger.debug(`Reconciled departed members for guild ${guild.id}`);
  } catch (err) {
    logger.warn(`Could not reconcile departed members for guild ${guild.id}: ${err.message}`);
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`Bot ready: ${client.user.tag}`);

    try {
      await pg.ping();
      logger.info('Postgres (shared public data) connected');
    } catch (err) {
      logger.error(`Postgres unreachable at startup — member/project/event/announcement features will fail until it is back: ${err.message}`);
    }

    await cacheGuildInvites(client);

    // Rebuild the public ambassador/committee roster from current role membership.
    for (const guild of client.guilds.cache.values()) {
      await syncRoster(guild).catch((err) =>
        logger.warn(`Initial roster sync failed for guild ${guild.id}: ${err.message}`),
      );
    }

    eventScheduler.start(client);
    projectScheduler.start(client);
    backupScheduler.start(client);
  },
};
