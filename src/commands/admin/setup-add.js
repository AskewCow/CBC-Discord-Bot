const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const config = require('../../utils/config');
const { SETUP_CHOICES, CHANNEL_KEYS, ROLE_KEYS } = require('../../constants');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-add')
    .setDescription('Add a channel or role to a bot setting. Omit value to view current entries.')
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
        .setDescription('Channel to add (for channel settings)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(opt =>
      opt
        .setName('role')
        .setDescription('Role to add (for role settings)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const type    = interaction.options.getString('type');
    const channel = interaction.options.getChannel('channel');
    const role    = interaction.options.getRole('role');

    const isChannelType = CHANNEL_KEYS.has(type);
    const label = SETUP_CHOICES.find(c => c.value === type).name;

    // No value → show current entries for this setting
    if (!channel && !role) {
      const values  = config.getValues(interaction.guildId, type);
      const display = values.length
        ? values.map(v => (isChannelType ? `<#${v}>` : `<@&${v}>`)).join('\n')
        : '*Nothing configured yet.*';
      return interaction.reply({
        embeds: [infoEmbed(`Current: ${label}`, display)],
        ephemeral: true,
      });
    }

    // Mismatch guard
    if (isChannelType && role) {
      return interaction.reply({
        embeds: [errorEmbed('Wrong type', `**${label}** stores channels, not roles.`)],
        ephemeral: true,
      });
    }
    if (!isChannelType && channel) {
      return interaction.reply({
        embeds: [errorEmbed('Wrong type', `**${label}** stores roles, not channels.`)],
        ephemeral: true,
      });
    }

    const value   = isChannelType ? channel.id : role.id;
    const mention = isChannelType ? `<#${value}>` : `<@&${value}>`;
    const added   = config.addValue(interaction.guildId, type, value);

    if (!added) {
      return interaction.reply({
        embeds: [errorEmbed('Already added', `${mention} is already in **${label}**.`)],
        ephemeral: true,
      });
    }

    return interaction.reply({
      embeds: [successEmbed('Setting updated', `Added ${mention} to **${label}**.`)],
      ephemeral: true,
    });
  },
};
