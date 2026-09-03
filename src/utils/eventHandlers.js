const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const db = require('../database/db');   // SQLite — event_thank_you only
const pg = require('../database/pg');   // Postgres — events + registrations + organizers
const logger = require('./logger');
const config = require('./config');
const { CONFIG_KEYS } = require('../constants');
const { revalidateWebsite } = require('./websiteRevalidate');

// ── Anthropic brand colours per event type ────────────────────────────────────
const EVENT_COLORS = {
  workshop:          0x6A9BCC, // Sky
  hackathon:         0xD97757, // Terracotta
  research_salon:    0x788C5D, // Sage
  committee_meeting: 0xCD9D7D, // Sand
  tabling:           0xE8E6DC, // Mist
};

const EVENT_TYPE_LABELS = {
  workshop:          'Workshop',
  hackathon:         'Hackathon',
  research_salon:    'Research Salon',
  committee_meeting: 'Committee Meeting',
  tabling:           'Tabling',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hStr = `${h} hour${h !== 1 ? 's' : ''}`;
  if (m === 0) return hStr;
  return `${hStr} ${m} minute${m !== 1 ? 's' : ''}`;
}

// Keep the website's denormalised counters on the events row in step with the
// registration rows.
async function recountEvent(eventId) {
  const { rows } = await pg.query(
    `UPDATE events e SET
       registered_count = c.reg,
       attended_count   = c.att
     FROM (
       SELECT
         count(*) FILTER (WHERE withdrawn = false) AS reg,
         count(*) FILTER (WHERE attended  = true)  AS att
       FROM event_registrations WHERE event_id = $1
     ) c
     WHERE e.id = $1
     RETURNING e.registered_count AS registered, e.attended_count AS attended`,
    [eventId],
  );
  return rows[0] ?? { registered: 0, attended: 0 };
}

function buildEventEmbed(event, organizers, participantCount, ended = false) {
  const color = EVENT_COLORS[event.type] || 0x5865f2;
  const organizerMentions = organizers.length
    ? organizers.map(id => `<@${id}>`).join(', ')
    : 'N/A';

  const now    = Math.floor(Date.now() / 1000);
  const endsAt = event.starts_at + (event.duration_minutes || 0) * 60;
  const isEnded   = ended || now >= endsAt;
  const isOngoing = !isEnded && now >= event.starts_at;

  let timeValue;
  if (isEnded) {
    timeValue = `<t:${event.starts_at}:F>\n*Ended*`;
  } else if (isOngoing) {
    timeValue = `*Happening now!*`;
  } else {
    timeValue = `<t:${event.starts_at}:F>\n*<t:${event.starts_at}:R>*`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(event.name)
    .addFields(
      { name: 'Type',         value: EVENT_TYPE_LABELS[event.type] || event.type, inline: true },
      { name: 'Location',     value: event.location || 'TBD',                     inline: true },
      { name: '​',       value: '​',                                    inline: true },
      { name: 'Organiser(s)', value: organizerMentions,                           inline: false },
      { name: 'Time',         value: timeValue,                                   inline: true },
      { name: 'Duration',     value: formatDuration(event.duration_minutes),      inline: true },
      { name: '​',       value: '​',                                    inline: true },
      { name: 'Participants', value: `${participantCount}`,                       inline: true },
    )
    .setFooter({ text: isEnded ? 'This event has ended.' : 'CBC Events' })
    .setTimestamp();

  if (event.description) embed.setDescription(event.description);
  return embed;
}

function buildRegisterRow(eventId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:register:${eventId}`)
      .setLabel('Register')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

function buildCancelledEmbed(event) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`❌⠀~~${event.name}~~ — Cancelled`)
    .setDescription('This event has been cancelled. We apologise for any inconvenience.')
    .setFooter({ text: 'CBC Events' })
    .setTimestamp();
}

function buildWithdrawRow(eventId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:withdraw:${eventId}`)
      .setLabel('Withdraw Registration')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

function buildAttendanceRow(eventId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:attend:yes:${eventId}`)
      .setLabel('Yes, I attended!')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`event:attend:no:${eventId}`)
      .setLabel("No, I couldn't make it")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function buildRegistrationDMEmbed(event, organizers) {
  const color = EVENT_COLORS[event.type] || 0x5865f2;
  const organizerMentions = organizers.length
    ? organizers.map(id => `<@${id}>`).join(', ')
    : 'N/A';

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎉⠀You're registered for ${event.name}!`)
    .setDescription("See you there! If you can no longer make it, use the button below to withdraw your registration.")
    .addFields(
      { name: 'Organiser(s)', value: organizerMentions,                      inline: false },
      { name: 'Location',     value: event.location || 'TBD',                inline: true  },
      { name: 'Time',         value: `<t:${event.starts_at}:F>`,             inline: true  },
      { name: 'Duration',     value: formatDuration(event.duration_minutes),  inline: true  },
    )
    .setFooter({ text: 'CBC Events' })
    .setTimestamp();
}

async function updateEventEmbed(client, event, ended = false, opts = {}) {
  try {
    if (!event.event_channel_id || !event.message_id) return;

    const organizers = opts.organizers ?? (await pg.all(
      'SELECT discord_id FROM event_organizers WHERE event_id = $1', [event.id],
    )).map(r => r.discord_id);
    const cnt = opts.participantCount ?? (await pg.get(
      'SELECT count(*)::int AS cnt FROM event_registrations WHERE event_id = $1 AND withdrawn = false',
      [event.id],
    )).cnt;

    const channel = await client.channels.fetch(event.event_channel_id).catch(() => null);
    if (!channel) return;
    const message = await channel.messages.fetch(event.message_id).catch(() => null);
    if (!message) return;

    await message.edit({
      embeds:     [buildEventEmbed(event, organizers, cnt, ended)],
      components: [buildRegisterRow(event.id, ended)],
    });
  } catch (err) {
    logger.warn(`Could not update event embed (${event.id}): ${err.message}`);
  }
}

async function notifyOrganizers(client, event, userTag, totalCount, action, organizers) {
  const orgs = organizers ?? (await pg.all(
    'SELECT discord_id FROM event_organizers WHERE event_id = $1', [event.id],
  )).map(r => r.discord_id);
  const notifyIds = [...new Set([...orgs, event.created_by])];

  const registered = action === 'registered';
  const embed = new EmbedBuilder()
    .setColor(registered ? 0x57f287 : 0xed4245)
    .setTitle(`${registered ? '✅⠀New Registration' : '❌⠀Withdrawal'}: ${event.name}`)
    .addFields(
      { name: 'User',               value: userTag,          inline: true },
      { name: 'Total Participants', value: `${totalCount}`,  inline: true },
    )
    .setFooter({ text: 'CBC Events' })
    .setTimestamp();

  for (const userId of notifyIds) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
    } catch (err) {
      logger.warn(`Could not notify organizer ${userId}: ${err.message}`);
    }
  }
}

async function logToModLog(client, guildId, embed, files = []) {
  const channelIds = config.getValues(guildId, CONFIG_KEYS.MOD_LOG_CHANNEL);
  if (!channelIds.length) return;
  const channel = await client.channels.fetch(channelIds[0]).catch(() => null);
  if (!channel) return;
  await channel.send({ embeds: [embed], files }).catch(err =>
    logger.warn(`Could not post to mod log: ${err.message}`)
  );
}

// ── Button handlers ───────────────────────────────────────────────────────────

async function handleRegister(interaction) {
  const eventId = parseInt(interaction.customId.split(':')[2]);
  const userId  = interaction.user.id;
  const now     = Math.floor(Date.now() / 1000);

  const event = await pg.get('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!event) {
    return interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });
  }

  if (event.starts_at + event.duration_minutes * 60 <= now) {
    return interaction.reply({ content: 'This event has already ended.', flags: MessageFlags.Ephemeral });
  }

  const existing = await pg.get(
    'SELECT * FROM event_registrations WHERE event_id = $1 AND discord_id = $2',
    [eventId, userId],
  );

  if (existing && !existing.withdrawn) {
    return interaction.reply({
      content: "You're already registered! Check your DMs to manage your registration.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const organizers = (await pg.all(
    'SELECT discord_id FROM event_organizers WHERE event_id = $1', [eventId],
  )).map(r => r.discord_id);

  if (existing) {
    await pg.query(
      'UPDATE event_registrations SET withdrawn = false, registered_at = $1, dm_message_id = NULL WHERE event_id = $2 AND discord_id = $3',
      [now, eventId, userId],
    );
  } else {
    await pg.query(
      'INSERT INTO event_registrations (event_id, discord_id, registered_at, attended, withdrawn) VALUES ($1, $2, $3, false, false)',
      [eventId, userId, now],
    );
  }

  const { registered: cnt } = await recountEvent(eventId);

  // Send DM confirmation
  let dmMessageId = null;
  try {
    const dm = await interaction.user.send({
      embeds:     [buildRegistrationDMEmbed(event, organizers)],
      components: [buildWithdrawRow(eventId)],
    });
    dmMessageId = dm.id;
  } catch (err) {
    logger.warn(`Could not send registration DM to ${userId}: ${err.message}`);
  }

  if (dmMessageId) {
    await pg.query(
      'UPDATE event_registrations SET dm_message_id = $1 WHERE event_id = $2 AND discord_id = $3',
      [dmMessageId, eventId, userId],
    );
  }

  await updateEventEmbed(interaction.client, event, false, { organizers, participantCount: cnt });
  await notifyOrganizers(
    interaction.client, event,
    `<@${userId}> (${interaction.user.tag})`,
    cnt, 'registered', organizers
  );
  revalidateWebsite(['events']).catch(() => {});

  await interaction.editReply({
    content: dmMessageId
      ? "You're registered! Check your DMs for a confirmation."
      : "You're registered! (Enable DMs from server members to receive a confirmation.)",
  });
}

async function handleWithdraw(interaction) {
  const eventId = parseInt(interaction.customId.split(':')[2]);
  const userId  = interaction.user.id;

  const event = await pg.get('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!event) {
    return interaction.update({
      embeds:     [new EmbedBuilder().setColor(0xed4245).setTitle('❌⠀Event not found.')],
      components: [],
    });
  }

  const registration = await pg.get(
    'SELECT * FROM event_registrations WHERE event_id = $1 AND discord_id = $2',
    [eventId, userId],
  );

  if (!registration || registration.withdrawn) {
    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(`↩️⠀Withdrawn from ${event.name}`)
        .setDescription("You're not currently registered for this event.")
        .setTimestamp()],
      components: [],
    });
  }

  await pg.query(
    'UPDATE event_registrations SET withdrawn = true WHERE event_id = $1 AND discord_id = $2',
    [eventId, userId],
  );

  const { registered: cnt } = await recountEvent(eventId);

  await interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`↩️⠀Withdrawn from ${event.name}`)
      .setDescription('You have been removed from the participant list. You can re-register at any time using the event message.')
      .setFooter({ text: 'CBC Events' })
      .setTimestamp()],
    components: [],
  });

  await updateEventEmbed(interaction.client, event, false, { participantCount: cnt });
  await notifyOrganizers(
    interaction.client, event,
    `<@${userId}> (${interaction.user.tag})`,
    cnt, 'withdrew'
  );
  revalidateWebsite(['events']).catch(() => {});
}

async function handleAttend(interaction) {
  const parts   = interaction.customId.split(':'); // event:attend:yes/no:eventId
  const answer  = parts[2];
  const eventId = parseInt(parts[3]);
  const userId  = interaction.user.id;

  const event = await pg.get('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!event) {
    return interaction.update({
      embeds:     [new EmbedBuilder().setColor(0xed4245).setTitle('❌⠀Event not found.')],
      components: [],
    });
  }

  if (answer === 'yes') {
    await pg.query(
      'UPDATE event_registrations SET attended = true WHERE event_id = $1 AND discord_id = $2',
      [eventId, userId],
    );
    await recountEvent(eventId);
    revalidateWebsite(['events']).catch(() => {});
  }

  const thankYou = db.prepare('SELECT * FROM event_thank_you WHERE guild_id = ?').get(event.guild_id);
  const thankMsg = thankYou?.message || 'Thank you for attending! We hope to see you at our next event.';

  let responseEmbed;
  if (answer === 'yes') {
    const descParts = [thankMsg];
    if (thankYou?.link_url && thankYou?.link_text) {
      descParts.push(`\n[${thankYou.link_text}](${thankYou.link_url})`);
    }
    responseEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🎊⠀Thanks for attending ${event.name}!`)
      .setDescription(descParts.join('\n'))
      .setFooter({ text: 'CBC Events' })
      .setTimestamp();
  } else {
    responseEmbed = new EmbedBuilder()
      .setColor(EVENT_COLORS[event.type] || 0x5865f2)
      .setTitle(`👋⠀${event.name}`)
      .setDescription("Hope to see you next time! Don't worry about missing this one.")
      .setFooter({ text: 'CBC Events' })
      .setTimestamp();
  }

  await interaction.update({ embeds: [responseEmbed], components: [] });

  // Log attendance to mod log
  const organizers = (await pg.all(
    'SELECT discord_id FROM event_organizers WHERE event_id = $1', [eventId],
  )).map(r => r.discord_id);

  const logEmbed = new EmbedBuilder()
    .setColor(answer === 'yes' ? 0x57f287 : 0xed4245)
    .setTitle(`📋⠀Attendance Logged: ${event.name}`)
    .addFields(
      { name: 'User',          value: `<@${userId}>`,                                      inline: true  },
      { name: 'Attended',      value: answer === 'yes' ? 'Yes ✅' : 'No ❌',              inline: true  },
      { name: 'Organiser(s)',  value: organizers.map(id => `<@${id}>`).join(', ') || 'N/A', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'CBC Events' });

  await logToModLog(interaction.client, event.guild_id, logEmbed);
}

module.exports = {
  EVENT_COLORS,
  EVENT_TYPE_LABELS,
  formatDuration,
  recountEvent,
  buildEventEmbed,
  buildCancelledEmbed,
  buildRegisterRow,
  buildWithdrawRow,
  buildAttendanceRow,
  buildRegistrationDMEmbed,
  updateEventEmbed,
  notifyOrganizers,
  logToModLog,
  handleRegister,
  handleWithdraw,
  handleAttend,
};
