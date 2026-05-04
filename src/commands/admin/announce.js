const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a structured announcement (committee only)'),

  async execute(interaction) {
    await interaction.reply({ content: 'Announcements formatter coming soon.', ephemeral: true });
  },
};
