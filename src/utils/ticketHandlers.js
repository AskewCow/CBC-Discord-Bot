const { EmbedBuilder, MessageFlags } = require('discord.js');
const { brandFooter } = require('./embeds');
const { errorEmbed } = require('./embeds');
const logger = require('./logger');
const ticketUtil = require('./ticket');
const { runFlow, resumeAfterYesNo } = require('./ticketFlow');
const { generateTranscript } = require('./ticketTranscript');
const { logToModLog } = require('./eventHandlers');
const { isMod } = require('./permissions');

// ─── Select menu: user opens a ticket ────────────────────────────────────────

async function handleTicketOpen(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId;
  const opener  = interaction.member;

  // Prevent duplicate open tickets
  const existing = ticketUtil.getOpenTicketByOpener(guildId, opener.id);
  if (existing) {
    return interaction.editReply({
      embeds: [
        errorEmbed(
          'You already have an open ticket',
          `Your existing ticket is at <#${existing.channel_id}>.\nPlease use that channel or close it before opening a new one.`
        ),
      ],
    });
  }

  const value = interaction.values[0]; // e.g. "opt:3" or "opt:other"
  const panel = ticketUtil.getPanelForChannel(guildId, interaction.channelId);

  let option   = null;
  let optionId = null;
  let topic    = 'Other';

  if (value !== 'opt:other') {
    const id = Number(value.split(':')[1]);
    option   = ticketUtil.getOptionById(id);
    if (option) { optionId = option.id; topic = option.label; }
  }

  let channel, ticketId;
  try {
    ({ channel, ticketId } = await ticketUtil.createTicketChannel(
      interaction.guild,
      opener,
      topic,
      panel?.id ?? null,
      optionId
    ));
  } catch (err) {
    return interaction.editReply({
      embeds: [errorEmbed('Failed to create ticket', err.message)],
    });
  }

  // Send the welcome embed + close button
  const ticket = ticketUtil.getTicketById(ticketId);
  await channel.send({
    embeds:     [ticketUtil.buildWelcomeEmbed(ticketId, opener, topic)],
    components: [ticketUtil.buildCloseButton(ticketId)],
  });

  // Execute automated flow if the option has steps configured
  if (optionId) {
    try {
      await runFlow(channel, ticket);
    } catch {
      // Non-fatal — ticket is open even if flow fails
    }
  }

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅  Ticket created')
        .setDescription(`Your ticket has been opened at ${channel.toString()}.`)
        .setFooter(brandFooter()),
    ],
  });
}

// ─── Button: initiate ticket close ───────────────────────────────────────────

async function handleClose(interaction) {
  const ticketId = Number(interaction.customId.split(':')[2]);
  const ticket   = ticketUtil.getTicketById(ticketId);

  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ embeds: [errorEmbed('Ticket not found', 'This ticket is already closed or does not exist.')], flags: MessageFlags.Ephemeral });
  }

  // Only the opener or staff can close
  const isStaff = isMod(interaction.member);
  if (!isStaff && interaction.user.id !== ticket.opener_id) {
    return interaction.reply({ embeds: [errorEmbed('Permission denied', 'Only the ticket opener or staff can close this ticket.')], flags: MessageFlags.Ephemeral });
  }

  return interaction.reply({
    ...ticketUtil.buildClosePrompt(ticketId),
    flags: MessageFlags.Ephemeral,
  });
}

// ─── Button: confirm close ────────────────────────────────────────────────────

async function handleCloseConfirm(interaction) {
  const ticketId = Number(interaction.customId.split(':')[2]);
  const ticket   = ticketUtil.getTicketById(ticketId);

  if (!ticket || ticket.status !== 'open') {
    return interaction.update({ embeds: [errorEmbed('Already closed', 'This ticket has already been closed.')], components: [] });
  }

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('Closing ticket…')
        .setDescription('Saving the transcript. This channel will be deleted shortly.')
        .setFooter(brandFooter()),
    ],
    components: [],
  });

  // Capture the transcript while the channel still exists
  let transcript = null;
  try {
    transcript = await generateTranscript(interaction.channel, ticket, interaction.user);
  } catch (err) {
    logger.warn(`Ticket #${ticketId}: transcript generation failed — ${err.message}`);
  }

  ticketUtil.closeTicket(ticketId);

  // Send a copy to the opener's DMs, and log to the mod-log channel
  await _dmOpenerTranscript(interaction, ticket, transcript);
  await _logClose(interaction, ticket, transcript ? [transcript] : []);

  // Delete the channel after a brief delay so users can see the closing message
  setTimeout(() => {
    interaction.channel.delete(`Ticket #${ticketUtil.ticketNo(ticketId)} closed by ${interaction.user.tag ?? interaction.user.username}`).catch(() => {});
  }, 3000);
}

// ─── Button: cancel close ─────────────────────────────────────────────────────

async function handleCloseCancel(interaction) {
  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Close cancelled')
        .setDescription('The ticket will remain open.')
        .setFooter(brandFooter()),
    ],
    components: [],
  });
}

// ─── Button: yes/no flow response ────────────────────────────────────────────

async function handleYesNo(interaction) {
  // customId: ticket:yn:yes:{ticketId}:{stepId}
  const parts    = interaction.customId.split(':');
  const choice   = parts[2]; // 'yes' or 'no'
  const ticketId = Number(parts[3]);
  const stepId   = Number(parts[4]);

  const ticket = ticketUtil.getTicketById(ticketId);
  if (!ticket) return interaction.update({ components: [] });

  // Only the ticket opener may respond
  if (interaction.user.id !== ticket.opener_id) {
    return interaction.reply({
      embeds: [errorEmbed('Not your ticket', 'Only the person who opened this ticket can respond to questions.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Verify the step is still the pending one (guards against double-clicking)
  if (ticket.pending_step_id !== stepId) {
    return interaction.update({ components: [] });
  }

  await resumeAfterYesNo(interaction, ticket, stepId, choice);
}

// ─── Internal: DM a transcript copy to the member who opened the ticket ───────

async function _dmOpenerTranscript(interaction, ticket, transcript) {
  if (!transcript) return;
  try {
    const opener = await interaction.client.users.fetch(ticket.opener_id);
    await opener.send({
      content: `Here is a copy of your ticket transcript (#${ticketUtil.ticketNo(ticket.id)} — ${ticket.topic || 'Other'}).`,
      files: [transcript],
    });
  } catch (err) {
    logger.warn(`Ticket #${ticket.id}: could not DM transcript to opener — ${err.message}`);
  }
}

// ─── Internal: post close log (embed + transcript) to the mod-log channel ─────

async function _logClose(interaction, ticket, files = []) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`🔒  Ticket #${ticketUtil.ticketNo(ticket.id)} closed`)
    .addFields(
      { name: 'Opener',   value: `<@${ticket.opener_id}>`, inline: true },
      { name: 'Category', value: ticket.topic || 'Other',  inline: true },
      { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true }
    )
    .setFooter(brandFooter());

  await logToModLog(interaction.client, interaction.guildId, embed, files);
}

module.exports = {
  handleTicketOpen,
  handleClose,
  handleCloseConfirm,
  handleCloseCancel,
  handleYesNo,
};
