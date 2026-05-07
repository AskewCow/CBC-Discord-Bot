const db = require('../database/db');

/**
 * Returns top 10 inviters for a guild.
 *
 * scope 'all_time'  — sum of all invite uses ever recorded in the invites table
 * scope 'live'      — count members who joined after startedAt (via tracked invite codes)
 */
/**
 * Both scopes count only members still present (left_at IS NULL) so leavers
 * are automatically deducted. The difference is the time window:
 *   all_time — all tracked joins ever
 *   live     — only joins since startedAt
 */
function getLeaderboard(guildId, scope, startedAt = null) {
  if (scope === 'live' && startedAt !== null) {
    return db.prepare(`
      SELECT i.inviter_id, COUNT(*) AS invite_count
      FROM members m
      JOIN invites i ON m.invite_code = i.code
      WHERE i.guild_id = ? AND m.joined_at >= ? AND m.left_at IS NULL
      GROUP BY i.inviter_id
      ORDER BY invite_count DESC
      LIMIT 10
    `).all(guildId, startedAt);
  }

  return db.prepare(`
    SELECT i.inviter_id, COUNT(*) AS invite_count
    FROM members m
    JOIN invites i ON m.invite_code = i.code
    WHERE i.guild_id = ? AND m.left_at IS NULL
    GROUP BY i.inviter_id
    ORDER BY invite_count DESC
    LIMIT 10
  `).all(guildId);
}

/**
 * Returns the current invite count for a single user (leavers excluded).
 */
function getUserInviteCount(guildId, userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM members m
    JOIN invites i ON m.invite_code = i.code
    WHERE i.guild_id = ? AND i.inviter_id = ? AND m.left_at IS NULL
  `).get(guildId, userId);
  return row?.cnt ?? 0;
}

// ── Live leaderboard persistence ─────────────────────────────────────────────

function createLeaderboard({ guildId, channelId, messageId, scope, startedAt, includeCommittee }) {
  db.prepare(`
    INSERT INTO invite_leaderboards (guild_id, channel_id, message_id, scope, started_at, include_committee)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, channelId, messageId, scope, startedAt, includeCommittee ? 1 : 0);
}

function deleteLeaderboard(messageId) {
  db.prepare('DELETE FROM invite_leaderboards WHERE message_id = ?').run(messageId);
}

function getActiveLeaderboards(guildId) {
  return db.prepare('SELECT * FROM invite_leaderboards WHERE guild_id = ?').all(guildId);
}

module.exports = {
  getLeaderboard,
  getUserInviteCount,
  createLeaderboard,
  deleteLeaderboard,
  getActiveLeaderboards,
};
