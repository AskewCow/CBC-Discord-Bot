const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a structured announcement (committee only)'),

  async execute(interaction) {
    await interaction.reply({ content: 'Announcements formatter coming soon.', flags: MessageFlags.Ephemeral });
  },
};
