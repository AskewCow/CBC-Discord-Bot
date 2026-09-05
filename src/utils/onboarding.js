const db = require('../database/db');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { nowSec } = require('./time');
const { stepTable } = require('./stepFlow');

const steps = stepTable({
  table: 'onboarding_steps',
  parentCol: 'flow_id',
  columns: ['step_type', 'content', 'yes_content', 'no_content', 'stop_on'],
});

// ─── DB helpers — flows ───────────────────────────────────────────────────────

function getFlow(guildId) {
  return db.prepare('SELECT * FROM onboarding_flows WHERE guild_id = ?').get(guildId);
}

function deleteFlow(guildId) {
  db.prepare('DELETE FROM onboarding_flows WHERE guild_id = ?').run(guildId);
}

/**
 * Insert or update the guild's single onboarding flow row.
 * @param {object} patch  any of { flowType, welcomeMsg } — omitted fields are
 *   left untouched on an existing row (on insert they default to null/'welcome').
 */
function upsertFlow(guildId, patch, createdBy) {
  const now      = nowSec();
  const existing = getFlow(guildId);

  if (!existing) {
    db.prepare(
      'INSERT INTO onboarding_flows (guild_id, flow_type, welcome_msg, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, patch.flowType ?? 'welcome', patch.welcomeMsg ?? null, createdBy, now, now);
    return getFlow(guildId);
  }

  const sets = ['updated_at = ?'];
  const params = [now];
  if (patch.flowType !== undefined)   { sets.push('flow_type = ?');   params.push(patch.flowType); }
  if (patch.welcomeMsg !== undefined) { sets.push('welcome_msg = ?'); params.push(patch.welcomeMsg); }
  params.push(guildId);
  db.prepare(`UPDATE onboarding_flows SET ${sets.join(', ')} WHERE guild_id = ?`).run(...params);
  return getFlow(guildId);
}

const upsertWelcomeFlow = (guildId, welcomeMsg, createdBy) =>
  upsertFlow(guildId, { flowType: 'welcome', welcomeMsg }, createdBy);

// Update only the welcome_msg without changing flow_type or steps.
const setWelcomeMsg = (guildId, welcomeMsg, createdBy) =>
  upsertFlow(guildId, { welcomeMsg }, createdBy);

// Switch to a questions flow, preserving any existing welcome_msg.
const upsertQuestionsFlow = (guildId, createdBy) =>
  upsertFlow(guildId, { flowType: 'questions' }, createdBy);

// ─── DB helpers — steps ───────────────────────────────────────────────────────

const getSteps   = (flowId) => steps.list(flowId);
const getStep    = (stepId) => steps.get(stepId);
const addStep    = (flowId, stepType, content, yesContent, noContent, stopOn = null) =>
  steps.add(flowId, stepType, content, yesContent, noContent, stopOn);
const removeStep = (stepId) => steps.remove(stepId);
const clearSteps = (flowId) => steps.clear(flowId);

// ─── DB helpers — sessions ────────────────────────────────────────────────────

function getSession(discordId, guildId) {
  return db
    .prepare("SELECT * FROM onboarding_sessions WHERE discord_id = ? AND guild_id = ?")
    .get(discordId, guildId);
}

function getActiveSessionByUser(discordId) {
  return db
    .prepare("SELECT * FROM onboarding_sessions WHERE discord_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1")
    .get(discordId);
}

function createSession(discordId, guildId, flowId) {
  const now = nowSec();
  db.prepare(
    'INSERT OR REPLACE INTO onboarding_sessions (discord_id, guild_id, flow_id, current_step, status, answers, started_at, completed_at) VALUES (?, ?, ?, 0, ?, ?, ?, NULL)'
  ).run(discordId, guildId, flowId, 'in_progress', '[]', now);
  return getSession(discordId, guildId);
}

function updateSessionStep(sessionId, stepOrder) {
  db.prepare('UPDATE onboarding_sessions SET current_step = ? WHERE id = ?').run(stepOrder, sessionId);
}

function appendAnswer(sessionId, stepId, question, answer) {
  const row     = db.prepare('SELECT answers FROM onboarding_sessions WHERE id = ?').get(sessionId);
  const answers = JSON.parse(row.answers);
  answers.push({ step_id: stepId, question, answer });
  db.prepare('UPDATE onboarding_sessions SET answers = ? WHERE id = ?').run(JSON.stringify(answers), sessionId);
}

function completeSession(sessionId) {
  const now = nowSec();
  db.prepare(
    "UPDATE onboarding_sessions SET status = 'complete', completed_at = ? WHERE id = ?"
  ).run(now, sessionId);
}

function abandonSession(sessionId) {
  db.prepare("UPDATE onboarding_sessions SET status = 'abandoned' WHERE id = ?").run(sessionId);
}

// ─── Component builders ───────────────────────────────────────────────────────

function buildYesNoRow(discordId, guildId, stepId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`onboarding:yn:yes:${discordId}:${guildId}:${stepId}`)
      .setLabel('Yes')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`onboarding:yn:no:${discordId}:${guildId}:${stepId}`)
      .setLabel('No')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
}

function buildDisabledYesNoRow(chosen) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboarding:yn:done_yes')
      .setLabel('Yes')
      .setStyle(chosen === 'yes' ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji('✅')
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('onboarding:yn:done_no')
      .setLabel('No')
      .setStyle(chosen === 'no' ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setEmoji('❌')
      .setDisabled(true)
  );
}

module.exports = {
  // flows
  getFlow,
  deleteFlow,
  upsertWelcomeFlow,
  setWelcomeMsg,
  upsertQuestionsFlow,
  // steps
  getSteps,
  getStep,
  addStep,
  removeStep,
  clearSteps,
  // sessions
  getSession,
  getActiveSessionByUser,
  createSession,
  updateSessionStep,
  appendAnswer,
  completeSession,
  abandonSession,
  // builders
  buildYesNoRow,
  buildDisabledYesNoRow,
};
