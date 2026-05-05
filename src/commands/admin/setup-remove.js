const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const config = require('../../utils/config');
const { SETUP_CHOICES, CHANNEL_KEYS } = require('../../constants');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-remove')
    .setDescription('Remove a channel or role from a bot setting.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt
        .setName('from')
        .setDescription('Which setting to remove from')
        .setRequired(true)
        .addChoices(...SETUP_CHOICES)
    )
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('Channel to remove (for channel settings)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(opt =>
      opt
        .setName('role')
        .setDescription('Role to remove (for role settings)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const from    = interaction.options.getString('from');
    const channel = interaction.options.getChannel('channel');
    const role    = interaction.options.getRole('role');

    const isChannelType = CHANNEL_KEYS.has(from);
    const label = SETUP_CHOICES.find(c => c.value === from).name;

    if (!channel && !role) {
      return interaction.reply({
        embeds: [errorEmbed('Missing value', `Provide a ${isChannelType ? 'channel' : 'role'} to remove from **${label}**.`)],
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
    const removed = config.removeValue(interaction.guildId, from, value);

    if (!removed) {
      return interaction.reply({
        embeds: [errorEmbed('Not found', `${mention} is not in **${label}**.`)],
        ephemeral: true,
      });
    }

    return interaction.reply({
      embeds: [successEmbed('Setting updated', `Removed ${mention} from **${label}**.`)],
      ephemeral: true,
    });
  },
};
