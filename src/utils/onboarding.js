const db = require('../database/db');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ─── DB helpers — flows ───────────────────────────────────────────────────────

function getFlow(guildId) {
  return db.prepare('SELECT * FROM onboarding_flows WHERE guild_id = ?').get(guildId);
}

function deleteFlow(guildId) {
  db.prepare('DELETE FROM onboarding_flows WHERE guild_id = ?').run(guildId);
}

function upsertWelcomeFlow(guildId, welcomeMsg, createdBy) {
  const now      = Math.floor(Date.now() / 1000);
  const existing = getFlow(guildId);
  if (existing) {
    db.prepare(
      'UPDATE onboarding_flows SET flow_type = ?, welcome_msg = ?, updated_at = ? WHERE guild_id = ?'
    ).run('welcome', welcomeMsg, now, guildId);
  } else {
    db.prepare(
      'INSERT INTO onboarding_flows (guild_id, flow_type, welcome_msg, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, 'welcome', welcomeMsg, createdBy, now, now);
  }
  return getFlow(guildId);
}

// Update only the welcome_msg without changing flow_type or steps
function setWelcomeMsg(guildId, welcomeMsg, createdBy) {
  const now      = Math.floor(Date.now() / 1000);
  const existing = getFlow(guildId);
  if (existing) {
    db.prepare('UPDATE onboarding_flows SET welcome_msg = ?, updated_at = ? WHERE guild_id = ?')
      .run(welcomeMsg, now, guildId);
  } else {
    db.prepare(
      'INSERT INTO onboarding_flows (guild_id, flow_type, welcome_msg, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, 'welcome', welcomeMsg, createdBy, now, now);
  }
  return getFlow(guildId);
}

function upsertQuestionsFlow(guildId, createdBy) {
  const now      = Math.floor(Date.now() / 1000);
  const existing = getFlow(guildId);
  if (existing) {
    // Preserve welcome_msg when switching to questions type
    db.prepare(
      'UPDATE onboarding_flows SET flow_type = ?, updated_at = ? WHERE guild_id = ?'
    ).run('questions', now, guildId);
  } else {
    db.prepare(
      'INSERT INTO onboarding_flows (guild_id, flow_type, welcome_msg, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, 'questions', null, createdBy, now, now);
  }
  return getFlow(guildId);
}

// ─── DB helpers — steps ───────────────────────────────────────────────────────

function getSteps(flowId) {
  return db
    .prepare('SELECT * FROM onboarding_steps WHERE flow_id = ? ORDER BY step_order, id')
    .all(flowId);
}

function getStep(stepId) {
  return db.prepare('SELECT * FROM onboarding_steps WHERE id = ?').get(stepId);
}

function addStep(flowId, stepType, content, yesContent, noContent, stopOn = null) {
  const { m: maxOrder } = db
    .prepare('SELECT COALESCE(MAX(step_order), -1) AS m FROM onboarding_steps WHERE flow_id = ?')
    .get(flowId);
  return db
    .prepare(
      'INSERT INTO onboarding_steps (flow_id, step_order, step_type, content, yes_content, no_content, stop_on) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(flowId, maxOrder + 1, stepType, content, yesContent || null, noContent || null, stopOn || null)
    .lastInsertRowid;
}

function removeStep(stepId) {
  db.prepare('DELETE FROM onboarding_steps WHERE id = ?').run(stepId);
}

function clearSteps(flowId) {
  db.prepare('DELETE FROM onboarding_steps WHERE flow_id = ?').run(flowId);
}

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
  const now = Math.floor(Date.now() / 1000);
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
  const now = Math.floor(Date.now() / 1000);
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
