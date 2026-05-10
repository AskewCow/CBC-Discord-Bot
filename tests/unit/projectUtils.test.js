'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { buildProjectEmbed, buildVoteRow, BUILT_WITH_LABELS } = require('../../src/utils/projectUtils');

// Minimal project fixture
function makeProject(overrides = {}) {
  return {
    id:            1,
    name:          'Test Project',
    description:   'A cool project.',
    github_url:    null,
    submitted_by:  'user123',
    submitter_tag: 'TestUser',
    built_with:    null,
    thumbnail_url: null,
    vote_ends_at:  Math.floor(Date.now() / 1000) + 86400 * 7,
    vote_closed:   0,
    submitted_at:  Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe('buildProjectEmbed — public (default)', () => {
  test('uses project color 0xdd7659', () => {
    const data = buildProjectEmbed(makeProject()).toJSON();
    assert.equal(data.color, 0xdd7659);
  });

  test('title starts with rocket emoji', () => {
    const data = buildProjectEmbed(makeProject({ name: 'My App' })).toJSON();
    assert.ok(data.title.startsWith('🚀'));
    assert.ok(data.title.includes('My App'));
  });

  test('shows Builder field with @ prefix from submitter_tag', () => {
    const data = buildProjectEmbed(makeProject({ submitter_tag: 'alice' })).toJSON();
    const builder = data.fields.find(f => f.name === 'Builder');
    assert.ok(builder, 'Builder field missing');
    assert.equal(builder.value, '@alice');
  });

  test('falls back to mention when no submitter_tag', () => {
    const data = buildProjectEmbed(makeProject({ submitter_tag: null, submitted_by: 'uid999' })).toJSON();
    const builder = data.fields.find(f => f.name === 'Builder');
    assert.equal(builder.value, '<@uid999>');
  });

  test('shows GitHub field when github_url set', () => {
    const data = buildProjectEmbed(makeProject({ github_url: 'https://github.com/foo/bar' })).toJSON();
    const gh = data.fields.find(f => f.name === 'GitHub');
    assert.ok(gh, 'GitHub field missing');
    assert.ok(gh.value.includes('https://github.com/foo/bar'));
  });

  test('omits GitHub field when github_url is null', () => {
    const data = buildProjectEmbed(makeProject({ github_url: null })).toJSON();
    assert.ok(!data.fields.find(f => f.name === 'GitHub'));
  });

  test('omits Built With field when built_with is null', () => {
    const data = buildProjectEmbed(makeProject({ built_with: null })).toJSON();
    assert.ok(!data.fields.find(f => f.name === 'Built With'));
  });

  test('omits Built With field when built_with is "none"', () => {
    const data = buildProjectEmbed(makeProject({ built_with: 'none' })).toJSON();
    assert.ok(!data.fields.find(f => f.name === 'Built With'));
  });

  test('shows Built With = "Claude Code" for claude_code', () => {
    const data = buildProjectEmbed(makeProject({ built_with: 'claude_code' })).toJSON();
    const bw = data.fields.find(f => f.name === 'Built With');
    assert.ok(bw, 'Built With field missing');
    assert.equal(bw.value, 'Claude Code');
  });

  test('shows Built With = "Claude Web" for claude_web', () => {
    const data = buildProjectEmbed(makeProject({ built_with: 'claude_web' })).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Built With').value, 'Claude Web');
  });

  test('shows Built With = "Other" for other', () => {
    const data = buildProjectEmbed(makeProject({ built_with: 'other' })).toJSON();
    assert.equal(data.fields.find(f => f.name === 'Built With').value, 'Other');
  });

  test('sets image when thumbnail_url provided', () => {
    const data = buildProjectEmbed(makeProject({ thumbnail_url: 'https://example.com/img.png' })).toJSON();
    assert.equal(data.image?.url, 'https://example.com/img.png');
  });

  test('omits image when thumbnail_url is null', () => {
    const data = buildProjectEmbed(makeProject({ thumbnail_url: null })).toJSON();
    assert.ok(!data.image);
  });

  test('does not show vote fields when forReview is false (default)', () => {
    const data = buildProjectEmbed(makeProject()).toJSON();
    assert.ok(!data.fields.find(f => f.name === 'Vote Ends'));
    assert.ok(!data.fields.find(f => f.name === 'Current Votes'));
  });
});

describe('buildProjectEmbed — forReview (voting open)', () => {
  const counts = { upvotes: 3, downvotes: 1 };

  test('still uses project color', () => {
    const data = buildProjectEmbed(makeProject(), { forReview: true, counts }).toJSON();
    assert.equal(data.color, 0xdd7659);
  });

  test('shows Vote Ends and Current Votes fields', () => {
    const data = buildProjectEmbed(makeProject(), { forReview: true, counts }).toJSON();
    assert.ok(data.fields.find(f => f.name === 'Vote Ends'), 'Vote Ends field missing');
    assert.ok(data.fields.find(f => f.name === 'Current Votes'), 'Current Votes field missing');
  });

  test('Current Votes shows both counts', () => {
    const data = buildProjectEmbed(makeProject(), { forReview: true, counts: { upvotes: 5, downvotes: 2 } }).toJSON();
    const cv = data.fields.find(f => f.name === 'Current Votes');
    assert.ok(cv.value.includes('5'));
    assert.ok(cv.value.includes('2'));
  });

  test('defaults counts to 0 when counts not provided', () => {
    const data = buildProjectEmbed(makeProject(), { forReview: true }).toJSON();
    const cv = data.fields.find(f => f.name === 'Current Votes');
    assert.ok(cv.value.includes('0'));
  });
});

describe('buildProjectEmbed — voteClosed', () => {
  test('title starts with flag emoji when vote closed', () => {
    const data = buildProjectEmbed(makeProject(), { voteClosed: true, counts: { upvotes: 5, downvotes: 1 } }).toJSON();
    assert.ok(data.title.startsWith('🏁'));
  });

  test('green color when upvotes > downvotes', () => {
    const data = buildProjectEmbed(makeProject(), { voteClosed: true, counts: { upvotes: 5, downvotes: 1 } }).toJSON();
    assert.equal(data.color, 0x57f287);
  });

  test('grey color when downvotes > upvotes', () => {
    const data = buildProjectEmbed(makeProject(), { voteClosed: true, counts: { upvotes: 1, downvotes: 5 } }).toJSON();
    assert.equal(data.color, 0x99aab5);
  });

  test('grey color on a tie', () => {
    const data = buildProjectEmbed(makeProject(), { voteClosed: true, counts: { upvotes: 3, downvotes: 3 } }).toJSON();
    assert.equal(data.color, 0x99aab5);
  });

  test('grey color on 0-0 tie', () => {
    const data = buildProjectEmbed(makeProject(), { voteClosed: true, counts: { upvotes: 0, downvotes: 0 } }).toJSON();
    assert.equal(data.color, 0x99aab5);
  });

  test('shows Final Vote and Vote Closed fields', () => {
    const data = buildProjectEmbed(makeProject(), { voteClosed: true, counts: { upvotes: 2, downvotes: 1 } }).toJSON();
    assert.ok(data.fields.find(f => f.name === 'Final Vote'), 'Final Vote field missing');
    assert.ok(data.fields.find(f => f.name === 'Vote Closed'), 'Vote Closed field missing');
  });

  test('Final Vote shows correct counts', () => {
    const data = buildProjectEmbed(makeProject(), { voteClosed: true, counts: { upvotes: 8, downvotes: 2 } }).toJSON();
    const fv = data.fields.find(f => f.name === 'Final Vote');
    assert.ok(fv.value.includes('8'));
    assert.ok(fv.value.includes('2'));
  });

  test('does not show Vote Ends when vote closed', () => {
    const data = buildProjectEmbed(makeProject(), { voteClosed: true, counts: { upvotes: 1, downvotes: 0 } }).toJSON();
    assert.ok(!data.fields.find(f => f.name === 'Vote Ends'));
  });
});

describe('buildVoteRow', () => {
  test('enabled row has unlabelled Feature It and Pass buttons', () => {
    const row = buildVoteRow(42).toJSON();
    const [up, down] = row.components;
    assert.equal(up.label, 'Feature It');
    assert.equal(down.label, 'Pass');
    assert.equal(up.disabled, false);
    assert.equal(down.disabled, false);
  });

  test('custom IDs contain project ID and direction', () => {
    const row = buildVoteRow(99).toJSON();
    const [up, down] = row.components;
    assert.ok(up.custom_id.includes('99'));
    assert.ok(up.custom_id.includes('up'));
    assert.ok(down.custom_id.includes('99'));
    assert.ok(down.custom_id.includes('down'));
  });

  test('disabled row shows vote counts in labels', () => {
    const row = buildVoteRow(1, { disabled: true, upvotes: 7, downvotes: 3 }).toJSON();
    const [up, down] = row.components;
    assert.ok(up.label.includes('7'));
    assert.ok(down.label.includes('3'));
    assert.equal(up.disabled, true);
    assert.equal(down.disabled, true);
  });

  test('disabled row defaults counts to 0 when not provided', () => {
    const row = buildVoteRow(1, { disabled: true }).toJSON();
    const [up, down] = row.components;
    assert.ok(up.label.includes('0'));
    assert.ok(down.label.includes('0'));
  });
});

describe('BUILT_WITH_LABELS', () => {
  test('has entries for all three options', () => {
    assert.equal(BUILT_WITH_LABELS.claude_code, 'Claude Code');
    assert.equal(BUILT_WITH_LABELS.claude_web, 'Claude Web');
    assert.equal(BUILT_WITH_LABELS.other, 'Other');
  });
});
