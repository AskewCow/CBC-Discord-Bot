const { MessageFlags } = require('discord.js');
const { successEmbed, errorEmbed } = require('./embeds');
const onb = require('./onboarding');

// ─── /onboarding-flow set-welcome ─────────────────────────────────────────────

async function handleFlowSetWelcome(interaction) {
  const welcomeMsg = interaction.fields.getTextInputValue('welcome_msg').trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const flow = onb.setWelcomeMsg(interaction.guildId, welcomeMsg, interaction.user.id);
  const hasQuestions = flow.flow_type === 'questions';

  return interaction.editReply({
    embeds: [
      successEmbed(
        'Welcome message saved',
        (hasQuestions
          ? 'This message will be sent **before** the question form when new members join.\n\n'
          : 'New members will receive this message as a DM when they join.\n\n') +
        `**Preview:**\n> ${welcomeMsg.replace(/\n/g, '\n> ')}`
      ),
    ],
  });
}

// ─── /onboarding-flow add (text type) ────────────────────────────────────────

async function handleFlowAddText(interaction) {
  const content = interaction.fields.getTextInputValue('content').trim();
  const flowId  = Number(interaction.customId.split(':')[2]);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  onb.addStep(flowId, 'text', content, null, null);
  const steps = onb.getSteps(flowId);

  return interaction.editReply({
    embeds: [
      successEmbed(
        'Question added',
        `Text question added as step **${steps.length}**.\n\n> ${content.replace(/\n/g, '\n> ')}`
      ),
    ],
  });
}

// ─── /onboarding-flow add (yes/no type) ──────────────────────────────────────

async function handleFlowAddYesNo(interaction) {
  const question   = interaction.fields.getTextInputValue('question').trim();
  const yesContent = interaction.fields.getTextInputValue('yes_response').trim() || null;
  const noContent  = interaction.fields.getTextInputValue('no_response').trim() || null;
  const parts      = interaction.customId.split(':');
  const flowId     = Number(parts[2]);
  const stopOn     = parts[3] === 'yes' || parts[3] === 'no' ? parts[3] : null;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  onb.addStep(flowId, 'yes_no', question, yesContent, noContent, stopOn);
  const steps = onb.getSteps(flowId);

  return interaction.editReply({
    embeds: [
      successEmbed(
        'Yes/No question added',
        `Yes/No question added as step **${steps.length}**.\n\n> ${question.replace(/\n/g, '\n> ')}` +
        (stopOn
          ? `\n\n⛔ Onboarding ends immediately if they answer **${stopOn === 'yes' ? 'Yes' : 'No'}**.`
          : '')
      ),
    ],
  });
}

module.exports = { handleFlowSetWelcome, handleFlowAddText, handleFlowAddYesNo };
