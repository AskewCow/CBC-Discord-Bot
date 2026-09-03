// Rebuilds the public `roster` table (shared Postgres) from Discord role
// membership. The website reads it for the home-page sidebar
// (see the website repo's src/lib/queries.ts#getRoster).
//
// Members are identified by their *server display name* — nickname, falling
// back to global name, then username — because the club asks everyone to
// /nick to their real name.

const pg = require('../database/pg');
const cfg = require('./config');
const { CONFIG_KEYS } = require('../constants');
const logger = require('./logger');

// position → the config key holding that role's id(s). Order is precedence:
// a member holding several of these roles is listed under the first one only.
const POSITIONS = [
  ['ambassador', CONFIG_KEYS.AMBASSADOR_ROLE],
  ['committee', CONFIG_KEYS.COMMITTEE_ROLE],
];

/**
 * Recompute and persist the roster for one guild, then poke the website cache.
 * Safe to call often — it is a full delete-and-reinsert of a small table.
 *
 * @param {import('discord.js').Guild} guild
 */
async function syncRoster(guild) {
  if (!guild) return;

  const configured = POSITIONS.map(([position, key]) => [
    position,
    new Set(cfg.getValues(guild.id, key)),
  ]);
  const anyConfigured = configured.some(([, ids]) => ids.size > 0);

  // No roles configured → make sure the table has no stale rows and stop.
  if (!anyConfigured) {
    await pg
      .query('DELETE FROM roster WHERE guild_id = $1', [guild.id])
      .catch((err) =>
        logger.warn(`roster sync: could not clear guild ${guild.id}: ${err.message}`),
      );
    return;
  }

  let members;
  try {
    members = await guild.members.fetch();
  } catch (err) {
    logger.warn(`roster sync: could not fetch members for guild ${guild.id}: ${err.message}`);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const seen = new Set();
  const rows = [];

  for (const [position, roleIds] of configured) {
    if (roleIds.size === 0) continue;

    const matched = [...members.values()].filter(
      (m) => !m.user.bot && m.roles.cache.some((r) => roleIds.has(r.id)),
    );
    matched.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }),
    );

    let order = 0;
    for (const m of matched) {
      if (seen.has(m.id)) continue; // dual-role: first position wins
      seen.add(m.id);
      rows.push([guild.id, m.id, m.displayName, position, order++, now]);
    }
  }

  try {
    await pg.tx(async (client) => {
      await client.query('DELETE FROM roster WHERE guild_id = $1', [guild.id]);
      for (const r of rows) {
        await client.query(
          `INSERT INTO roster (guild_id, discord_id, display_name, position, sort_order, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          r,
        );
      }
    });
  } catch (err) {
    logger.error(`roster sync: Postgres write failed for guild ${guild.id}: ${err.message}`, err);
    return;
  }

  logger.debug(`roster sync: guild ${guild.id} → ${rows.length} member(s)`);

  // Lazy require avoids a load-order cycle (websiteRevalidate → logger → …).
  const { revalidateWebsite } = require('./websiteRevalidate');
  revalidateWebsite(['roster']).catch(() => {});
}

module.exports = { syncRoster };
