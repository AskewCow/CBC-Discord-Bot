const db = require('../database/db');
const { brandFooter } = require('./embeds');
const config = require('./config');
const { stepTable } = require('./stepFlow');
const { nowSec } = require('./time');
const { mentionConfigured } = require('./mentions');
const { CONFIG_KEYS } = require('../constants');
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

// Zero-padded ticket number for display / channel names, e.g. 2 -> "0002"
const ticketNo = id => String(id).padStart(4, '0');

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
  const now = nowSec();
  return db
    .prepare(
      'INSERT INTO ticket_panels (guild_id, channel_id, title, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(guildId, channelId, title, description, createdBy, now, now).lastInsertRowid;
}

function updatePanelContent(panelId, title, description) {
  const now = nowSec();
  db.prepare('UPDATE ticket_panels SET title = ?, description = ?, updated_at = ? WHERE id = ?')
    .run(title, description, now, panelId);
}

function setPanelMessageId(panelId, messageId) {
  db.prepare('UPDATE ticket_panels SET message_id = ? WHERE id = ?').run(messageId, panelId);
}

// Options and their flow steps cascade via ON DELETE CASCADE (foreign_keys=ON).
function deletePanel(panelId) {
  db.prepare('DELETE FROM ticket_panels WHERE id = ?').run(panelId);
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

const flowSteps = stepTable({
  table: 'ticket_flow_steps',
  parentCol: 'option_id',
  columns: ['step_type', 'content', 'yes_content', 'no_content'],
});

const getFlowSteps   = (optionId) => flowSteps.list(optionId);
const getFlowStep    = (stepId) => flowSteps.get(stepId);
const addFlowStep    = (optionId, stepType, content, yesContent, noContent) =>
  flowSteps.add(optionId, stepType, content, yesContent, noContent);
const removeFlowStep = (stepId) => flowSteps.remove(stepId);
const clearFlowSteps = (optionId) => flowSteps.clear(optionId);

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
  const now = nowSec();
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
    .setFooter(brandFooter('A private support channel will be created just for you.'));

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
    .setTitle(`🎫  Ticket #${ticketNo(ticketId)}`)
    .setDescription(
      `Hey ${opener.toString()}! Your ticket has been received.\n\n` +
      `Please describe your issue in as much detail as possible, and a staff member will be with you shortly.`
    )
    .addFields({ name: 'Category', value: topic || 'Other', inline: true })
    .setFooter(brandFooter('Use the button below to close this ticket when your issue is resolved.'));
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

// Ephemeral confirm/cancel prompt shown before a ticket is actually closed.
// Shared by the "Close Ticket" button and the /ticket-close command. Returns a
// message payload fragment — spread it into interaction.reply().
function buildClosePrompt(ticketId) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('Close this ticket?')
        .setDescription('A copy of the transcript will be sent to the person who opened this ticket, then this channel will be permanently deleted. This cannot be undone.')
        .setFooter(brandFooter()),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:close_confirm:${ticketId}`)
          .setLabel('Confirm Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId(`ticket:close_cancel:${ticketId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

// Flow-text placeholders. Each {token} in a flow step is replaced with a live
// mention of the matching configured channel/role, or a plain-word fallback
// when that setting is unset. Unknown {tokens} are left untouched.
const FLOW_PLACEHOLDERS = {
  faq:           { key: 'faq_channel',           type: 'channel', fallback: 'FAQ' },
  announcements: { key: 'announcements_channel', type: 'channel', fallback: 'announcements' },
  events:        { key: 'events_channel',        type: 'channel', fallback: 'events' },
  general:       { key: 'general_channel',       type: 'channel', fallback: 'general' },
  projects:      { key: 'projects_channel',      type: 'channel', fallback: 'projects' },
  'mod-log':     { key: 'mod_log_channel',       type: 'channel', fallback: 'mod-log' },
  ambassador:    { key: 'ambassador_role',       type: 'role',    fallback: '@ambassadors' },
  committee:     { key: 'committee_role',        type: 'role',    fallback: '@committee' },
  member:        { key: 'member_role',           type: 'role',    fallback: '@members' },
};

function renderFlowContent(content, guildId) {
  if (!content) return content;
  return content.replace(/\{([a-z-]+)\}/gi, (match, rawToken) => {
    const def = FLOW_PLACEHOLDERS[rawToken.toLowerCase()];
    if (!def) return match;
    return mentionConfigured(guildId, def.key, { type: def.type, fallback: def.fallback });
  });
}

function buildFlowEmbed(content, guildId) {
  return new EmbedBuilder()
    .setColor(TICKET_COLOR)
    .setDescription(renderFlowContent(content, guildId));
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
      .setEmoji('✖️')
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
      .setEmoji('✖️')
      .setDisabled(true)
  );
}

// ─── Channel creation ─────────────────────────────────────────────────────────

async function createTicketChannel(guild, opener, topic, panelId, optionId) {
  const categories      = config.getValues(guild.id, CONFIG_KEYS.TICKET_CATEGORY);
  const ambassadorRoles = config.getValues(guild.id, CONFIG_KEYS.AMBASSADOR_ROLE);
  const commRoles       = config.getValues(guild.id, CONFIG_KEYS.COMMITTEE_ROLE);

  const now = nowSec();

  // Reserve a row first to get the auto-increment ID for the channel name
  const result = db
    .prepare(
      'INSERT INTO tickets (channel_id, opener_id, guild_id, status, topic, panel_id, option_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run('__pending__', opener.id, guild.id, 'open', topic || 'Other', panelId || null, optionId || null, now);

  const ticketId    = result.lastInsertRowid;
  const channelName = `ticket-${ticketNo(ticketId)}`;

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
    ...ambassadorRoles.map(id => ({ id, allow: staffAllow })),
    ...commRoles.map(id       => ({ id, allow: staffAllow })),
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
  deletePanel,
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
  clearFlowSteps,
  // tickets
  getTicketByChannelId,
  getTicketById,
  getOpenTicketByOpener,
  setTicketPendingStep,
  closeTicket,
  ticketNo,
  // builders
  buildPanelMessage,
  buildWelcomeEmbed,
  buildCloseButton,
  buildClosePrompt,
  buildFlowEmbed,
  renderFlowContent,
  buildYesNoRow,
  buildDisabledYesNoRow,
  // channel ops
  createTicketChannel,
};
