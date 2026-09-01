const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { requireAdmin } = require('../../utils/permissions');
const { errorEmbed } = require('../../utils/embeds');
const ticketUtil = require('../../utils/ticket');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-close')
    .setDescription('Close the ticket in this channel and post a transcript to the mod log')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    const ticket = ticketUtil.getTicketByChannelId(interaction.channelId);
    if (!ticket) {
      return interaction.reply({
        embeds: [errorEmbed('Not a ticket channel', 'Run this command inside the ticket channel you want to close.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (ticket.status !== 'open') {
      return interaction.reply({
        embeds: [errorEmbed('Already closed', 'This ticket is already closed.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      ...ticketUtil.buildClosePrompt(ticket.id),
      flags: MessageFlags.Ephemeral,
    });
  },
};
