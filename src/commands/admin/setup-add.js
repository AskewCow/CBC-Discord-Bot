const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addSetupOptions, runSetupChange } = require('../../utils/setupChange');

module.exports = {
  data: addSetupOptions(
    new SlashCommandBuilder()
      .setName('setup-add')
      .setDescription('Add a channel, category, or role to a bot setting.')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    { valueName: 'type', valueDesc: 'Which setting to configure' },
  ),

  execute(interaction) {
    return runSetupChange(interaction, 'add', 'type');
  },
};
