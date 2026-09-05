const pg = require('../database/pg');
const logger = require('./logger');
const { makeScheduler } = require('./scheduler');
const { mentionList, dmUsers } = require('./discord');
const { logToModLog, modLogEmbed } = require('./modLog');
const {
  eventColor,
  formatDuration,
  buildAttendanceRow,
  updateEventEmbed,
} = require('./eventHandlers');

async function tick(client, now) {
  await sendReminders(client, now).catch(err => logger.error(`Reminder tick error: ${err.message}`, err));
  await handleOngoingEvents(client, now).catch(err => logger.error(`Ongoing tick error: ${err.message}`, err));
  await handleEndedEvents(client, now).catch(err => logger.error(`Post-event tick error: ${err.message}`, err));
}

// ── Reminders ─────────────────────────────────────────────────────────────────

// Compare two epoch-second timestamps by calendar day in the club's timezone.
function isSameDay(aSeconds, bSeconds) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Dublin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(aSeconds * 1000)) === fmt.format(new Date(bSeconds * 1000));
}

async function markReminderSent(eventId, type) {
  await pg.query(
    'UPDATE event_reminders SET sent = true WHERE event_id = $1 AND type = $2',
    [eventId, type],
  );
}

async function sendReminders(client, now) {
  const pending = await pg.all(
    `SELECT e.*, er.type AS reminder_type
       FROM events e
       JOIN event_reminders er ON er.event_id = e.id
      WHERE er.sent = false
        AND e.starts_at > $1
        AND (
          (er.type = '1day'  AND e.starts_at - $1 <= 86400)
          OR
          (er.type = '1hour' AND e.starts_at - $1 <= 3600)
        )`,
    [now],
  );

  for (const reminder of pending) {
    // The "tomorrow" reminder is misleading for an event that actually starts
    // today (created same-day, or the bot was offline until <24h out). Drop it
    // silently — the 1-hour reminder still fires — and mark it done.
    if (reminder.reminder_type === '1day' && isSameDay(reminder.starts_at, now)) {
      await markReminderSent(reminder.id, '1day');
      logger.info(`Skipped "tomorrow" reminder for event ${reminder.id} (${reminder.name}) — it starts today`);
      continue;
    }

    const title = reminder.reminder_type === '1day'
      ? `⏰⠀Reminder: ${reminder.name} is tomorrow!`
      : `⏰⠀Reminder: ${reminder.name} is starting in 1 hour!`;

    const embed = modLogEmbed({
      color: eventColor(reminder),
      title,
      footer: 'CBC Events',
      fields: [
        { name: 'Time',     value: `<t:${reminder.starts_at}:F>`,             inline: true },
        { name: 'Location', value: reminder.location || 'TBD',                inline: true },
        { name: 'Duration', value: formatDuration(reminder.duration_minutes), inline: true },
      ],
    });

    const participants = await pg.all(
      'SELECT discord_id FROM event_registrations WHERE event_id = $1 AND withdrawn = false',
      [reminder.id],
    );

    await dmUsers(
      client,
      participants.map(p => p.discord_id),
      { embeds: [embed] },
      `${reminder.reminder_type} reminder`,
    );

    await pg.query(
      'UPDATE event_reminders SET sent = true WHERE event_id = $1 AND type = $2',
      [reminder.id, reminder.reminder_type],
    );
    logger.info(`Sent ${reminder.reminder_type} reminder for event ${reminder.id} (${reminder.name})`);
  }
}

// ── Ongoing event embed update ────────────────────────────────────────────────

async function handleOngoingEvents(client, now) {
  const ongoing = await pg.all(
    `SELECT * FROM events
      WHERE starts_at <= $1
        AND (starts_at + duration_minutes * 60) > $1
        AND ongoing_notified = false`,
    [now],
  );

  for (const event of ongoing) {
    await updateEventEmbed(client, event, false).catch(err =>
      logger.warn(`Could not update ongoing embed for event ${event.id}: ${err.message}`)
    );
    await pg.query('UPDATE events SET ongoing_notified = true WHERE id = $1', [event.id]);
    logger.info(`Marked event ${event.id} (${event.name}) as ongoing`);
  }
}

// ── Post-event flow ───────────────────────────────────────────────────────────

async function handleEndedEvents(client, now) {
  const ended = await pg.all(
    `SELECT e.*
       FROM events e
       LEFT JOIN event_summary_sent ess ON ess.event_id = e.id
      WHERE (e.starts_at + e.duration_minutes * 60) <= $1
        AND (ess.sent IS NULL OR ess.sent = false)`,
    [now],
  );

  for (const event of ended) {
    try {
      await processEndedEvent(client, event);
    } catch (err) {
      logger.error(`Failed to process ended event ${event.id}: ${err.message}`, err);
    }
  }
}

async function processEndedEvent(client, event) {
  logger.info(`Processing ended event ${event.id} (${event.name})`);

  // Disable Register button on original embed
  await updateEventEmbed(client, event, true);

  const allRegistrations   = await pg.all('SELECT * FROM event_registrations WHERE event_id = $1', [event.id]);
  const activeParticipants = allRegistrations.filter(r => !r.withdrawn);
  const organizers         = (await pg.all(
    'SELECT discord_id FROM event_organizers WHERE event_id = $1', [event.id],
  )).map(r => r.discord_id);
  const organizerSet = new Set(organizers);

  // Send attendance check DMs to non-organizer participants only
  const attendEmbed = modLogEmbed({
    color: eventColor(event),
    title: `🙋⠀Did you attend ${event.name}?`,
    description: 'The event has just ended. Please let us know if you attended!',
    footer: 'CBC Events',
  });

  for (const reg of activeParticipants.filter(r => !organizerSet.has(r.discord_id))) {
    const alreadySent = await pg.get(
      'SELECT sent FROM event_attendance_sent WHERE event_id = $1 AND discord_id = $2',
      [event.id, reg.discord_id],
    );
    if (alreadySent?.sent) continue;

    try {
      const user = await client.users.fetch(reg.discord_id);
      await user.send({ embeds: [attendEmbed], components: [buildAttendanceRow(event.id)] });
      await pg.query(
        `INSERT INTO event_attendance_sent (event_id, discord_id, sent) VALUES ($1, $2, true)
         ON CONFLICT (event_id, discord_id) DO UPDATE SET sent = true`,
        [event.id, reg.discord_id],
      );
    } catch (err) {
      logger.warn(`Could not send attendance DM to ${reg.discord_id}: ${err.message}`);
    }
  }

  // Build and send summary
  const summaryEmbed = modLogEmbed({
    color: eventColor(event),
    title: `📊⠀Event Summary: ${event.name}`,
    footer: 'CBC Events',
    fields: [
      { name: 'Organiser(s)',       value: mentionList(organizers),                       inline: false },
      { name: 'Total Registered',   value: `${allRegistrations.length}`,                  inline: true  },
      { name: 'Total Withdrawn',    value: `${allRegistrations.filter(r => r.withdrawn).length}`, inline: true },
      { name: 'Final Participants', value: `${activeParticipants.length}`,                inline: true  },
    ],
  });

  const notifyIds = [...new Set([...organizers, event.created_by])];
  await dmUsers(client, notifyIds, { embeds: [summaryEmbed] }, 'event summary');

  if (event.guild_id) {
    await logToModLog(client, event.guild_id, summaryEmbed);
  }

  await pg.query(
    `INSERT INTO event_summary_sent (event_id, sent) VALUES ($1, true)
     ON CONFLICT (event_id) DO UPDATE SET sent = true`,
    [event.id],
  );
  logger.info(`Completed post-event flow for event ${event.id} (${event.name})`);
}

module.exports = makeScheduler({ name: 'event', intervalMs: 60_000, firstDelayMs: 10_000, job: tick });
