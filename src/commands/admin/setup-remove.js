const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addSetupOptions, runSetupChange } = require('../../utils/setupChange');

module.exports = {
  data: addSetupOptions(
    new SlashCommandBuilder()
      .setName('setup-remove')
      .setDescription('Remove a channel, category, or role from a bot setting.')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    { valueName: 'from', valueDesc: 'Which setting to remove from' },
  ),

  execute(interaction) {
    return runSetupChange(interaction, 'remove', 'from');
  },
};
