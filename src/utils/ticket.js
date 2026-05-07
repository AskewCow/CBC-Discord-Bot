const db = require('../database/db');
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const TICKET_COLOR = 0x5865f2;

// ─── DB helpers — panels ──────────────────────────────────────────────────────

function getPanelForChannel(guildId, channelId) {
  return db
    .prepare('SELECT * FROM ticket_panels WHERE guild_id = ? AND channel_id = ? LIMIT 1')
    .get(guildId, channelId);
}

function getOptionsForGuild(guildId) {
  return db
    .prepare(
      'SELECT o.* FROM ticket_options o ' +
      'JOIN ticket_panels p ON p.id = o.panel_id ' +
      'WHERE p.guild_id = ? ORDER BY o.position, o.id'
    )
    .all(guildId);
}

function createPanel(guildId, channelId, createdBy, title, description) {
  const now = Math.floor(Date.now() / 1000);
  return db
    .prepare(
      'INSERT INTO ticket_panels (guild_id, channel_id, title, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(guildId, channelId, title, description, createdBy, now, now).lastInsertRowid;
}

function updatePanelContent(panelId, title, description) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE ticket_panels SET title = ?, description = ?, updated_at = ? WHERE id = ?')
    .run(title, description, now, panelId);
}

function setPanelMessageId(panelId, messageId) {
  db.prepare('UPDATE ticket_panels SET message_id = ? WHERE id = ?').run(messageId, panelId);
}

// ─── DB helpers — options ─────────────────────────────────────────────────────

function getOptionsForPanel(panelId) {
  return db
    .prepare('SELECT * FROM ticket_options WHERE panel_id = ? ORDER BY position, id')
    .all(panelId);
}

function getOptionById(id) {
  return db.prepare('SELECT * FROM ticket_options WHERE id = ?').get(id);
}

function getOptionByLabel(panelId, label) {
  return db
    .prepare('SELECT * FROM ticket_options WHERE panel_id = ? AND lower(label) = lower(?)')
    .get(panelId, label);
}

function addOption(panelId, label, description, emoji) {
  const { m: maxPos } = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM ticket_options WHERE panel_id = ?')
    .get(panelId);
  return db
    .prepare(
      'INSERT INTO ticket_options (panel_id, label, description, emoji, position) VALUES (?, ?, ?, ?, ?)'
    )
    .run(panelId, label, description || null, emoji || null, maxPos + 1).lastInsertRowid;
}

function removeOption(optionId) {
  db.prepare('DELETE FROM ticket_options WHERE id = ?').run(optionId);
}

// ─── DB helpers — flow steps ──────────────────────────────────────────────────

function getFlowSteps(optionId) {
  return db
    .prepare('SELECT * FROM ticket_flow_steps WHERE option_id = ? ORDER BY step_order, id')
    .all(optionId);
}

function getFlowStep(stepId) {
  return db.prepare('SELECT * FROM ticket_flow_steps WHERE id = ?').get(stepId);
}

function addFlowStep(optionId, stepType, content, yesContent, noContent) {
  const { m: maxOrder } = db
    .prepare(
      'SELECT COALESCE(MAX(step_order), -1) AS m FROM ticket_flow_steps WHERE option_id = ?'
    )
    .get(optionId);
  return db
    .prepare(
      'INSERT INTO ticket_flow_steps (option_id, step_order, step_type, content, yes_content, no_content) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(optionId, maxOrder + 1, stepType, content, yesContent || null, noContent || null)
    .lastInsertRowid;
}

function removeFlowStep(stepId) {
  db.prepare('DELETE FROM ticket_flow_steps WHERE id = ?').run(stepId);
}

// ─── DB helpers — tickets ─────────────────────────────────────────────────────

function getTicketByChannelId(channelId) {
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function getTicketById(id) {
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
}

function getOpenTicketByOpener(guildId, openerId) {
  return db
    .prepare("SELECT * FROM tickets WHERE guild_id = ? AND opener_id = ? AND status = 'open' LIMIT 1")
    .get(guildId, openerId);
}

function setTicketPendingStep(ticketId, stepId) {
  db.prepare('UPDATE tickets SET pending_step_id = ? WHERE id = ?').run(stepId ?? null, ticketId);
}

function closeTicket(ticketId) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "UPDATE tickets SET status = 'closed', closed_at = ?, pending_step_id = NULL WHERE id = ?"
  ).run(now, ticketId);
}

// ─── Embed / component builders ───────────────────────────────────────────────

function buildPanelMessage(panel, options) {
  const embed = new EmbedBuilder()
    .setColor(TICKET_COLOR)
    .setTitle(`🎫  ${panel.title}`)
    .setDescription(panel.description)
    .setFooter({ text: 'A private support channel will be created just for you.' });

  const selectOptions = options.map(opt => {
    const o = { label: opt.label.slice(0, 100), value: `opt:${opt.id}` };
    if (opt.description) o.description = opt.description.slice(0, 100);
    if (opt.emoji)       o.emoji = opt.emoji;
    return o;
  });

  // "Other" is always the last option
  selectOptions.push({
    label:       'Other',
    value:       'opt:other',
    description: 'General question or issue not listed above',
    emoji:       '❓',
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:open')
    .setPlaceholder('Select a category to open a ticket…')
    .addOptions(selectOptions);

  return { embed, components: [new ActionRowBuilder().addComponents(menu)] };
}

function buildWelcomeEmbed(ticketId, opener, topic) {
  return new EmbedBuilder()
    .setColor(TICKET_COLOR)
    .setTitle(`🎫  Ticket #${String(ticketId).padStart(4, '0')}`)
    .setDescription(
      `Hey ${opener.toString()}! Your ticket has been received.\n\n` +
      `Please describe your issue in as much detail as possible, and a staff member will be with you shortly.`
    )
    .addFields({ name: 'Category', value: topic || 'Other', inline: true })
    .setFooter({ text: 'Use the button below to close this ticket when your issue is resolved.' })
    .setTimestamp();
}

function buildCloseButton(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );
}

function buildFlowEmbed(content) {
  return new EmbedBuilder().setColor(TICKET_COLOR).setDescription(content);
}

function buildYesNoRow(ticketId, stepId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:yn:yes:${ticketId}:${stepId}`)
      .setLabel('Yes')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`ticket:yn:no:${ticketId}:${stepId}`)
      .setLabel('No')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
}

function buildDisabledYesNoRow(chosen) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:yn:done_yes')
      .setLabel('Yes')
      .setStyle(chosen === 'yes' ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji('✅')
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('ticket:yn:done_no')
      .setLabel('No')
      .setStyle(chosen === 'no' ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setEmoji('❌')
      .setDisabled(true)
  );
}

// ─── Channel creation ─────────────────────────────────────────────────────────

async function createTicketChannel(guild, opener, topic, panelId, optionId) {
  const cfg       = require('./config');
  const categories = cfg.getValues(guild.id, 'ticket_category');
  const adminRoles = cfg.getValues(guild.id, 'admin_role');
  const commRoles  = cfg.getValues(guild.id, 'committee_role');

  const now = Math.floor(Date.now() / 1000);

  // Reserve a row first to get the auto-increment ID for the channel name
  const result = db
    .prepare(
      'INSERT INTO tickets (channel_id, opener_id, guild_id, status, topic, panel_id, option_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run('__pending__', opener.id, guild.id, 'open', topic || 'Other', panelId || null, optionId || null, now);

  const ticketId    = result.lastInsertRowid;
  const channelName = `ticket-${String(ticketId).padStart(4, '0')}`;

  const staffAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ManageChannels,
  ];
  const openerAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
  ];

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: opener.id, allow: openerAllow },
    ...adminRoles.map(id => ({ id, allow: staffAllow })),
    ...commRoles.map(id  => ({ id, allow: staffAllow })),
  ];

  const channel = await guild.channels.create({
    name:                 channelName,
    type:                 ChannelType.GuildText,
    parent:               categories[0] || null,
    permissionOverwrites,
    reason:               `Ticket opened by ${opener.tag ?? opener.username}`,
  });

  db.prepare('UPDATE tickets SET channel_id = ? WHERE id = ?').run(channel.id, ticketId);

  return { channel, ticketId };
}

// ─── Panel posting ────────────────────────────────────────────────────────────

async function postPanel(guild, panel) {
  const options = getOptionsForPanel(panel.id);
  const { embed, components } = buildPanelMessage(panel, options);

  let panelChannel;
  try {
    panelChannel = await guild.channels.fetch(panel.channel_id);
  } catch {
    throw new Error('Ticket panel channel not found or inaccessible.');
  }

  if (panel.message_id) {
    try {
      const existing = await panelChannel.messages.fetch(panel.message_id);
      await existing.edit({ embeds: [embed], components });
      return;
    } catch {
      // Message gone — fall through and send a new one
    }
  }

  const msg = await panelChannel.send({ embeds: [embed], components });
  setPanelMessageId(panel.id, msg.id);
}

module.exports = {
  // panels
  getPanelForChannel,
  getOptionsForGuild,
  createPanel,
  updatePanelContent,
  setPanelMessageId,
  postPanel,
  // options
  getOptionsForPanel,
  getOptionById,
  getOptionByLabel,
  addOption,
  removeOption,
  // flow steps
  getFlowSteps,
  getFlowStep,
  addFlowStep,
  removeFlowStep,
  // tickets
  getTicketByChannelId,
  getTicketById,
  getOpenTicketByOpener,
  setTicketPendingStep,
  closeTicket,
  // builders
  buildPanelMessage,
  buildWelcomeEmbed,
  buildCloseButton,
  buildFlowEmbed,
  buildYesNoRow,
  buildDisabledYesNoRow,
  // channel ops
  createTicketChannel,
};
