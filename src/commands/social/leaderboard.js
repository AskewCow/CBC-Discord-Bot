const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the invite leaderboard'),

  async execute(interaction) {
    await interaction.reply({ content: 'Invite leaderboard coming soon.', flags: MessageFlags.Ephemeral });
  },
};
