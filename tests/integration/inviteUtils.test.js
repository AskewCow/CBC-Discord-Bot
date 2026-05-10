'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

const { runSchema } = require('../../src/database/schema');
const db = require('../../src/database/db');
const {
  getLeaderboard,
  getUserInviteCount,
  createLeaderboard,
  deleteLeaderboard,
  getActiveLeaderboards,
} = require('../../src/utils/inviteUtils');

before(() => {
  runSchema();
  runSchema(); // second pass adds left_at to members and guild_id to invites
});

const GUILD = 'guild_invite';
const NOW   = Math.floor(Date.now() / 1000);

function addInvite(code, inviterId) {
  db.prepare(`
    INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id)
    VALUES (?, ?, 0, ?, ?)
  `).run(code, inviterId, NOW, GUILD);
}

function addMember(discordId, username, inviteCode, leftAt = null, joinedAt = null) {
  db.prepare(`
    INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code, left_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(discordId, username, joinedAt ?? NOW, inviteCode, leftAt);
}

describe('getUserInviteCount', () => {
  test('returns 0 when user has no tracked invitees', () => {
    assert.equal(getUserInviteCount(GUILD, 'nobody'), 0);
  });

  test('counts active (non-departed) invitees', () => {
    addInvite('code_a', 'inviter_a');
    addMember('member_a1', 'Alice', 'code_a');
    addMember('member_a2', 'Bob',   'code_a');
    assert.equal(getUserInviteCount(GUILD, 'inviter_a'), 2);
  });

  test('excludes departed members (left_at set)', () => {
    addInvite('code_b', 'inviter_b');
    addMember('member_b1', 'Charlie', 'code_b');
    addMember('member_b2', 'Dave',    'code_b', NOW - 3600); // left
    assert.equal(getUserInviteCount(GUILD, 'inviter_b'), 1);
  });

  test('returns 0 after all invitees have departed', () => {
    addInvite('code_c', 'inviter_c');
    addMember('member_c1', 'Eve', 'code_c', NOW - 100); // left
    assert.equal(getUserInviteCount(GUILD, 'inviter_c'), 0);
  });

  test('is guild-scoped — another guild invite does not count', () => {
    const OTHER = 'guild_other';
    db.prepare(`INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id) VALUES (?, ?, 0, ?, ?)`)
      .run('code_other', 'inviter_a', NOW, OTHER);
    addMember('member_other', 'Frank', 'code_other');
    // inviter_a's count in GUILD should not include the OTHER guild invite
    const count = getUserInviteCount(GUILD, 'inviter_a');
    // still 2 from before, no extra from cross-guild
    assert.equal(count, 2);
  });
});

describe('getLeaderboard — all_time scope', () => {
  test('returns empty array when guild has no invites', () => {
    assert.deepEqual(getLeaderboard('guild_empty_lb'), []);
  });

  test('ranks inviters by active invite count descending', () => {
    const G = 'guild_lb_rank';
    // inviter_x → 3 members, inviter_y → 1 member
    db.prepare(`INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id) VALUES ('lbcx', 'inviter_x', 0, ?, ?)`).run(NOW, G);
    db.prepare(`INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id) VALUES ('lbcy', 'inviter_y', 0, ?, ?)`).run(NOW, G);
    ['lbm1','lbm2','lbm3'].forEach(id =>
      db.prepare(`INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code) VALUES (?, 'u', ?, 'lbcx')`).run(id, NOW)
    );
    db.prepare(`INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code) VALUES ('lbm4', 'u', ?, 'lbcy')`).run(NOW);

    const board = getLeaderboard(G, 'all_time');
    assert.equal(board[0].inviter_id, 'inviter_x');
    assert.equal(board[0].invite_count, 3);
    assert.equal(board[1].inviter_id, 'inviter_y');
    assert.equal(board[1].invite_count, 1);
  });

  test('excludes departed members', () => {
    const G = 'guild_lb_depart';
    db.prepare(`INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id) VALUES ('dpc', 'inviter_dp', 0, ?, ?)`).run(NOW, G);
    db.prepare(`INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code) VALUES ('dpm1', 'u', ?, 'dpc')`).run(NOW);
    db.prepare(`INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code, left_at) VALUES ('dpm2', 'u', ?, 'dpc', ?)`).run(NOW, NOW - 1);

    const board = getLeaderboard(G, 'all_time');
    assert.equal(board[0].invite_count, 1);
  });

  test('returns at most 10 entries', () => {
    const G = 'guild_lb_top10';
    for (let i = 0; i < 15; i++) {
      const code = `t10c${i}`, inv = `t10inv${i}`, mem = `t10m${i}`;
      db.prepare(`INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id) VALUES (?, ?, 0, ?, ?)`).run(code, inv, NOW, G);
      db.prepare(`INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code) VALUES (?, 'u', ?, ?)`).run(mem, NOW, code);
    }
    assert.ok(getLeaderboard(G, 'all_time').length <= 10);
  });
});

describe('getLeaderboard — live scope', () => {
  test('only counts joins after startedAt', () => {
    const G = 'guild_lb_live';
    const startedAt = NOW; // cutoff = now
    db.prepare(`INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id) VALUES ('lvc', 'inviter_live', 0, ?, ?)`).run(NOW, G);
    // Joined before cutoff
    db.prepare(`INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code) VALUES ('lvm_old', 'u', ?, 'lvc')`).run(NOW - 100);
    // Joined at or after cutoff
    db.prepare(`INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code) VALUES ('lvm_new', 'u', ?, 'lvc')`).run(NOW + 1);

    const board = getLeaderboard(G, 'live', startedAt);
    // Only the new member should count
    const entry = board.find(r => r.inviter_id === 'inviter_live');
    assert.ok(entry, 'inviter_live not in leaderboard');
    assert.equal(entry.invite_count, 1);
  });

  test('returns empty when no joins after startedAt', () => {
    const G = 'guild_lb_live_empty';
    db.prepare(`INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id) VALUES ('lve2', 'inv_le', 0, ?, ?)`).run(NOW, G);
    db.prepare(`INSERT OR IGNORE INTO members (discord_id, username, joined_at, invite_code) VALUES ('lvm_past', 'u', ?, 'lve2')`).run(NOW - 9999);
    // startedAt is now, so past join excluded
    assert.deepEqual(getLeaderboard(G, 'live', NOW), []);
  });
});

describe('leaderboard persistence', () => {
  const LB_GUILD = 'guild_lb_persist';

  test('createLeaderboard stores a record', () => {
    createLeaderboard({
      guildId:          LB_GUILD,
      channelId:        'ch_lb',
      messageId:        'msg_lb_1',
      scope:            'all_time',
      startedAt:        NOW,
      includeCommittee: true,
    });
    const boards = getActiveLeaderboards(LB_GUILD);
    assert.equal(boards.length, 1);
    assert.equal(boards[0].message_id, 'msg_lb_1');
    assert.equal(boards[0].scope, 'all_time');
    assert.equal(boards[0].include_committee, 1);
  });

  test('getActiveLeaderboards returns all boards for guild', () => {
    createLeaderboard({
      guildId:          LB_GUILD,
      channelId:        'ch_lb',
      messageId:        'msg_lb_2',
      scope:            'live',
      startedAt:        NOW,
      includeCommittee: false,
    });
    assert.equal(getActiveLeaderboards(LB_GUILD).length, 2);
  });

  test('deleteLeaderboard removes only the specified message', () => {
    deleteLeaderboard('msg_lb_1');
    const boards = getActiveLeaderboards(LB_GUILD);
    assert.equal(boards.length, 1);
    assert.equal(boards[0].message_id, 'msg_lb_2');
  });

  test('getActiveLeaderboards is scoped to guild', () => {
    createLeaderboard({
      guildId:          'other_guild_lb',
      channelId:        'ch_x',
      messageId:        'msg_x',
      scope:            'all_time',
      startedAt:        NOW,
      includeCommittee: true,
    });
    // LB_GUILD still has only 1 board (msg_lb_2)
    assert.equal(getActiveLeaderboards(LB_GUILD).length, 1);
  });
});
