const { MessageFlags } = require('discord.js');
const { successEmbed, errorEmbed } = require('./embeds');
const ticketUtil = require('./ticket');

// ─── /ticket-panel setup ──────────────────────────────────────────────────────

async function handlePanelSetup(interaction) {
  const title       = interaction.fields.getTextInputValue('title').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const channelId   = interaction.channelId;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let panel = ticketUtil.getPanelForChannel(interaction.guildId, channelId);

  if (panel) {
    ticketUtil.updatePanelContent(panel.id, title, description);
    panel = ticketUtil.getPanelForChannel(interaction.guildId, channelId);
  } else {
    ticketUtil.createPanel(interaction.guildId, channelId, interaction.user.id, title, description);
    panel = ticketUtil.getPanelForChannel(interaction.guildId, channelId);
  }

  try {
    await ticketUtil.postPanel(interaction.guild, panel);
    return interaction.editReply({
      embeds: [successEmbed('Panel posted', `Ticket panel has been posted to <#${panel.channel_id}>.`)],
    });
  } catch (err) {
    return interaction.editReply({
      embeds: [errorEmbed('Failed to post panel', err.message)],
    });
  }
}

// ─── /ticket-panel add-option ─────────────────────────────────────────────────

async function handlePanelAddOption(interaction) {
  const label       = interaction.fields.getTextInputValue('label').trim();
  const description = interaction.fields.getTextInputValue('description').trim() || null;
  const rawEmoji    = interaction.fields.getTextInputValue('emoji').trim() || null;
  const panelId     = Number(interaction.customId.split(':')[2]);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (label.toLowerCase() === 'other') {
    return interaction.editReply({
      embeds: [errorEmbed('Reserved label', '"Other" is always included automatically — you cannot add it manually.')],
    });
  }

  const existing = ticketUtil.getOptionByLabel(panelId, label);
  if (existing) {
    return interaction.editReply({
      embeds: [errorEmbed('Already exists', `An option named **${label}** already exists on this panel.`)],
    });
  }

  const optionId = ticketUtil.addOption(panelId, label, description, rawEmoji);

  const panel = ticketUtil.getPanelForChannel(interaction.guildId, interaction.channelId);
  try {
    await ticketUtil.postPanel(interaction.guild, panel);
  } catch {
    // Non-fatal — option was saved, panel refresh failed
  }

  return interaction.editReply({
    embeds: [
      successEmbed(
        'Option added',
        `**${rawEmoji ? rawEmoji + ' ' : ''}${label}** has been added to the panel dropdown.\n\n` +
        `To set up automated messages for this option, use:\n\`/ticket-flow add option:${label}\``
      ),
    ],
  });
}

// ─── /ticket-flow add (message type) ─────────────────────────────────────────

async function handleFlowAddMessage(interaction) {
  const content  = interaction.fields.getTextInputValue('content').trim();
  const optionId = Number(interaction.customId.split(':')[2]);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  ticketUtil.addFlowStep(optionId, 'message', content, null, null);

  const steps = ticketUtil.getFlowSteps(optionId);
  const option = ticketUtil.getOptionById(optionId);

  return interaction.editReply({
    embeds: [
      successEmbed(
        'Flow step added',
        `Message step added as step **${steps.length}** for **${option?.label ?? 'this option'}**.`
      ),
    ],
  });
}

// ─── /ticket-flow add (yes/no type) ──────────────────────────────────────────

async function handleFlowAddYesNo(interaction) {
  const question   = interaction.fields.getTextInputValue('question').trim();
  const yesContent = interaction.fields.getTextInputValue('yes_response').trim() || null;
  const noContent  = interaction.fields.getTextInputValue('no_response').trim() || null;
  const optionId   = Number(interaction.customId.split(':')[2]);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  ticketUtil.addFlowStep(optionId, 'yes_no', question, yesContent, noContent);

  const steps  = ticketUtil.getFlowSteps(optionId);
  const option = ticketUtil.getOptionById(optionId);

  return interaction.editReply({
    embeds: [
      successEmbed(
        'Flow step added',
        `Yes/No step added as step **${steps.length}** for **${option?.label ?? 'this option'}**.`
      ),
    ],
  });
}

module.exports = {
  handlePanelSetup,
  handlePanelAddOption,
  handleFlowAddMessage,
  handleFlowAddYesNo,
};
