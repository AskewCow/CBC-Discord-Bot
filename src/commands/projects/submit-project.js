const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit-project')
    .setDescription('Submit a project for the showcase'),

  async execute(interaction) {
    await interaction.reply({ content: 'Project submissions coming soon.', ephemeral: true });
  },
};
