const { Events } = require('discord.js');
const { nowSec } = require('../../utils/time');
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

      await reconcileMembers(guild);
    } catch (err) {
      logger.warn(`Could not fetch invites for guild ${guild.id}: ${err.message}`);
      client.inviteCache.set(guild.id, new Map());
    }
  }
}

async function reconcileMembers(guild) {
  try {
    const guildMembers = await guild.members.fetch();
    const humans = [...guildMembers.values()].filter((m) => !m.user.bot);
    const now = nowSec();

    // Backfill / refresh a row for everyone currently in the guild. This is what
    // seeds members who were already present before the bot started tracking,
    // and self-heals any join missed while the bot was offline. Existing rows
    // keep their original joined_at + invite_code; a rejoin clears left_at.
    await pg.tx(async (client) => {
      for (const m of humans) {
        const joinedAt = m.joinedTimestamp
          ? Math.floor(m.joinedTimestamp / 1000)
          : now;
        await client.query(
          `INSERT INTO members (discord_id, username, joined_at, left_at)
           VALUES ($1, $2, $3, NULL)
           ON CONFLICT (discord_id) DO UPDATE SET
             username = excluded.username,
             left_at  = NULL`,
          [m.id, m.user.tag, joinedAt],
        );
      }
    });

    // Mark anyone still flagged present in the DB who is no longer in the guild.
    const currentIds = humans.map((m) => m.id);
    if (currentIds.length) {
      await pg.query(
        `UPDATE members
            SET left_at = $1
          WHERE left_at IS NULL
            AND discord_id <> ALL($2::text[])`,
        [now, currentIds],
      );
    }

    logger.info(`Reconciled ${currentIds.length} members for guild ${guild.id}`);
  } catch (err) {
    logger.warn(`Could not reconcile members for guild ${guild.id}: ${err.message}`);
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

    // Periodic safety net: gateway member events are reliable while connected,
    // but a long-lived process that dropped an event between reconnects would
    // otherwise drift. Re-reconcile every 6h. (Restarts already reconcile above.)
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        reconcileMembers(guild).catch(() => {});
      }
    }, SIX_HOURS).unref();
  },
};
