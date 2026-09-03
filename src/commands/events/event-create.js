const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const pg = require('../../database/pg');
const config = require('../../utils/config');
const { CONFIG_KEYS } = require('../../constants');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { requireCommittee } = require('../../utils/permissions');
const { revalidateWebsite } = require('../../utils/websiteRevalidate');
const {
  EVENT_COLORS,
  EVENT_TYPE_LABELS,
  formatDuration,
  buildEventEmbed,
  buildRegisterRow,
  logToModLog,
  recountEvent,
} = require('../../utils/eventHandlers');

// Holds validated parameter state between the slash command and modal submit.
// Key: `${guildId}:${userId}` — deleted immediately after retrieval.
const pending = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event-create')
    .setDescription('Create a new event and post it to the events channel')
    .addStringOption(opt =>
      opt.setName('type').setDescription('Event type').setRequired(true)
        .addChoices(
          { name: 'Workshop',          value: 'workshop'          },
          { name: 'Hackathon',         value: 'hackathon'         },
          { name: 'Research Salon',    value: 'research_salon'    },
          { name: 'Committee Meeting', value: 'committee_meeting' },
          { name: 'Tabling',           value: 'tabling'           },
        )
    )
    .addStringOption(opt =>
      opt.setName('datetime')
        .setDescription('Date and time — format: HH:MM DD-MM-YYYY (e.g. 14:00 15-06-2026)')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1)
    )
    .addBooleanOption(opt =>
      opt.setName('ping').setDescription('Send @everyone after posting the event embed').setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('organizer1').setDescription('Primary organiser').setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('organizer2').setDescription('Additional organiser').setRequired(false)
    )
    .addUserOption(opt =>
      opt.setName('organizer3').setDescription('Additional organiser').setRequired(false)
    )
    .addUserOption(opt =>
      opt.setName('organizer4').setDescription('Additional organiser').setRequired(false)
    )
    .addUserOption(opt =>
      opt.setName('organizer5').setDescription('Additional organiser').setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireCommittee(interaction))) return;

    const type     = interaction.options.getString('type');
    const datetime = interaction.options.getString('datetime');
    const duration = interaction.options.getInteger('duration');
    const ping     = interaction.options.getBoolean('ping');

    // Collect unique organizers
    const organizerUsers = [];
    for (let i = 1; i <= 5; i++) {
      const u = interaction.options.getUser(`organizer${i}`);
      if (u && !organizerUsers.some(o => o.id === u.id)) organizerUsers.push(u);
    }

    // Validate datetime before showing the modal so the user gets instant feedback
    const match = datetime.trim().match(/^(\d{2}):(\d{2})\s+(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid date/time', 'Use the format `HH:MM DD-MM-YYYY`.\nExample: `14:00 15-06-2026`')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const [, hour, minute, day, month, year] = match;
    // No Z suffix — parsed as local time (bot server timezone = UK), matching what the user typed
    const startsAt = Math.floor(new Date(`${year}-${month}-${day}T${hour}:${minute}:00`).getTime() / 1000);

    if (!isFinite(startsAt)) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid date/time', 'Could not parse that date — please double-check the values.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const now = Math.floor(Date.now() / 1000);
    if (startsAt <= now) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid date/time', 'The event must be scheduled in the future.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Confirm the events channel is configured before opening the modal
    const eventChannelIds = config.getValues(interaction.guildId, CONFIG_KEYS.EVENTS_CHANNEL);
    if (!eventChannelIds.length) {
      return interaction.reply({
        embeds: [errorEmbed('No events channel', 'Configure an events channel first with `/setup-add`.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Stash validated state so the modal handler can retrieve it
    pending.set(`${interaction.guildId}:${interaction.user.id}`, {
      type, duration, ping, startsAt,
      organizerIds:   organizerUsers.map(u => u.id),
      eventChannelId: eventChannelIds[0],
    });

    const modal = new ModalBuilder()
      .setCustomId('event_create')
      .setTitle('Create Event');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Event Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('location')
          .setLabel('Location')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
      ),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const key   = `${interaction.guildId}:${interaction.user.id}`;
    const state = pending.get(key);
    pending.delete(key);

    if (!state) {
      return interaction.reply({
        embeds: [errorEmbed('Session expired', 'The command session expired. Please run `/event-create` again.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const name        = interaction.fields.getTextInputValue('name').trim();
    const location    = interaction.fields.getTextInputValue('location').trim();
    const description = interaction.fields.getTextInputValue('description').trim() || null;

    const { type, duration, ping, startsAt, organizerIds, eventChannelId } = state;

    const eventsChannel = await interaction.client.channels.fetch(eventChannelId).catch(() => null);
    if (!eventsChannel) {
      return interaction.reply({
        embeds: [errorEmbed('Channel not found', 'The configured events channel could not be fetched.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const now = Math.floor(Date.now() / 1000);

    const { rows: [{ id: eventId }] } = await pg.query(
      `INSERT INTO events
         (name, type, location, description, starts_at, ends_at, duration_minutes, ping, created_by, guild_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        name, type, location, description,
        startsAt, startsAt + duration * 60,
        duration, ping,
        interaction.user.id, interaction.guildId, now,
      ],
    );

    for (const orgId of organizerIds) {
      await pg.query(
        'INSERT INTO event_organizers (event_id, discord_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [eventId, orgId],
      );
      await pg.query(
        `INSERT INTO event_registrations (event_id, discord_id, registered_at, attended, withdrawn)
         VALUES ($1, $2, $3, false, false)
         ON CONFLICT (event_id, discord_id) DO NOTHING`,
        [eventId, orgId, now],
      );
    }

    await pg.query(
      `INSERT INTO event_reminders (event_id, type, sent)
       VALUES ($1, '1day', false), ($1, '1hour', false)
       ON CONFLICT DO NOTHING`,
      [eventId],
    );

    await recountEvent(eventId);

    const eventRow = { id: eventId, name, type, location, description, starts_at: startsAt, duration_minutes: duration };
    const embed    = buildEventEmbed(eventRow, organizerIds, organizerIds.length);
    const row      = buildRegisterRow(eventId);

    const message = await eventsChannel.send({ embeds: [embed], components: [row] });

    await pg.query(
      'UPDATE events SET message_id = $1, event_channel_id = $2 WHERE id = $3',
      [message.id, eventsChannel.id, eventId],
    );

    revalidateWebsite(['events']).catch(() => {});

    if (ping) {
      await eventsChannel.send('@everyone');
    }

    const organizerMentions = organizerIds.map(id => `<@${id}>`).join(', ');
    const logEmbed = new EmbedBuilder()
      .setColor(EVENT_COLORS[type] || 0x5865f2)
      .setTitle(`✨⠀New Event Created: ${name}`)
      .addFields(
        { name: 'Type',         value: EVENT_TYPE_LABELS[type] || type,  inline: true  },
        { name: 'Location',     value: location,                          inline: true  },
        { name: 'Time',         value: `<t:${startsAt}:F>`,              inline: true  },
        { name: 'Duration',     value: formatDuration(duration),          inline: true  },
        { name: 'Organiser(s)', value: organizerMentions,                 inline: false },
        { name: 'Created by',   value: `<@${interaction.user.id}>`,       inline: true  },
        { name: 'Ping sent',    value: ping ? 'Yes' : 'No',              inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: 'CBC Events' });

    await logToModLog(interaction.client, interaction.guildId, logEmbed);

    await interaction.editReply({
      embeds: [successEmbed('Event created!', `**${name}** has been posted to ${eventsChannel}.`)],
    });
  },
};
