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
const { isAdmin } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Manage the server ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Create or update the ticket panel title and description')
    )
    .addSubcommand(sub =>
      sub
        .setName('add-option')
        .setDescription('Add a category option to the ticket dropdown')
    )
    .addSubcommand(sub =>
      sub
        .setName('remove-option')
        .setDescription('Remove a category option from the ticket dropdown')
        .addStringOption(opt =>
          opt
            .setName('option')
            .setDescription('Option to remove')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('View the current panel configuration and all options')
    ),

  // Autocomplete for the remove-option subcommand
  async autocomplete(interaction) {
    const panel = ticketUtil.getPanelForChannel(interaction.guildId, interaction.channelId);
    if (!panel) return interaction.respond([]);

    const options = ticketUtil.getOptionsForPanel(panel.id);
    const focused = interaction.options.getFocused().toLowerCase();

    const choices = options
      .filter(o => o.label.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(o => ({ name: o.label, value: String(o.id) }));

    await interaction.respond(choices);
  },

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Access denied', 'This command is restricted to admins.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();

    // ── setup ──────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const panel = ticketUtil.getPanelForChannel(interaction.guildId, interaction.channelId);

      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Panel Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Support Desk')
        .setMaxLength(100)
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Panel Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Explain how members should use this panel…')
        .setMaxLength(1000)
        .setRequired(true);

      if (panel) {
        titleInput.setValue(panel.title);
        descInput.setValue(panel.description);
      }

      const modal = new ModalBuilder()
        .setCustomId('ticket_panel:setup')
        .setTitle(panel ? 'Edit Ticket Panel' : 'Create Ticket Panel')
        .addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descInput)
        );

      return interaction.showModal(modal);
    }

    // ── add-option ─────────────────────────────────────────────────────────────
    if (sub === 'add-option') {
      const panel = ticketUtil.getPanelForChannel(interaction.guildId, interaction.channelId);
      if (!panel) {
        return interaction.reply({
          embeds: [errorEmbed('No panel', 'Run `/ticket-panel setup` first to create the panel.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const existing = ticketUtil.getOptionsForPanel(panel.id);
      if (existing.length >= 24) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              'Too many options',
              'Discord dropdowns are limited to 25 entries. You already have 24 custom options + the automatic "Other".'
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`ticket_panel:add_option:${panel.id}`)
        .setTitle('Add Ticket Category')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('label')
              .setLabel('Category Name')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. Technical Issue')
              .setMaxLength(100)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Short Description (optional)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. Bug reports and technical help')
              .setMaxLength(100)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('emoji')
              .setLabel('Emoji (optional)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('🔧')
              .setMaxLength(100)
              .setRequired(false)
          )
        );

      return interaction.showModal(modal);
    }

    // ── remove-option ──────────────────────────────────────────────────────────
    if (sub === 'remove-option') {
      const rawId  = interaction.options.getString('option');
      const option = ticketUtil.getOptionById(Number(rawId));

      if (!option) {
        return interaction.reply({
          embeds: [errorEmbed('Not found', 'That option does not exist.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      ticketUtil.removeOption(option.id);

      const panel = ticketUtil.getPanelForChannel(interaction.guildId, interaction.channelId);
      if (panel) {
        try {
          await ticketUtil.postPanel(interaction.guild, panel);
        } catch {
          // Non-fatal
        }
      }

      return interaction.reply({
        embeds: [successEmbed('Option removed', `**${option.label}** has been removed from the panel.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── view ───────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const panel = ticketUtil.getPanelForChannel(interaction.guildId, interaction.channelId);
      if (!panel) {
        return interaction.reply({
          embeds: [infoEmbed('No panel configured', 'Run `/ticket-panel setup` to create one.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const options = ticketUtil.getOptionsForPanel(panel.id);

      const optionLines = options.length
        ? options.map((o, i) => {
            const prefix = `**${i + 1}.** ${o.emoji ? o.emoji + ' ' : ''}**${o.label}**`;
            return o.description ? `${prefix} — ${o.description}` : prefix;
          }).join('\n')
        : '*No custom options yet. "Other" will appear automatically.*';

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Ticket Panel Configuration')
        .addFields(
          { name: 'Title',       value: panel.title,          inline: true },
          { name: 'Channel',     value: `<#${panel.channel_id}>`, inline: true },
          { name: 'Description', value: panel.description },
          { name: `Dropdown Options (${options.length}/24 custom)`, value: optionLines }
        )
        .setFooter({ text: '"Other" is always shown as the last option automatically.' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
