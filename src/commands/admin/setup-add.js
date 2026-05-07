const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const config = require('../../utils/config');
const { SETUP_CHOICES, CHANNEL_KEYS, CATEGORY_KEYS, ROLE_KEYS } = require('../../constants');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { isAdmin } = require('../../utils/permissions');
const { buildSetupBoard } = require('../../utils/setupBoard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-add')
    .setDescription('Add a channel, category, or role to a bot setting.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt
        .setName('type')
        .setDescription('Which setting to configure')
        .setRequired(true)
        .addChoices(...SETUP_CHOICES)
    )
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('Channel to add (for text channel settings)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption(opt =>
      opt
        .setName('category')
        .setDescription('Category to add (for category settings like Ticket Category)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    )
    .addRoleOption(opt =>
      opt
        .setName('role')
        .setDescription('Role to add (for role settings)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Access denied', 'This command is restricted to admins.')], flags: MessageFlags.Ephemeral });
    }
    const type     = interaction.options.getString('type');
    const channel  = interaction.options.getChannel('channel');
    const category = interaction.options.getChannel('category');
    const role     = interaction.options.getRole('role');

    const isChannelType  = CHANNEL_KEYS.has(type);
    const isCategoryType = CATEGORY_KEYS.has(type);
    const isRoleType     = ROLE_KEYS.has(type);
    const label = SETUP_CHOICES.find(c => c.value === type).name;

    // No value → show the full setup board
    if (!channel && !category && !role) {
      return interaction.reply({
        embeds: [buildSetupBoard(interaction.guildId)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Mismatch guards
    if (isChannelType && (category || role)) {
      return interaction.reply({
        embeds: [errorEmbed('Wrong type', `**${label}** stores text channels. Use the \`channel\` option.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (isCategoryType && (channel || role)) {
      return interaction.reply({
        embeds: [errorEmbed('Wrong type', `**${label}** stores categories. Use the \`category\` option.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (isRoleType && (channel || category)) {
      return interaction.reply({
        embeds: [errorEmbed('Wrong type', `**${label}** stores roles. Use the \`role\` option.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    let value, mention;
    if (isRoleType)          { value = role.id;     mention = `<@&${value}>`; }
    else if (isChannelType)  { value = channel.id;  mention = `<#${value}>`; }
    else                     { value = category.id; mention = `<#${value}>`; }

    const added = config.addValue(interaction.guildId, type, value);

    if (!added) {
      return interaction.reply({
        embeds: [errorEmbed('Already added', `${mention} is already in **${label}**.`), buildSetupBoard(interaction.guildId)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [successEmbed('Setting updated', `Added ${mention} to **${label}**.`), buildSetupBoard(interaction.guildId)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
