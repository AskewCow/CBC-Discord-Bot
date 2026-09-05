const { EmbedBuilder } = require('discord.js');
const pg       = require('../database/pg');
const cfg      = require('./config');
const logger   = require('./logger');
const onb      = require('./onboarding');

const ONBOARDING_COLOR = 0x57f287;

// ─── Entry point ──────────────────────────────────────────────────────────────

async function startOnboardingFlow(member, guild) {
  const flow = onb.getFlow(guild.id);
  if (!flow) return;

  let dmChannel;
  try {
    dmChannel = await member.createDM();
  } catch {
    logger.warn(`Could not open DM with ${member.user.tag} — DMs may be disabled.`);
    return;
  }

  // Send welcome message first if one is set (applies to both flow types)
  if (flow.welcome_msg) {
    await dmChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(ONBOARDING_COLOR)
          .setTitle(`👋  Welcome to ${guild.name}!`)
          .setDescription(flow.welcome_msg)
          .setThumbnail(guild.iconURL())
          .setTimestamp(),
      ],
    });
  }

  if (flow.flow_type === 'welcome') {
    await _markOnboarded(member.id);
    await _assignMemberRole(member.id, guild);
    return;
  }

  // questions flow
  const steps = onb.getSteps(flow.id);
  if (!steps.length) return;

  // Abandon any stale session (e.g. member rejoined)
  const existing = onb.getSession(member.id, guild.id);
  if (existing && existing.status === 'in_progress') {
    onb.abandonSession(existing.id);
  }

  const session = onb.createSession(member.id, guild.id, flow.id);
  const hasTextStep = steps.some(s => s.step_type === 'text');
  await _runSteps(dmChannel, session, steps, guild, hasTextStep);
}

// ─── Step runner ──────────────────────────────────────────────────────────────

// sendTextHint: true on the first call when the flow contains at least one text question
async function _runSteps(dmChannel, session, steps, guild, sendTextHint = false) {
  if (sendTextHint && steps.some(s => s.step_type === 'text')) {
    await dmChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setDescription(
            '📋  **A few quick questions before you get started.**\n\n' +
            'For open-ended questions, just type your answer as a single message in this DM.'
          ),
      ],
    });
  }

  for (const step of steps) {
    const embed = new EmbedBuilder()
      .setColor(ONBOARDING_COLOR)
      .setDescription(step.content);

    if (step.step_type === 'yes_no') {
      await dmChannel.send({
        embeds: [embed],
        components: [onb.buildYesNoRow(session.discord_id, session.guild_id, step.id)],
      });
      onb.updateSessionStep(session.id, step.step_order);
      return; // Pause — resumes via resumeAfterYesNo
    }

    if (step.step_type === 'text') {
      await dmChannel.send({ embeds: [embed] });
      onb.updateSessionStep(session.id, step.step_order);
      return; // Pause — resumes via resumeAfterText (messageCreate)
    }
  }

  // All steps exhausted
  const freshSession = onb.getSession(session.discord_id, session.guild_id);
  await _completeFlow(dmChannel, freshSession, guild);
}

// ─── Resume from yes/no button ────────────────────────────────────────────────

async function resumeAfterYesNo(interaction, session, stepId, choice) {
  const step = onb.getStep(stepId);
  if (!step) return interaction.update({ components: [] });

  await interaction.update({ components: [onb.buildDisabledYesNoRow(choice)] });

  const followUp = choice === 'yes' ? step.yes_content : step.no_content;
  if (followUp) {
    await interaction.channel.send({
      embeds: [new EmbedBuilder().setColor(ONBOARDING_COLOR).setDescription(followUp)],
    });
  }

  onb.appendAnswer(session.id, stepId, step.content, choice === 'yes' ? 'Yes' : 'No');

  const guild = interaction.client.guilds.cache.get(session.guild_id);

  // This answer is configured to end onboarding immediately — skip the rest.
  if (step.stop_on === choice) {
    const freshSession = onb.getSession(session.discord_id, session.guild_id);
    return _completeFlow(interaction.channel, freshSession, guild);
  }

  const allSteps = onb.getSteps(step.flow_id);
  const remaining = allSteps.filter(
    s => s.step_order > step.step_order || (s.step_order === step.step_order && s.id > step.id)
  );

  await _runSteps(interaction.channel, session, remaining, guild);
}

// ─── Resume from DM text reply ────────────────────────────────────────────────

async function resumeAfterText(message, session) {
  const steps       = onb.getSteps(session.flow_id);
  const currentStep = steps.find(s => s.step_order === session.current_step);

  if (!currentStep || currentStep.step_type !== 'text') return;

  onb.appendAnswer(session.id, currentStep.id, currentStep.content, message.content);

  const remaining = steps.filter(
    s => s.step_order > currentStep.step_order ||
         (s.step_order === currentStep.step_order && s.id > currentStep.id)
  );

  const guild = message.client.guilds.cache.get(session.guild_id);
  await _runSteps(message.channel, session, remaining, guild);
}

// ─── Completion ───────────────────────────────────────────────────────────────

async function _completeFlow(dmChannel, session, guild) {
  onb.completeSession(session.id);
  await _markOnboarded(session.discord_id);

  await dmChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(ONBOARDING_COLOR)
        .setTitle('✅  Onboarding complete!')
        .setDescription(`Thanks for taking the time to fill that in. Welcome to **${guild?.name ?? 'the server'}**!`)
        .setTimestamp(),
    ],
  });

  if (guild) {
    await _assignMemberRole(session.discord_id, guild);
    await _postModLog(session, guild);
  }
}

async function _postModLog(session, guild) {
  const modLogChannels = cfg.getValues(guild.id, 'mod_log_channel');
  if (!modLogChannels.length) return;

  const answers = JSON.parse(session.answers).filter(a => a.answer !== null);

  // Fetch the member for display info
  let member;
  try {
    member = await guild.members.fetch(session.discord_id);
  } catch {
    // Member may have left — proceed with what we have
  }

  const embed = new EmbedBuilder()
    .setColor(ONBOARDING_COLOR)
    .setTitle('👋  New Member Onboarded')
    .setThumbnail(member?.user.displayAvatarURL() ?? null)
    .addFields(
      { name: 'Member',   value: `<@${session.discord_id}>`,           inline: true },
      { name: 'Username', value: member?.user.tag ?? session.discord_id, inline: true },
      { name: 'Joined',   value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown', inline: true }
    )
    .setFooter({ text: 'Onboarding completed' })
    .setTimestamp();

  // Add Q&A fields — cap at 22 to stay within Discord's 25-field limit (3 already used)
  const MAX_QA_FIELDS = 22;
  const qa = answers.slice(0, MAX_QA_FIELDS);
  for (const entry of qa) {
    embed.addFields({
      name:  entry.question.slice(0, 100),
      value: String(entry.answer).slice(0, 1024),
    });
  }
  if (answers.length > MAX_QA_FIELDS) {
    embed.addFields({ name: '…', value: `And ${answers.length - MAX_QA_FIELDS} more response(s)` });
  }

  for (const channelId of modLogChannels) {
    try {
      const channel = await guild.channels.fetch(channelId);
      await channel.send({ embeds: [embed] });
    } catch (err) {
      logger.warn(`Could not post onboarding log to channel ${channelId}: ${err.message}`);
    }
  }
}

async function _assignMemberRole(discordId, guild) {
  const [roleId] = cfg.getValues(guild.id, 'member_role');
  if (!roleId) return;
  try {
    const member = await guild.members.fetch(discordId);
    await member.roles.add(roleId);
    logger.info(`Assigned member role ${roleId} to ${discordId} in guild ${guild.id}`);
  } catch (err) {
    logger.warn(`Could not assign member role to ${discordId}: ${err.message}`);
  }
}

async function _markOnboarded(discordId) {
  const now = Math.floor(Date.now() / 1000);
  await pg.query('UPDATE members SET onboarded_at = $1 WHERE discord_id = $2', [now, discordId])
    .catch(err => logger.warn(`Could not mark ${discordId} onboarded: ${err.message}`));
}

module.exports = { startOnboardingFlow, resumeAfterYesNo, resumeAfterText };
