'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

const { runSchema } = require('../../src/database/schema');
const db = require('../../src/database/db');
const { getVoteCounts } = require('../../src/utils/projectHandlers');

before(() => {
  runSchema();
  runSchema();
});

const NOW = Math.floor(Date.now() / 1000);

function insertProject(overrides = {}) {
  const result = db.prepare(`
    INSERT INTO projects
      (name, description, builder_name, submitted_by, submitted_at, vote_ends_at, vote_closed)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    overrides.name        ?? 'Test Project',
    overrides.description ?? 'A description.',
    overrides.builder     ?? 'Builder',
    overrides.submitted_by ?? 'user1',
    overrides.submitted_at ?? NOW,
    overrides.vote_ends_at ?? (NOW + 86400 * 7),
  );
  return result.lastInsertRowid;
}

function castVote(projectId, discordId, vote) {
  db.prepare(`
    INSERT INTO project_votes (project_id, discord_id, vote, voted_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, discord_id) DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at
  `).run(projectId, discordId, vote, NOW);
}

describe('getVoteCounts', () => {
  test('returns 0,0 when no votes exist', () => {
    const pid = insertProject({ name: 'Empty Votes' });
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 0, downvotes: 0 });
  });

  test('counts upvotes correctly', () => {
    const pid = insertProject({ name: 'Upvote Project' });
    castVote(pid, 'voter_a', 'up');
    castVote(pid, 'voter_b', 'up');
    castVote(pid, 'voter_c', 'up');
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 3, downvotes: 0 });
  });

  test('counts downvotes correctly', () => {
    const pid = insertProject({ name: 'Downvote Project' });
    castVote(pid, 'voter_d', 'down');
    castVote(pid, 'voter_e', 'down');
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 0, downvotes: 2 });
  });

  test('counts mixed votes correctly', () => {
    const pid = insertProject({ name: 'Mixed Votes' });
    castVote(pid, 'voter_f', 'up');
    castVote(pid, 'voter_g', 'up');
    castVote(pid, 'voter_h', 'down');
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 2, downvotes: 1 });
  });

  test('changing vote from up to down updates correctly', () => {
    const pid = insertProject({ name: 'Vote Change Up-to-Down' });
    castVote(pid, 'changer', 'up');
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 1, downvotes: 0 });
    castVote(pid, 'changer', 'down'); // change vote
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 0, downvotes: 1 });
  });

  test('changing vote from down to up updates correctly', () => {
    const pid = insertProject({ name: 'Vote Change Down-to-Up' });
    castVote(pid, 'changer2', 'down');
    castVote(pid, 'changer2', 'up');
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 1, downvotes: 0 });
  });

  test('each user can only have one vote per project', () => {
    const pid = insertProject({ name: 'One Vote Per User' });
    castVote(pid, 'unique_voter', 'up');
    castVote(pid, 'unique_voter', 'up'); // same direction again
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 1, downvotes: 0 });
  });

  test('votes are scoped to project — other project votes not included', () => {
    const pid1 = insertProject({ name: 'Project A' });
    const pid2 = insertProject({ name: 'Project B' });
    castVote(pid1, 'pv_a1', 'up');
    castVote(pid1, 'pv_a2', 'up');
    castVote(pid2, 'pv_b1', 'down');
    // Project A should have 2 up, 0 down
    assert.deepEqual(getVoteCounts(Number(pid1)), { upvotes: 2, downvotes: 0 });
    // Project B should have 0 up, 1 down
    assert.deepEqual(getVoteCounts(Number(pid2)), { upvotes: 0, downvotes: 1 });
  });

  test('handles large vote counts', () => {
    const pid = insertProject({ name: 'High Volume Votes' });
    for (let i = 0; i < 50; i++) castVote(pid, `bulk_voter_${i}`, 'up');
    for (let i = 0; i < 20; i++) castVote(pid, `bulk_voter_dn_${i}`, 'down');
    assert.deepEqual(getVoteCounts(Number(pid)), { upvotes: 50, downvotes: 20 });
  });
});

describe('project vote schema edge cases', () => {
  test('vote CHECK constraint only allows up or down', () => {
    const pid = insertProject({ name: 'Invalid Vote Check' });
    assert.throws(() => {
      db.prepare(
        'INSERT INTO project_votes (project_id, discord_id, vote, voted_at) VALUES (?, ?, ?, ?)'
      ).run(Number(pid), 'bad_voter', 'sideways', NOW);
    }, /CHECK constraint/i);
  });

  test('project_votes primary key prevents duplicate direct inserts', () => {
    const pid = insertProject({ name: 'PK Constraint' });
    db.prepare(
      'INSERT INTO project_votes (project_id, discord_id, vote, voted_at) VALUES (?, ?, ?, ?)'
    ).run(Number(pid), 'pk_voter', 'up', NOW);
    assert.throws(() => {
      db.prepare(
        'INSERT INTO project_votes (project_id, discord_id, vote, voted_at) VALUES (?, ?, ?, ?)'
      ).run(Number(pid), 'pk_voter', 'down', NOW);
    }, /UNIQUE constraint/i);
  });
});
