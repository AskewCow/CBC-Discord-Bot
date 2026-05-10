'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

const { runSchema } = require('../../src/database/schema');
const ob = require('../../src/utils/onboarding');

before(() => {
  runSchema();
  runSchema();
});

const GUILD   = 'guild_ob';
const CREATOR = 'admin_user';

describe('flow CRUD', () => {
  test('getFlow returns undefined for unknown guild', () => {
    assert.equal(ob.getFlow('guild_never'), undefined);
  });

  test('upsertWelcomeFlow creates a flow with flow_type=welcome', () => {
    const flow = ob.upsertWelcomeFlow(GUILD, 'Welcome to the server!', CREATOR);
    assert.ok(flow);
    assert.equal(flow.flow_type, 'welcome');
    assert.equal(flow.welcome_msg, 'Welcome to the server!');
    assert.equal(flow.guild_id, GUILD);
  });

  test('upsertWelcomeFlow updates existing flow if called again', () => {
    ob.upsertWelcomeFlow(GUILD, 'Updated welcome!', CREATOR);
    const flow = ob.getFlow(GUILD);
    assert.equal(flow.welcome_msg, 'Updated welcome!');
    assert.equal(flow.flow_type, 'welcome');
  });

  test('setWelcomeMsg updates only welcome_msg, not flow_type', () => {
    // First set to questions type
    ob.upsertQuestionsFlow(GUILD, CREATOR);
    ob.setWelcomeMsg(GUILD, 'A new welcome!', CREATOR);
    const flow = ob.getFlow(GUILD);
    assert.equal(flow.welcome_msg, 'A new welcome!');
    assert.equal(flow.flow_type, 'questions');
  });

  test('setWelcomeMsg creates new flow when none exists', () => {
    const G2 = 'guild_ob_2';
    assert.equal(ob.getFlow(G2), undefined);
    ob.setWelcomeMsg(G2, 'Hello from scratch!', CREATOR);
    const flow = ob.getFlow(G2);
    assert.ok(flow);
    assert.equal(flow.welcome_msg, 'Hello from scratch!');
  });

  test('upsertQuestionsFlow sets flow_type=questions and preserves welcome_msg', () => {
    const G3 = 'guild_ob_3';
    ob.upsertWelcomeFlow(G3, 'Keep me!', CREATOR);
    ob.upsertQuestionsFlow(G3, CREATOR);
    const flow = ob.getFlow(G3);
    assert.equal(flow.flow_type, 'questions');
    assert.equal(flow.welcome_msg, 'Keep me!');
  });

  test('upsertQuestionsFlow creates new flow with no welcome_msg', () => {
    const G4 = 'guild_ob_4';
    ob.upsertQuestionsFlow(G4, CREATOR);
    const flow = ob.getFlow(G4);
    assert.equal(flow.flow_type, 'questions');
    assert.equal(flow.welcome_msg, null);
  });

  test('deleteFlow removes the flow', () => {
    const G5 = 'guild_ob_5';
    ob.upsertWelcomeFlow(G5, 'Bye!', CREATOR);
    assert.ok(ob.getFlow(G5));
    ob.deleteFlow(G5);
    assert.equal(ob.getFlow(G5), undefined);
  });
});

describe('step management', () => {
  const STEP_GUILD = 'guild_ob_steps';
  let flowId;

  before(() => {
    const flow = ob.upsertQuestionsFlow(STEP_GUILD, CREATOR);
    flowId = flow.id;
  });

  test('getSteps returns empty array when no steps', () => {
    assert.deepEqual(ob.getSteps(flowId), []);
  });

  test('addStep returns new step ID', () => {
    const id = ob.addStep(flowId, 'text', 'What is your name?', null, null);
    assert.ok(typeof id === 'number' || typeof id === 'bigint');
  });

  test('first step gets step_order 0', () => {
    const G = 'guild_step_order';
    const f = ob.upsertQuestionsFlow(G, CREATOR);
    ob.addStep(f.id, 'text', 'Q1', null, null);
    const steps = ob.getSteps(f.id);
    assert.equal(steps[0].step_order, 0);
  });

  test('second step gets step_order 1', () => {
    const G = 'guild_step_order2';
    const f = ob.upsertQuestionsFlow(G, CREATOR);
    ob.addStep(f.id, 'text', 'Q1', null, null);
    ob.addStep(f.id, 'yes_no', 'Agree?', 'Great!', 'OK.');
    const steps = ob.getSteps(f.id);
    assert.equal(steps[1].step_order, 1);
  });

  test('addStep stores yes_no content correctly', () => {
    const G = 'guild_step_yn';
    const f = ob.upsertQuestionsFlow(G, CREATOR);
    const id = ob.addStep(f.id, 'yes_no', 'Do you agree?', 'Glad to hear!', 'No worries.');
    const step = ob.getStep(Number(id));
    assert.equal(step.step_type, 'yes_no');
    assert.equal(step.content, 'Do you agree?');
    assert.equal(step.yes_content, 'Glad to hear!');
    assert.equal(step.no_content, 'No worries.');
  });

  test('addStep stores null for omitted yes/no content', () => {
    const G = 'guild_step_null';
    const f = ob.upsertQuestionsFlow(G, CREATOR);
    const id = ob.addStep(f.id, 'text', 'Just a question', '', '');
    const step = ob.getStep(Number(id));
    assert.equal(step.yes_content, null);
    assert.equal(step.no_content, null);
  });

  test('removeStep deletes the step by ID', () => {
    const G = 'guild_step_remove';
    const f = ob.upsertQuestionsFlow(G, CREATOR);
    const id = ob.addStep(f.id, 'text', 'Delete me', null, null);
    ob.removeStep(Number(id));
    assert.equal(ob.getStep(Number(id)), undefined);
  });

  test('clearSteps removes all steps for the flow', () => {
    const G = 'guild_step_clear';
    const f = ob.upsertQuestionsFlow(G, CREATOR);
    ob.addStep(f.id, 'text', 'Q1', null, null);
    ob.addStep(f.id, 'text', 'Q2', null, null);
    ob.clearSteps(f.id);
    assert.deepEqual(ob.getSteps(f.id), []);
  });

  test('clearSteps only clears steps for the given flow, not others', () => {
    const GA = 'guild_step_clear_a';
    const GB = 'guild_step_clear_b';
    const fa = ob.upsertQuestionsFlow(GA, CREATOR);
    const fb = ob.upsertQuestionsFlow(GB, CREATOR);
    ob.addStep(fa.id, 'text', 'QA', null, null);
    ob.addStep(fb.id, 'text', 'QB', null, null);
    ob.clearSteps(fa.id);
    assert.deepEqual(ob.getSteps(fa.id), []);
    assert.equal(ob.getSteps(fb.id).length, 1);
  });
});

describe('session management', () => {
  const SG    = 'guild_ob_sess';
  const USER1 = 'user_sess_1';
  const USER2 = 'user_sess_2';
  let flowId;

  before(() => {
    const flow = ob.upsertQuestionsFlow(SG, CREATOR);
    flowId = flow.id;
  });

  test('getSession returns undefined when no session', () => {
    assert.equal(ob.getSession('no_such_user', SG), undefined);
  });

  test('createSession creates an in_progress session', () => {
    const sess = ob.createSession(USER1, SG, flowId);
    assert.ok(sess);
    assert.equal(sess.status, 'in_progress');
    assert.equal(sess.current_step, 0);
    assert.equal(JSON.parse(sess.answers).length, 0);
  });

  test('getSession retrieves the session', () => {
    const sess = ob.getSession(USER1, SG);
    assert.ok(sess);
    assert.equal(sess.discord_id, USER1);
    assert.equal(sess.guild_id, SG);
  });

  test('createSession replaces an existing session for same user+guild', () => {
    ob.createSession(USER1, SG, flowId); // second create
    const sessions = require('../../src/database/db')
      .prepare("SELECT COUNT(*) AS cnt FROM onboarding_sessions WHERE discord_id = ? AND guild_id = ?")
      .get(USER1, SG);
    assert.equal(sessions.cnt, 1); // REPLACE → still just one row
  });

  test('getActiveSessionByUser returns in_progress session', () => {
    const sess = ob.getActiveSessionByUser(USER1);
    assert.ok(sess);
    assert.equal(sess.status, 'in_progress');
  });

  test('updateSessionStep advances current_step', () => {
    const sess = ob.getSession(USER1, SG);
    ob.updateSessionStep(sess.id, 2);
    const updated = ob.getSession(USER1, SG);
    assert.equal(updated.current_step, 2);
  });

  test('appendAnswer accumulates JSON array', () => {
    const sess = ob.getSession(USER1, SG);
    ob.appendAnswer(sess.id, 10, 'What is your name?', 'Alice');
    ob.appendAnswer(sess.id, 11, 'What is your role?', 'Engineer');
    const updated = ob.getSession(USER1, SG);
    const answers = JSON.parse(updated.answers);
    assert.equal(answers.length, 2);
    assert.equal(answers[0].answer, 'Alice');
    assert.equal(answers[1].answer, 'Engineer');
    assert.equal(answers[0].question, 'What is your name?');
  });

  test('completeSession sets status=complete and completed_at', () => {
    const sess = ob.getSession(USER1, SG);
    ob.completeSession(sess.id);
    const updated = ob.getSession(USER1, SG);
    assert.equal(updated.status, 'complete');
    assert.ok(updated.completed_at > 0);
  });

  test('getActiveSessionByUser returns null for completed session', () => {
    const active = ob.getActiveSessionByUser(USER1);
    assert.equal(active, undefined);
  });

  test('abandonSession sets status=abandoned', () => {
    // Create fresh session for USER2
    ob.createSession(USER2, SG, flowId);
    const sess = ob.getSession(USER2, SG);
    ob.abandonSession(sess.id);
    const updated = ob.getSession(USER2, SG);
    assert.equal(updated.status, 'abandoned');
  });
});

describe('buildYesNoRow / buildDisabledYesNoRow', () => {
  test('buildYesNoRow has two buttons', () => {
    const row = ob.buildYesNoRow('uid', 'gid', 5).toJSON();
    assert.equal(row.components.length, 2);
  });

  test('buildYesNoRow custom IDs embed discord_id, guild_id, and step_id', () => {
    const row = ob.buildYesNoRow('user99', 'guild99', 7).toJSON();
    const [yes, no] = row.components;
    assert.ok(yes.custom_id.includes('user99'));
    assert.ok(yes.custom_id.includes('guild99'));
    assert.ok(yes.custom_id.includes('7'));
    assert.ok(no.custom_id.includes('7'));
  });

  test('buildYesNoRow buttons are enabled', () => {
    const [yes, no] = ob.buildYesNoRow('u', 'g', 1).toJSON().components;
    // discord.js omits 'disabled' from JSON when false (it's the default)
    assert.ok(!yes.disabled);
    assert.ok(!no.disabled);
  });

  test('buildDisabledYesNoRow disables both buttons', () => {
    const [yes, no] = ob.buildDisabledYesNoRow('yes').toJSON().components;
    assert.equal(yes.disabled, true);
    assert.equal(no.disabled, true);
  });

  test('buildDisabledYesNoRow highlights chosen=yes with Success style (3)', () => {
    const [yes, no] = ob.buildDisabledYesNoRow('yes').toJSON().components;
    assert.equal(yes.style, 3); // ButtonStyle.Success = 3
    assert.equal(no.style, 2);  // ButtonStyle.Secondary = 2
  });

  test('buildDisabledYesNoRow highlights chosen=no with Danger style (4)', () => {
    const [yes, no] = ob.buildDisabledYesNoRow('no').toJSON().components;
    assert.equal(yes.style, 2);  // Secondary
    assert.equal(no.style, 4);   // ButtonStyle.Danger = 4
  });
});
