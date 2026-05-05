const db = require('../database/db');

function getValues(guildId, key) {
  return db
    .prepare('SELECT value FROM config WHERE guild_id = ? AND key = ? ORDER BY added_at')
    .all(guildId, key)
    .map(r => r.value);
}

function addValue(guildId, key, value) {
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare('INSERT OR IGNORE INTO config (guild_id, key, value, added_at) VALUES (?, ?, ?, ?)')
    .run(guildId, key, String(value), now);
  return result.changes > 0;
}

function removeValue(guildId, key, value) {
  const result = db
    .prepare('DELETE FROM config WHERE guild_id = ? AND key = ? AND value = ?')
    .run(guildId, key, String(value));
  return result.changes > 0;
}

function getAllGrouped(guildId) {
  const rows = db
    .prepare('SELECT key, value FROM config WHERE guild_id = ? ORDER BY key, added_at')
    .all(guildId);
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.key]) grouped[row.key] = [];
    grouped[row.key].push(row.value);
  }
  return grouped;
}

module.exports = { getValues, addValue, removeValue, getAllGrouped };
