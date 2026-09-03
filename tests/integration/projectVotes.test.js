'use strict';

const { pg, initSchema, resetTables, closePg } = require('../helpers/pgTest');

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const { getVoteCounts } = require('../../src/utils/projectHandlers');

before(initSchema);
beforeEach(resetTables);
after(closePg);

const NOW = Math.floor(Date.now() / 1000);

async function insertProject(overrides = {}) {
  const { rows: [row] } = await pg.query(
    `INSERT INTO projects
       (name, description, builder_name, submitted_by, submitted_at, vote_ends_at, vote_closed)
     VALUES ($1, $2, $3, $4, $5, $6, false)
     RETURNING id`,
    [
      overrides.name         ?? 'Test Project',
      overrides.description  ?? 'A description.',
      overrides.builder      ?? 'Builder',
      overrides.submitted_by ?? 'user1',
      overrides.submitted_at ?? NOW,
      overrides.vote_ends_at ?? (NOW + 86400 * 7),
    ],
  );
  return row.id;
}

async function castVote(projectId, discordId, vote) {
  await pg.query(
    `INSERT INTO project_votes (project_id, discord_id, vote, voted_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, discord_id) DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at`,
    [projectId, discordId, vote, NOW],
  );
}

describe('getVoteCounts', () => {
  test('returns 0,0 when no votes exist', async () => {
    const pid = await insertProject({ name: 'Empty Votes' });
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 0, downvotes: 0 });
  });

  test('counts upvotes correctly', async () => {
    const pid = await insertProject({ name: 'Upvote Project' });
    await castVote(pid, 'voter_a', 'up');
    await castVote(pid, 'voter_b', 'up');
    await castVote(pid, 'voter_c', 'up');
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 3, downvotes: 0 });
  });

  test('counts downvotes correctly', async () => {
    const pid = await insertProject({ name: 'Downvote Project' });
    await castVote(pid, 'voter_d', 'down');
    await castVote(pid, 'voter_e', 'down');
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 0, downvotes: 2 });
  });

  test('counts mixed votes correctly', async () => {
    const pid = await insertProject({ name: 'Mixed Votes' });
    await castVote(pid, 'voter_f', 'up');
    await castVote(pid, 'voter_g', 'up');
    await castVote(pid, 'voter_h', 'down');
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 2, downvotes: 1 });
  });

  test('changing vote from up to down updates correctly', async () => {
    const pid = await insertProject({ name: 'Vote Change Up-to-Down' });
    await castVote(pid, 'changer', 'up');
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 1, downvotes: 0 });
    await castVote(pid, 'changer', 'down'); // change vote
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 0, downvotes: 1 });
  });

  test('changing vote from down to up updates correctly', async () => {
    const pid = await insertProject({ name: 'Vote Change Down-to-Up' });
    await castVote(pid, 'changer2', 'down');
    await castVote(pid, 'changer2', 'up');
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 1, downvotes: 0 });
  });

  test('each user can only have one vote per project', async () => {
    const pid = await insertProject({ name: 'One Vote Per User' });
    await castVote(pid, 'unique_voter', 'up');
    await castVote(pid, 'unique_voter', 'up'); // same direction again
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 1, downvotes: 0 });
  });

  test('votes are scoped to project — other project votes not included', async () => {
    const pid1 = await insertProject({ name: 'Project A' });
    const pid2 = await insertProject({ name: 'Project B' });
    await castVote(pid1, 'pv_a1', 'up');
    await castVote(pid1, 'pv_a2', 'up');
    await castVote(pid2, 'pv_b1', 'down');
    assert.deepEqual(await getVoteCounts(pid1), { upvotes: 2, downvotes: 0 });
    assert.deepEqual(await getVoteCounts(pid2), { upvotes: 0, downvotes: 1 });
  });

  test('handles large vote counts', async () => {
    const pid = await insertProject({ name: 'High Volume Votes' });
    for (let i = 0; i < 50; i++) await castVote(pid, `bulk_voter_${i}`, 'up');
    for (let i = 0; i < 20; i++) await castVote(pid, `bulk_voter_dn_${i}`, 'down');
    assert.deepEqual(await getVoteCounts(pid), { upvotes: 50, downvotes: 20 });
  });
});

describe('project vote schema edge cases', () => {
  test('vote CHECK constraint only allows up or down', async () => {
    const pid = await insertProject({ name: 'Invalid Vote Check' });
    await assert.rejects(
      () => pg.query(
        'INSERT INTO project_votes (project_id, discord_id, vote, voted_at) VALUES ($1, $2, $3, $4)',
        [pid, 'bad_voter', 'sideways', NOW],
      ),
      /check constraint/i,
    );
  });

  test('project_votes primary key prevents duplicate direct inserts', async () => {
    const pid = await insertProject({ name: 'PK Constraint' });
    await pg.query(
      'INSERT INTO project_votes (project_id, discord_id, vote, voted_at) VALUES ($1, $2, $3, $4)',
      [pid, 'pk_voter', 'up', NOW],
    );
    await assert.rejects(
      () => pg.query(
        'INSERT INTO project_votes (project_id, discord_id, vote, voted_at) VALUES ($1, $2, $3, $4)',
        [pid, 'pk_voter', 'down', NOW],
      ),
      /duplicate key value/i,
    );
  });
});
