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
const ticketUtil = require('../../utils/ticket');
const { requireAmbassador } = require('../../utils/permissions');

const STEP_TYPE_CHOICES = [
  { name: 'Message — send a plain message in the ticket', value: 'message' },
  { name: 'Yes / No — ask a question, branch on the answer',  value: 'yes_no'  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-flow')
    .setDescription('Manage automated message flows for ticket categories')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a flow step to a ticket category')
        .addStringOption(opt =>
          opt
            .setName('option')
            .setDescription('Ticket category to add the step to')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Type of step')
            .setRequired(true)
            .addChoices(...STEP_TYPE_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List all flow steps for a ticket category')
        .addStringOption(opt =>
          opt
            .setName('option')
            .setDescription('Ticket category to inspect')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a flow step from a ticket category')
        .addStringOption(opt =>
          opt
            .setName('option')
            .setDescription('Ticket category')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('step')
            .setDescription('Step number to remove (from /ticket-flow list)')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Remove all flow steps from a ticket category')
        .addStringOption(opt =>
          opt
            .setName('option')
            .setDescription('Ticket category to clear')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  // Autocomplete: return all options across all panels in this guild
  async autocomplete(interaction) {
    const options = ticketUtil.getOptionsForGuild(interaction.guildId);
    const focused = interaction.options.getFocused().toLowerCase();

    const choices = options
      .filter(o => o.label.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(o => ({ name: o.label, value: String(o.id) }));

    await interaction.respond(choices);
  },

  async execute(interaction) {
    if (!(await requireAmbassador(interaction))) return;
    const sub = interaction.options.getSubcommand();

    // ── add ────────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const rawOptionId = interaction.options.getString('option');
      const stepType    = interaction.options.getString('type');
      const option      = ticketUtil.getOptionById(Number(rawOptionId));

      if (!option) {
        return interaction.reply({
          embeds: [errorEmbed('Option not found', 'Select a valid category from the autocomplete list.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (stepType === 'message') {
        const modal = new ModalBuilder()
          .setCustomId(`ticket_flow:add_msg:${option.id}`)
          .setTitle(`Add Message Step — ${option.label}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('content')
                .setLabel('Message Content')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Auto-sent in the ticket. {faq} {announcements} {events} {general} {projects} {admin} auto-link')
                .setMaxLength(1500)
                .setRequired(true)
            )
          );

        return interaction.showModal(modal);
      }

      if (stepType === 'yes_no') {
        const modal = new ModalBuilder()
          .setCustomId(`ticket_flow:add_yn:${option.id}`)
          .setTitle(`Add Yes/No Step — ${option.label}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('question')
                .setLabel('Question')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('e.g. Did you read the {faq}?  {faq} {events} {general} {admin} {committee} auto-link to config')
                .setMaxLength(500)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('yes_response')
                .setLabel('Follow-up if Yes (optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('e.g. Great! Please attach it below.')
                .setMaxLength(500)
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('no_response')
                .setLabel('Follow-up if No (optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('e.g. No worries — please describe what you saw in as much detail as possible.')
                .setMaxLength(500)
                .setRequired(false)
            )
          );

        return interaction.showModal(modal);
      }
    }

    // ── list ───────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const rawOptionId = interaction.options.getString('option');
      const option      = ticketUtil.getOptionById(Number(rawOptionId));

      if (!option) {
        return interaction.reply({
          embeds: [errorEmbed('Option not found', 'Select a valid category.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const steps = ticketUtil.getFlowSteps(option.id);

      if (!steps.length) {
        return interaction.reply({
          embeds: [
            infoEmbed(
              `Flow: ${option.label}`,
              'No flow steps configured yet.\nUse `/ticket-flow add` to create the first step.'
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const render = (text) => ticketUtil.renderFlowContent(text, interaction.guildId);

      const lines = steps.map((step, i) => {
        const num   = `**Step ${i + 1}**`;
        const badge = step.step_type === 'yes_no' ? '❓ Yes/No' : '💬 Message';

        if (step.step_type === 'message') {
          return `${num} [${badge}]\n> ${render(step.content).replace(/\n/g, '\n> ')}`;
        }

        let parts = `${num} [${badge}]\n> ${render(step.content).replace(/\n/g, '\n> ')}`;
        if (step.yes_content) parts += `\n> ✅ **Yes →** ${render(step.yes_content).replace(/\n/g, ' ')}`;
        if (step.no_content)  parts += `\n> ❌ **No →** ${render(step.no_content).replace(/\n/g, ' ')}`;
        return parts;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Flow steps — ${option.emoji ? option.emoji + ' ' : ''}${option.label}`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `${steps.length} step${steps.length !== 1 ? 's' : ''} · Use /ticket-flow remove to delete a step` });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ── remove ─────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const rawOptionId = interaction.options.getString('option');
      const stepNumber  = interaction.options.getInteger('step');
      const option      = ticketUtil.getOptionById(Number(rawOptionId));

      if (!option) {
        return interaction.reply({
          embeds: [errorEmbed('Option not found', 'Select a valid category.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const steps = ticketUtil.getFlowSteps(option.id);

      if (!steps.length) {
        return interaction.reply({
          embeds: [errorEmbed('No steps', `**${option.label}** has no flow steps to remove.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (stepNumber > steps.length) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              'Invalid step number',
              `**${option.label}** only has ${steps.length} step${steps.length !== 1 ? 's' : ''}. Use \`/ticket-flow list\` to see them.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const target = steps[stepNumber - 1];
      ticketUtil.removeFlowStep(target.id);

      return interaction.reply({
        embeds: [
          successEmbed(
            'Step removed',
            `Step ${stepNumber} has been removed from the **${option.label}** flow.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── clear ──────────────────────────────────────────────────────────────────
    if (sub === 'clear') {
      const rawOptionId = interaction.options.getString('option');
      const option      = ticketUtil.getOptionById(Number(rawOptionId));

      if (!option) {
        return interaction.reply({
          embeds: [errorEmbed('Option not found', 'Select a valid category.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const steps = ticketUtil.getFlowSteps(option.id);
      if (!steps.length) {
        return interaction.reply({
          embeds: [infoEmbed('Nothing to clear', `**${option.label}** has no flow steps.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      for (const step of steps) {
        ticketUtil.removeFlowStep(step.id);
      }

      return interaction.reply({
        embeds: [
          successEmbed(
            'Flow cleared',
            `All ${steps.length} step${steps.length !== 1 ? 's' : ''} removed from **${option.label}**.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
