const { Events } = require('discord.js');
const db             = require('../../database/db');
const logger         = require('../../utils/logger');
const eventScheduler = require('../../utils/eventScheduler');

const upsertInvite = db.prepare(`
  INSERT INTO invites (code, inviter_id, uses, guild_id, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(code) DO UPDATE SET
    uses     = MAX(uses, excluded.uses),
    guild_id = CASE WHEN guild_id = '' THEN excluded.guild_id ELSE guild_id END
`);

const markLeft    = db.prepare('UPDATE members SET left_at = ? WHERE discord_id = ?');
const getPresentMembers = db.prepare("SELECT discord_id FROM members WHERE left_at IS NULL");

async function cacheGuildInvites(client) {
  client.inviteCache = new Map();
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      const map = new Map();

      const syncMany = db.transaction((rows) => {
        for (const row of rows) upsertInvite.run(...row);
      });

      const rows = [];
      for (const invite of invites.values()) {
        if (!invite.inviter) continue;
        map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter.id });
        rows.push([invite.code, invite.inviter.id, invite.uses ?? 0, guild.id, Date.now()]);
      }

      syncMany(rows);
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
    const currentIds   = new Set(guildMembers.keys());
    const dbPresent    = getPresentMembers.all();

    const now = Date.now();
    const reconcile = db.transaction(() => {
      for (const { discord_id } of dbPresent) {
        if (!currentIds.has(discord_id)) markLeft.run(now, discord_id);
      }
    });
    reconcile();

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
    await cacheGuildInvites(client);
    eventScheduler.start(client);
  },
};
