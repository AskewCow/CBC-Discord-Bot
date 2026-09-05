// Per-guild settings for the scheduled data backup (see backupScheduler.js /
// backupUtils.js). Lives in the bot's own SQLite, same as `config` — this is
// operational settings, not shared "public subgraph" data.

const db = require('../database/db');
const { nowSec } = require('./time');

function getConfig(guildId) {
  const row = db.prepare('SELECT * FROM backup_config WHERE guild_id = ?').get(guildId);
  return row || { guild_id: guildId, enabled: 0, interval_days: 7, last_run_at: null };
}

function getAllEnabled() {
  return db.prepare('SELECT * FROM backup_config WHERE enabled = 1').all();
}

/**
 * @param {string} guildId
 * @param {{ enabled?: boolean, intervalDays?: number }} patch
 * @param {string} updatedBy Discord id of whoever ran the command
 */
function upsertConfig(guildId, patch, updatedBy) {
  const now = nowSec();
  const existing = db.prepare('SELECT guild_id FROM backup_config WHERE guild_id = ?').get(guildId);

  if (existing) {
    const sets = [];
    const params = [];
    if (patch.enabled !== undefined) {
      sets.push('enabled = ?');
      params.push(patch.enabled ? 1 : 0);
    }
    if (patch.intervalDays !== undefined) {
      sets.push('interval_days = ?');
      params.push(patch.intervalDays);
    }
    sets.push('updated_by = ?', 'updated_at = ?');
    params.push(updatedBy, now, guildId);
    db.prepare(`UPDATE backup_config SET ${sets.join(', ')} WHERE guild_id = ?`).run(...params);
  } else {
    db.prepare(
      `INSERT INTO backup_config (guild_id, enabled, interval_days, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(guildId, patch.enabled ? 1 : 0, patch.intervalDays ?? 7, updatedBy, now);
  }

  return getConfig(guildId);
}

function markRun(guildId, timestamp) {
  db.prepare('UPDATE backup_config SET last_run_at = ? WHERE guild_id = ?').run(timestamp, guildId);
}

module.exports = { getConfig, getAllEnabled, upsertConfig, markRun };
