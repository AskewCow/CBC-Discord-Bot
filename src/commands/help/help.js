const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Open a private help thread'),

  async execute(interaction) {
    await interaction.reply({ content: 'Help ticket system coming soon.', ephemeral: true });
  },
};
