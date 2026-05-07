const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { isAdmin } = require('../../utils/permissions');
const {
  EVENT_COLORS,
  EVENT_TYPE_LABELS,
  formatDuration,
  buildCancelledEmbed,
  logToModLog,
} = require('../../utils/eventHandlers');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event-delete')
    .setDescription('Cancel and delete an event, notifying all registered participants.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('event')
        .setDescription('The event to delete')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const now = Math.floor(Date.now() / 1000);

    // List non-ended events for this guild, newest first
    const events = db.prepare(`
      SELECT id, name FROM events
      WHERE guild_id = ? AND (starts_at + duration_minutes * 60) > ?
      ORDER BY starts_at ASC
      LIMIT 25
    `).all(interaction.guildId, now);

    const filtered = focused
      ? events.filter(e => e.name.toLowerCase().includes(focused))
      : events;

    await interaction.respond(filtered.map(e => ({ name: e.name, value: String(e.id) })));
  },

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied', 'This command is restricted to admins.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const eventId = parseInt(interaction.options.getString('event'));
    const event   = db.prepare('SELECT * FROM events WHERE id = ? AND guild_id = ?').get(eventId, interaction.guildId);

    if (!event) {
      return interaction.reply({
        embeds: [errorEmbed('Event not found', 'That event does not exist or has already been deleted.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const organizers = db.prepare('SELECT discord_id FROM event_organizers WHERE event_id = ?')
      .all(eventId).map(r => r.discord_id);

    const participants = db.prepare(
      'SELECT discord_id FROM event_registrations WHERE event_id = ? AND withdrawn = 0'
    ).all(eventId).map(r => r.discord_id);

    // Edit the event embed in #events to show cancellation
    if (event.event_channel_id && event.message_id) {
      try {
        const eventsChannel = await interaction.client.channels.fetch(event.event_channel_id).catch(() => null);
        if (eventsChannel) {
          const message = await eventsChannel.messages.fetch(event.message_id).catch(() => null);
          if (message) {
            await message.edit({ embeds: [buildCancelledEmbed(event)], components: [] });
          }
        }
      } catch (err) {
        logger.warn(`Could not edit cancelled event embed (${eventId}): ${err.message}`);
      }
    }

    // DM all registered participants
    const cancelEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`🚫⠀Event Cancelled: ${event.name}`)
      .setDescription("We're sorry, but this event has been cancelled. We hope to see you at a future event!")
      .addFields(
        { name: 'Was scheduled for', value: `<t:${event.starts_at}:F>`, inline: true },
        { name: 'Location',          value: event.location || 'TBD',    inline: true },
      )
      .setFooter({ text: 'CBC Events' })
      .setTimestamp();

    for (const userId of participants) {
      try {
        const user = await interaction.client.users.fetch(userId);
        await user.send({ embeds: [cancelEmbed] });
      } catch (err) {
        logger.warn(`Could not send cancellation DM to ${userId}: ${err.message}`);
      }
    }

    // Log to mod log
    const organizerMentions = organizers.map(id => `<@${id}>`).join(', ') || 'N/A';
    const logEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`🗑️⠀Event Deleted: ${event.name}`)
      .addFields(
        { name: 'Type',              value: EVENT_TYPE_LABELS[event.type] || event.type, inline: true  },
        { name: 'Was scheduled for', value: `<t:${event.starts_at}:F>`,                 inline: true  },
        { name: 'Duration',          value: formatDuration(event.duration_minutes),      inline: true  },
        { name: 'Organiser(s)',       value: organizerMentions,                          inline: false },
        { name: 'Deleted by',        value: `<@${interaction.user.id}>`,                inline: true  },
        { name: 'Participants notified', value: `${participants.length}`,               inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: 'CBC Events' });

    await logToModLog(interaction.client, interaction.guildId, logEmbed);

    // Delete the event (cascade removes registrations, organizers, reminders, etc.)
    db.prepare('DELETE FROM events WHERE id = ?').run(eventId);

    await interaction.editReply({
      embeds: [successEmbed(
        'Event deleted',
        `**${event.name}** has been cancelled. ${participants.length} participant${participants.length !== 1 ? 's were' : ' was'} notified by DM.`,
      )],
    });
  },
};
