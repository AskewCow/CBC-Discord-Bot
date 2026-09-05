const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Find out where to open a support ticket'),

  async execute(interaction) {
    const channelIds = config.getValues(interaction.guildId, 'ticket_channel');

    const description = channelIds.length
      ? `Head to ${channelIds.map(id => `<#${id}>`).join(' or ')} and use the dropdown menu to open a support ticket.`
      : 'The ticket system has not been configured yet. Please contact an ambassador.';

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🎫  Need help?')
          .setDescription(description)
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
