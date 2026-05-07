const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const logger = require('./logger');
const {
  EVENT_COLORS,
  formatDuration,
  buildAttendanceRow,
  updateEventEmbed,
  logToModLog,
} = require('./eventHandlers');

let _client = null;

function start(client) {
  _client = client;
  tick();
  setInterval(tick, 60_000);
}

async function tick() {
  if (!_client?.isReady()) return;
  const now = Math.floor(Date.now() / 1000);
  await sendReminders(now).catch(err => logger.error(`Reminder tick error: ${err.message}`, err));
  await handleOngoingEvents(now).catch(err => logger.error(`Ongoing tick error: ${err.message}`, err));
  await handleEndedEvents(now).catch(err => logger.error(`Post-event tick error: ${err.message}`, err));
}

// ── Reminders ─────────────────────────────────────────────────────────────────

async function sendReminders(now) {
  const pending = db.prepare(`
    SELECT e.*, er.type AS reminder_type
    FROM events e
    JOIN event_reminders er ON er.event_id = e.id
    WHERE er.sent = 0
      AND e.starts_at > ?
      AND (
        (er.type = '1day'  AND e.starts_at - ? <= 86400)
        OR
        (er.type = '1hour' AND e.starts_at - ? <= 3600)
      )
  `).all(now, now, now);

  for (const reminder of pending) {
    const title = reminder.reminder_type === '1day'
      ? `⏰⠀Reminder: ${reminder.name} is tomorrow!`
      : `⏰⠀Reminder: ${reminder.name} is starting in 1 hour!`;

    const embed = new EmbedBuilder()
      .setColor(EVENT_COLORS[reminder.type] || 0x5865f2)
      .setTitle(title)
      .addFields(
        { name: 'Time',     value: `<t:${reminder.starts_at}:F>`,         inline: true },
        { name: 'Location', value: reminder.location || 'TBD',            inline: true },
        { name: 'Duration', value: formatDuration(reminder.duration_minutes), inline: true },
      )
      .setFooter({ text: 'CBC Events' })
      .setTimestamp();

    const participants = db.prepare(
      'SELECT discord_id FROM event_registrations WHERE event_id = ? AND withdrawn = 0'
    ).all(reminder.id);

    for (const p of participants) {
      try {
        const user = await _client.users.fetch(p.discord_id);
        await user.send({ embeds: [embed] });
      } catch (err) {
        logger.warn(`Could not send ${reminder.reminder_type} reminder to ${p.discord_id}: ${err.message}`);
      }
    }

    db.prepare('UPDATE event_reminders SET sent = 1 WHERE event_id = ? AND type = ?')
      .run(reminder.id, reminder.reminder_type);
    logger.info(`Sent ${reminder.reminder_type} reminder for event ${reminder.id} (${reminder.name})`);
  }
}

// ── Ongoing event embed update ────────────────────────────────────────────────

async function handleOngoingEvents(now) {
  const ongoing = db.prepare(`
    SELECT * FROM events
    WHERE starts_at <= ?
      AND (starts_at + duration_minutes * 60) > ?
      AND ongoing_notified = 0
  `).all(now, now);

  for (const event of ongoing) {
    await updateEventEmbed(_client, event, false).catch(err =>
      logger.warn(`Could not update ongoing embed for event ${event.id}: ${err.message}`)
    );
    db.prepare('UPDATE events SET ongoing_notified = 1 WHERE id = ?').run(event.id);
    logger.info(`Marked event ${event.id} (${event.name}) as ongoing`);
  }
}

// ── Post-event flow ───────────────────────────────────────────────────────────

async function handleEndedEvents(now) {
  const ended = db.prepare(`
    SELECT e.*
    FROM events e
    LEFT JOIN event_summary_sent ess ON ess.event_id = e.id
    WHERE (e.starts_at + e.duration_minutes * 60) <= ?
      AND (ess.sent IS NULL OR ess.sent = 0)
  `).all(now);

  for (const event of ended) {
    try {
      await processEndedEvent(event);
    } catch (err) {
      logger.error(`Failed to process ended event ${event.id}: ${err.message}`, err);
    }
  }
}

async function processEndedEvent(event) {
  logger.info(`Processing ended event ${event.id} (${event.name})`);

  // Disable Register button on original embed
  await updateEventEmbed(_client, event, true);

  const allRegistrations   = db.prepare('SELECT * FROM event_registrations WHERE event_id = ?').all(event.id);
  const activeParticipants = allRegistrations.filter(r => r.withdrawn === 0);
  const organizers         = db.prepare('SELECT discord_id FROM event_organizers WHERE event_id = ?')
    .all(event.id).map(r => r.discord_id);
  const organizerSet = new Set(organizers);

  // Send attendance check DMs to non-organizer participants only
  const attendEmbed = new EmbedBuilder()
    .setColor(EVENT_COLORS[event.type] || 0x5865f2)
    .setTitle(`🙋⠀Did you attend ${event.name}?`)
    .setDescription('The event has just ended. Please let us know if you attended!')
    .setFooter({ text: 'CBC Events' })
    .setTimestamp();

  for (const reg of activeParticipants.filter(r => !organizerSet.has(r.discord_id))) {
    const alreadySent = db.prepare(
      'SELECT sent FROM event_attendance_sent WHERE event_id = ? AND discord_id = ?'
    ).get(event.id, reg.discord_id);
    if (alreadySent?.sent) continue;

    try {
      const user = await _client.users.fetch(reg.discord_id);
      await user.send({ embeds: [attendEmbed], components: [buildAttendanceRow(event.id)] });
      db.prepare(
        'INSERT OR REPLACE INTO event_attendance_sent (event_id, discord_id, sent) VALUES (?, ?, 1)'
      ).run(event.id, reg.discord_id);
    } catch (err) {
      logger.warn(`Could not send attendance DM to ${reg.discord_id}: ${err.message}`);
    }
  }

  // Build and send summary
  const totalRegistered = allRegistrations.length;
  const totalWithdrawn  = allRegistrations.filter(r => r.withdrawn === 1).length;
  const totalActive     = activeParticipants.length;
  const organizerMentions = organizers.map(id => `<@${id}>`).join(', ') || 'N/A';

  const summaryEmbed = new EmbedBuilder()
    .setColor(EVENT_COLORS[event.type] || 0x5865f2)
    .setTitle(`📊⠀Event Summary: ${event.name}`)
    .addFields(
      { name: 'Organiser(s)',      value: organizerMentions,    inline: false },
      { name: 'Total Registered',  value: `${totalRegistered}`, inline: true  },
      { name: 'Total Withdrawn',   value: `${totalWithdrawn}`,  inline: true  },
      { name: 'Final Participants',value: `${totalActive}`,     inline: true  },
    )
    .setTimestamp()
    .setFooter({ text: 'CBC Events' });

  const notifyIds = [...new Set([...organizers, event.created_by])];
  for (const userId of notifyIds) {
    try {
      const user = await _client.users.fetch(userId);
      await user.send({ embeds: [summaryEmbed] });
    } catch (err) {
      logger.warn(`Could not send summary DM to ${userId}: ${err.message}`);
    }
  }

  if (event.guild_id) {
    await logToModLog(_client, event.guild_id, summaryEmbed);
  }

  db.prepare('INSERT OR REPLACE INTO event_summary_sent (event_id, sent) VALUES (?, 1)').run(event.id);
  logger.info(`Completed post-event flow for event ${event.id} (${event.name})`);
}

module.exports = { start };
