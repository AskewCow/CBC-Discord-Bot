const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { errorEmbed } = require('../../utils/embeds');
const { isAdmin } = require('../../utils/permissions');
const { buildSetupBoard } = require('../../utils/setupBoard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-view')
    .setDescription('View the current server configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied', 'This command is restricted to admins.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [buildSetupBoard(interaction.guildId)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
