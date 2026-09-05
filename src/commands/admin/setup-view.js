const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { requireAmbassador } = require('../../utils/permissions');
const { buildSetupBoard } = require('../../utils/setupBoard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-view')
    .setDescription('View the current server configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await requireAmbassador(interaction))) return;

    return interaction.reply({
      embeds: [buildSetupBoard(interaction.guildId)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
