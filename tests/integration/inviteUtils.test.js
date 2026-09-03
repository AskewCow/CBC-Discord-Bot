'use strict';

// members lives in Postgres; invites / invite_leaderboards stay in SQLite.
const { pg, initSchema, resetTables, closePg } = require('../helpers/pgTest');

const { describe, test, before, after } = require('node:test');
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

before(async () => {
  await initSchema();
  await resetTables();
  runSchema();
  db.exec('DELETE FROM invites; DELETE FROM invite_leaderboards;');
});
after(closePg);

const GUILD = 'guild_invite';
const NOW   = Math.floor(Date.now() / 1000);

function addInvite(code, inviterId, guildId = GUILD) {
  db.prepare(`
    INSERT OR IGNORE INTO invites (code, inviter_id, uses, created_at, guild_id)
    VALUES (?, ?, 0, ?, ?)
  `).run(code, inviterId, NOW, guildId);
}

async function addMember(discordId, username, inviteCode, leftAt = null, joinedAt = null) {
  await pg.query(
    `INSERT INTO members (discord_id, username, joined_at, invite_code, left_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (discord_id) DO NOTHING`,
    [discordId, username, joinedAt ?? NOW, inviteCode, leftAt],
  );
}

describe('getUserInviteCount', () => {
  test('returns 0 when user has no tracked invitees', async () => {
    assert.equal(await getUserInviteCount(GUILD, 'nobody'), 0);
  });

  test('counts active (non-departed) invitees', async () => {
    addInvite('code_a', 'inviter_a');
    await addMember('member_a1', 'Alice', 'code_a');
    await addMember('member_a2', 'Bob',   'code_a');
    assert.equal(await getUserInviteCount(GUILD, 'inviter_a'), 2);
  });

  test('excludes departed members (left_at set)', async () => {
    addInvite('code_b', 'inviter_b');
    await addMember('member_b1', 'Charlie', 'code_b');
    await addMember('member_b2', 'Dave',    'code_b', NOW - 3600); // left
    assert.equal(await getUserInviteCount(GUILD, 'inviter_b'), 1);
  });

  test('returns 0 after all invitees have departed', async () => {
    addInvite('code_c', 'inviter_c');
    await addMember('member_c1', 'Eve', 'code_c', NOW - 100); // left
    assert.equal(await getUserInviteCount(GUILD, 'inviter_c'), 0);
  });

  test('is guild-scoped — another guild invite does not count', async () => {
    addInvite('gs_home', 'inviter_gs', GUILD);
    addInvite('gs_other', 'inviter_gs', 'guild_other');
    await addMember('gs_m1', 'One', 'gs_home');
    await addMember('gs_m2', 'Two', 'gs_home');
    await addMember('gs_m3', 'Three', 'gs_other');
    assert.equal(await getUserInviteCount(GUILD, 'inviter_gs'), 2);
  });
});

describe('getLeaderboard — all_time scope', () => {
  test('returns empty array when guild has no invites', async () => {
    assert.deepEqual(await getLeaderboard('guild_empty_lb'), []);
  });

  test('ranks inviters by active invite count descending', async () => {
    const G = 'guild_lb_rank';
    addInvite('lbcx', 'inviter_x', G);
    addInvite('lbcy', 'inviter_y', G);
    await addMember('lbm1', 'u', 'lbcx');
    await addMember('lbm2', 'u', 'lbcx');
    await addMember('lbm3', 'u', 'lbcx');
    await addMember('lbm4', 'u', 'lbcy');

    const board = await getLeaderboard(G, 'all_time');
    assert.equal(board[0].inviter_id, 'inviter_x');
    assert.equal(board[0].invite_count, 3);
    assert.equal(board[1].inviter_id, 'inviter_y');
    assert.equal(board[1].invite_count, 1);
  });

  test('excludes departed members', async () => {
    const G = 'guild_lb_depart';
    addInvite('dpc', 'inviter_dp', G);
    await addMember('dpm1', 'u', 'dpc');
    await addMember('dpm2', 'u', 'dpc', NOW - 1);

    const board = await getLeaderboard(G, 'all_time');
    assert.equal(board[0].invite_count, 1);
  });

  test('returns at most 10 entries', async () => {
    const G = 'guild_lb_top10';
    for (let i = 0; i < 15; i++) {
      addInvite(`t10c${i}`, `t10inv${i}`, G);
      await addMember(`t10m${i}`, 'u', `t10c${i}`);
    }
    assert.ok((await getLeaderboard(G, 'all_time')).length <= 10);
  });
});

describe('getLeaderboard — live scope', () => {
  test('only counts joins after startedAt', async () => {
    const G = 'guild_lb_live';
    const startedAtMs = NOW * 1000; // caller passes milliseconds
    addInvite('lvc', 'inviter_live', G);
    await addMember('lvm_old', 'u', 'lvc', null, NOW - 100);
    await addMember('lvm_new', 'u', 'lvc', null, NOW + 1);

    const board = await getLeaderboard(G, 'live', startedAtMs);
    const entry = board.find(r => r.inviter_id === 'inviter_live');
    assert.ok(entry, 'inviter_live not in leaderboard');
    assert.equal(entry.invite_count, 1);
  });

  test('returns empty when no joins after startedAt', async () => {
    const G = 'guild_lb_live_empty';
    addInvite('lve2', 'inv_le', G);
    await addMember('lvm_past', 'u', 'lve2', null, NOW - 9999);
    assert.deepEqual(await getLeaderboard(G, 'live', NOW * 1000), []);
  });
});

describe('leaderboard persistence', () => {
  const LB_GUILD = 'guild_lb_persist';

  test('createLeaderboard stores a record', () => {
    createLeaderboard({
      guildId: LB_GUILD, channelId: 'ch_lb', messageId: 'msg_lb_1',
      scope: 'all_time', startedAt: NOW, includeCommittee: true,
    });
    const boards = getActiveLeaderboards(LB_GUILD);
    assert.equal(boards.length, 1);
    assert.equal(boards[0].message_id, 'msg_lb_1');
    assert.equal(boards[0].scope, 'all_time');
    assert.equal(boards[0].include_committee, 1);
  });

  test('getActiveLeaderboards returns all boards for guild', () => {
    createLeaderboard({
      guildId: LB_GUILD, channelId: 'ch_lb', messageId: 'msg_lb_2',
      scope: 'live', startedAt: NOW, includeCommittee: false,
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
      guildId: 'other_guild_lb', channelId: 'ch_x', messageId: 'msg_x',
      scope: 'all_time', startedAt: NOW, includeCommittee: true,
    });
    assert.equal(getActiveLeaderboards(LB_GUILD).length, 1);
  });
});
