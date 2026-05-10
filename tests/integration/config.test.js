'use strict';

// Must be set before any module that requires db
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

const { runSchema } = require('../../src/database/schema');
const config = require('../../src/utils/config');

before(() => {
  runSchema(); // creates tables (no existing tables → migrations are no-ops)
  runSchema(); // second pass: migrations add missing columns to fresh tables
});

const G1 = 'guild_test_1';
const G2 = 'guild_test_2';

describe('config.addValue', () => {
  test('returns true on successful insert', () => {
    assert.equal(config.addValue(G1, 'mod_log_channel', 'ch001'), true);
  });

  test('returns false on duplicate (same guild, key, value)', () => {
    config.addValue(G1, 'mod_log_channel', 'ch_dup');
    assert.equal(config.addValue(G1, 'mod_log_channel', 'ch_dup'), false);
  });

  test('allows same value under a different key', () => {
    assert.equal(config.addValue(G1, 'announcements_channel', 'ch001'), true);
  });

  test('allows same key+value in a different guild', () => {
    assert.equal(config.addValue(G2, 'mod_log_channel', 'ch001'), true);
  });

  test('coerces non-string values to string', () => {
    config.addValue(G1, 'admin_role', 12345);
    const vals = config.getValues(G1, 'admin_role');
    assert.ok(vals.includes('12345'));
  });
});

describe('config.getValues', () => {
  test('returns empty array when key not configured', () => {
    assert.deepEqual(config.getValues('guild_never_seen', 'mod_log_channel'), []);
  });

  test('returns the values that were added', () => {
    config.addValue(G1, 'events_channel', 'ev_ch_1');
    const vals = config.getValues(G1, 'events_channel');
    assert.ok(vals.includes('ev_ch_1'));
  });

  test('returns multiple values for the same key', () => {
    config.addValue(G1, 'member_role', 'role_a');
    config.addValue(G1, 'member_role', 'role_b');
    const vals = config.getValues(G1, 'member_role');
    assert.ok(vals.includes('role_a'));
    assert.ok(vals.includes('role_b'));
  });

  test('is scoped to guild — other guild values not returned', () => {
    config.addValue(G2, 'events_channel', 'ev_ch_g2');
    const g1Vals = config.getValues(G1, 'events_channel');
    assert.ok(!g1Vals.includes('ev_ch_g2'));
  });
});

describe('config.removeValue', () => {
  test('returns true when value removed successfully', () => {
    config.addValue(G1, 'general_channel', 'gc_remove_me');
    assert.equal(config.removeValue(G1, 'general_channel', 'gc_remove_me'), true);
  });

  test('returns false when value does not exist', () => {
    assert.equal(config.removeValue(G1, 'general_channel', 'nonexistent_ch'), false);
  });

  test('value is no longer returned after removal', () => {
    config.addValue(G1, 'ticket_channel', 'tc_gone');
    config.removeValue(G1, 'ticket_channel', 'tc_gone');
    assert.ok(!config.getValues(G1, 'ticket_channel').includes('tc_gone'));
  });

  test('only removes the specified value, leaving others intact', () => {
    config.addValue(G1, 'committee_role', 'keep_role');
    config.addValue(G1, 'committee_role', 'delete_role');
    config.removeValue(G1, 'committee_role', 'delete_role');
    const vals = config.getValues(G1, 'committee_role');
    assert.ok(vals.includes('keep_role'));
    assert.ok(!vals.includes('delete_role'));
  });
});

describe('config.getAllGrouped', () => {
  const GG = 'guild_grouped';

  test('returns empty object when guild has no config', () => {
    assert.deepEqual(config.getAllGrouped('guild_empty_never'), {});
  });

  test('groups values by key correctly', () => {
    config.addValue(GG, 'mod_log_channel', 'mlc1');
    config.addValue(GG, 'mod_log_channel', 'mlc2');
    config.addValue(GG, 'admin_role', 'ar1');

    const grouped = config.getAllGrouped(GG);
    assert.deepEqual(grouped.mod_log_channel.sort(), ['mlc1', 'mlc2']);
    assert.deepEqual(grouped.admin_role, ['ar1']);
  });

  test('does not bleed other guilds into the result', () => {
    config.addValue('guild_bleed', 'mod_log_channel', 'bleed_ch');
    const grouped = config.getAllGrouped(GG);
    assert.ok(!Object.values(grouped).flat().includes('bleed_ch'));
  });
});
