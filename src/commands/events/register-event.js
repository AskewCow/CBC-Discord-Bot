const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register-event')
    .setDescription('Register for an upcoming event'),

  async execute(interaction) {
    await interaction.reply({ content: 'Event registration coming soon.', flags: MessageFlags.Ephemeral });
  },
};
