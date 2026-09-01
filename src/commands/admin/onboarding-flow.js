const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const onb = require('../../utils/onboarding');
const { requireAdmin } = require('../../utils/permissions');

const STEP_TYPE_CHOICES = [
  { name: 'Text — ask a free-form question, collect their reply', value: 'text'   },
  { name: 'Yes / No — ask a question, branch on the answer',      value: 'yes_no' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('onboarding-flow')
    .setDescription('Configure the onboarding DM flow for new members')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('set-welcome')
        .setDescription('Set a simple welcome message (sent as a DM, no questions)')
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a question to the onboarding form')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Question type')
            .setRequired(true)
            .addChoices(...STEP_TYPE_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('Show the current onboarding flow configuration')
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a question by step number')
        .addIntegerOption(opt =>
          opt
            .setName('step')
            .setDescription('Step number to remove (from /onboarding-flow list)')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('clear').setDescription('Remove all questions from the flow (keeps the flow row)')
    )
    .addSubcommand(sub =>
      sub.setName('delete').setDescription('Delete the entire onboarding flow — no DMs will be sent on join')
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();

    // ── set-welcome ────────────────────────────────────────────────────────────
    if (sub === 'set-welcome') {
      const modal = new ModalBuilder()
        .setCustomId('onboarding_flow:set_welcome')
        .setTitle('Set Welcome Message')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('welcome_msg')
              .setLabel('Welcome message')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Welcome to the server! Here is everything you need to know…')
              .setMaxLength(1500)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    // ── add ────────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const stepType = interaction.options.getString('type');

      // Ensure a questions-type flow exists
      let flow = onb.getFlow(interaction.guildId);
      if (!flow || flow.flow_type !== 'questions') {
        flow = onb.upsertQuestionsFlow(interaction.guildId, interaction.user.id);
      }

      if (stepType === 'text') {
        const modal = new ModalBuilder()
          .setCustomId(`onboarding_flow:add_text:${flow.id}`)
          .setTitle('Add Text Question')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('content')
                .setLabel('Question to ask')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('e.g. What are you hoping to get out of this community?')
                .setMaxLength(500)
                .setRequired(true)
            )
          );
        return interaction.showModal(modal);
      }

      if (stepType === 'yes_no') {
        const modal = new ModalBuilder()
          .setCustomId(`onboarding_flow:add_yn:${flow.id}`)
          .setTitle('Add Yes/No Question')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('question')
                .setLabel('Question to ask')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('e.g. Are you a student?')
                .setMaxLength(500)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('yes_response')
                .setLabel('Follow-up if Yes (optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('e.g. Great! Check out the #students channel.')
                .setMaxLength(500)
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('no_response')
                .setLabel('Follow-up if No (optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('e.g. No problem — everyone is welcome here!')
                .setMaxLength(500)
                .setRequired(false)
            )
          );
        return interaction.showModal(modal);
      }
    }

    // ── list ───────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const flow = onb.getFlow(interaction.guildId);

      if (!flow) {
        return interaction.reply({
          embeds: [
            infoEmbed(
              'No onboarding flow',
              'No onboarding flow is configured.\nUse `/onboarding-flow set-welcome` for a simple welcome DM, or `/onboarding-flow add` to build a question form.'
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (flow.flow_type === 'welcome') {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle('Onboarding — Welcome message')
              .setDescription(`> ${flow.welcome_msg.replace(/\n/g, '\n> ')}`)
              .setFooter({ text: 'Use /onboarding-flow set-welcome to update · /onboarding-flow delete to remove' })
              .setTimestamp(),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const steps = onb.getSteps(flow.id);

      // Build welcome message section if one is set alongside questions
      const welcomeSection = flow.welcome_msg
        ? `**Welcome message (sent first):**\n> ${flow.welcome_msg.replace(/\n/g, '\n> ')}\n\n`
        : '';

      if (!steps.length) {
        return interaction.reply({
          embeds: [
            infoEmbed(
              'Onboarding — Question form (empty)',
              `${welcomeSection}No questions added yet.\nUse \`/onboarding-flow add\` to add the first question.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const lines = steps.map((step, i) => {
        const num   = `**Step ${i + 1}**`;
        const badge = step.step_type === 'yes_no' ? '❓ Yes/No' : '💬 Text';
        let text    = `${num} [${badge}]\n> ${step.content.replace(/\n/g, '\n> ')}`;
        if (step.yes_content) text += `\n> ✅ **Yes →** ${step.yes_content.replace(/\n/g, ' ')}`;
        if (step.no_content)  text += `\n> ❌ **No →** ${step.no_content.replace(/\n/g, ' ')}`;
        return text;
      });

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Onboarding — Question form')
        .setDescription(welcomeSection + lines.join('\n\n'))
        .setFooter({ text: `${steps.length} question${steps.length !== 1 ? 's' : ''} · Use /onboarding-flow remove to delete a step` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ── remove ─────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const stepNumber = interaction.options.getInteger('step');
      const flow       = onb.getFlow(interaction.guildId);

      if (!flow || flow.flow_type !== 'questions') {
        return interaction.reply({
          embeds: [errorEmbed('No question form', 'There is no question form configured.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const steps = onb.getSteps(flow.id);

      if (!steps.length) {
        return interaction.reply({
          embeds: [errorEmbed('No questions', 'The form has no questions to remove.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (stepNumber > steps.length) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              'Invalid step number',
              `The form only has ${steps.length} question${steps.length !== 1 ? 's' : ''}. Use \`/onboarding-flow list\` to see them.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const target = steps[stepNumber - 1];
      onb.removeStep(target.id);

      return interaction.reply({
        embeds: [successEmbed('Question removed', `Step ${stepNumber} has been removed from the onboarding form.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── clear ──────────────────────────────────────────────────────────────────
    if (sub === 'clear') {
      const flow = onb.getFlow(interaction.guildId);

      if (!flow || flow.flow_type !== 'questions') {
        return interaction.reply({
          embeds: [infoEmbed('Nothing to clear', 'There is no question form to clear.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const steps = onb.getSteps(flow.id);
      if (!steps.length) {
        return interaction.reply({
          embeds: [infoEmbed('Already empty', 'The form has no questions.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      onb.clearSteps(flow.id);

      return interaction.reply({
        embeds: [
          successEmbed(
            'Form cleared',
            `All ${steps.length} question${steps.length !== 1 ? 's' : ''} removed. Use \`/onboarding-flow add\` to rebuild the form.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── delete ─────────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const flow = onb.getFlow(interaction.guildId);

      if (!flow) {
        return interaction.reply({
          embeds: [infoEmbed('Nothing to delete', 'No onboarding flow is configured.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      onb.deleteFlow(interaction.guildId);

      return interaction.reply({
        embeds: [
          successEmbed(
            'Onboarding flow deleted',
            'The onboarding flow has been removed. New members will no longer receive a DM on join.'
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
