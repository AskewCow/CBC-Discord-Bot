const db = require('../database/db');   // SQLite — invites, invite_leaderboards
const pg = require('../database/pg');   // Postgres — members

// The invite tables live in SQLite; `members` lives in Postgres. The leaderboard
// queries used to be a single SQL join — now the two halves are fetched
// separately and joined in JS. Volumes are tiny (top 10 / one user).

/**
 * Top 10 inviters for a guild. Both scopes count only members still present
 * (left_at IS NULL); 'live' additionally restricts to members who joined at or
 * after startedAt (which the caller passes in milliseconds).
 */
async function getLeaderboard(guildId, scope, startedAt = null) {
  const params = [];
  let where = 'left_at IS NULL AND invite_code IS NOT NULL';
  if (scope === 'live' && startedAt !== null) {
    params.push(Math.floor(startedAt / 1000));
    where += ` AND joined_at >= $${params.length}`;
  }
  const presentCodes = await pg.all(`SELECT invite_code FROM members WHERE ${where}`, params);

  const codeToInviter = new Map();
  for (const inv of db.prepare('SELECT code, inviter_id FROM invites WHERE guild_id = ?').all(guildId)) {
    codeToInviter.set(inv.code, inv.inviter_id);
  }

  const tally = new Map();
  for (const { invite_code } of presentCodes) {
    const inviter = codeToInviter.get(invite_code);
    if (!inviter) continue;
    tally.set(inviter, (tally.get(inviter) ?? 0) + 1);
  }

  return [...tally.entries()]
    .map(([inviter_id, invite_count]) => ({ inviter_id, invite_count }))
    .sort((a, b) => b.invite_count - a.invite_count)
    .slice(0, 10);
}

/** Current active-invitee count for a single user (leavers excluded). */
async function getUserInviteCount(guildId, userId) {
  const codes = db
    .prepare('SELECT code FROM invites WHERE guild_id = ? AND inviter_id = ?')
    .all(guildId, userId)
    .map(r => r.code);
  if (!codes.length) return 0;

  const row = await pg.get(
    `SELECT count(*)::int AS cnt
       FROM members
      WHERE left_at IS NULL AND invite_code = ANY($1::text[])`,
    [codes],
  );
  return row?.cnt ?? 0;
}

// ── Invite row persistence (SQLite) ─────────────────────────────────────────

// Full-fetch reconcile (ready.js): keep the highest use count we've seen and
// fill in guild_id the first time we learn it.
const _syncFromFetch = db.prepare(`
  INSERT INTO invites (code, inviter_id, uses, guild_id, created_at)
  VALUES (@code, @inviterId, @uses, @guildId, @now)
  ON CONFLICT(code) DO UPDATE SET
    uses     = MAX(uses, excluded.uses),
    guild_id = CASE WHEN guild_id = '' THEN excluded.guild_id ELSE guild_id END
`);
function syncInviteFromFetch(code, inviterId, uses, guildId) {
  _syncFromFetch.run({ code, inviterId, uses, guildId, now: Date.now() });
}

// A brand-new invite was created (InviteCreate event) — store its exact state.
const _onCreated = db.prepare(`
  INSERT INTO invites (code, inviter_id, uses, guild_id, created_at)
  VALUES (@code, @inviterId, @uses, @guildId, @now)
  ON CONFLICT(code) DO UPDATE SET uses = excluded.uses
`);
function upsertInviteCreated(code, inviterId, uses, guildId) {
  _onCreated.run({ code, inviterId, uses, guildId, now: Date.now() });
}

// A member joined through this invite — increment the use counter.
const _bumpUse = db.prepare(`
  INSERT INTO invites (code, inviter_id, uses, guild_id, created_at)
  VALUES (@code, @inviterId, 1, @guildId, @now)
  ON CONFLICT(code) DO UPDATE SET uses = uses + 1, last_used_at = @now
`);
function bumpInviteUse(code, inviterId, guildId) {
  _bumpUse.run({ code, inviterId, guildId, now: Date.now() });
}

// Discord's invite collection → the in-memory { code: { uses, inviterId } } map
// the join handler diffs against. Invites without a known inviter are skipped.
function buildInviteMap(invites) {
  const map = new Map();
  for (const invite of invites.values()) {
    if (!invite.inviter) continue;
    map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter.id });
  }
  return map;
}

// ── Live leaderboard persistence (SQLite) ────────────────────────────────────

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
  syncInviteFromFetch,
  upsertInviteCreated,
  bumpInviteUse,
  buildInviteMap,
  createLeaderboard,
  deleteLeaderboard,
  getActiveLeaderboards,
};
