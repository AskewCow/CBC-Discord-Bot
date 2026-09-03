const db = require('./db');

// This file owns the bot's *internal* SQLite tables only: config, invite
// tracking, tickets, onboarding, and the per-guild post-event message.
//
// The shared "public subgraph" (members, projects, project_votes, events and
// their dependent tables, announcements) now lives in Postgres and is managed
// by the website repo's migrations — see src/database/pg.js.

function migrateInvites() {
  const cols = db.prepare("PRAGMA table_info(invites)").all();
  if (cols.length === 0) return;
  const names = new Set(cols.map(c => c.name));
  if (!names.has('guild_id')) db.exec("ALTER TABLE invites ADD COLUMN guild_id TEXT NOT NULL DEFAULT ''");
}

function migrateInviteLeaderboards() {
  const cols = db.prepare("PRAGMA table_info(invite_leaderboards)").all();
  if (cols.length === 0) return;
  const names = new Set(cols.map(c => c.name));
  if (!names.has('scope')) db.exec("ALTER TABLE invite_leaderboards ADD COLUMN scope TEXT NOT NULL DEFAULT 'all_time'");
}

function migrateConfig() {
  const cols = db.prepare("PRAGMA table_info(config)").all();
  if (cols.length === 0) return;
  const isOldSchema = cols.some(c => c.name === 'updated_at');
  if (isOldSchema) {
    db.exec('DROP TABLE config');
  }
}

function migrateTickets() {
  const cols = db.prepare("PRAGMA table_info(tickets)").all();
  if (cols.length === 0) return;
  const hasChannelId = cols.some(c => c.name === 'channel_id');
  if (!hasChannelId) {
    db.exec('DROP TABLE IF EXISTS tickets');
  }
}

function runSchema() {
  migrateInvites();
  migrateInviteLeaderboards();
  migrateConfig();
  migrateTickets();

  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      code         TEXT PRIMARY KEY,
      inviter_id   TEXT NOT NULL,
      uses         INTEGER NOT NULL DEFAULT 0,
      guild_id     TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      last_used_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS shoutout_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      inviter_id   TEXT NOT NULL,
      week_start   INTEGER NOT NULL,
      invite_count INTEGER NOT NULL,
      message_id   TEXT,
      UNIQUE(inviter_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id      TEXT NOT NULL UNIQUE,
      opener_id       TEXT NOT NULL,
      guild_id        TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open',
      topic           TEXT,
      panel_id        INTEGER,
      option_id       INTEGER,
      pending_step_id INTEGER,
      created_at      INTEGER NOT NULL,
      closed_at       INTEGER,
      log_message_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS ticket_panels (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      message_id  TEXT,
      title       TEXT NOT NULL DEFAULT 'Support Desk',
      description TEXT NOT NULL DEFAULT 'Select a category below to open a support ticket.',
      created_by  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_options (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id    INTEGER NOT NULL REFERENCES ticket_panels(id) ON DELETE CASCADE,
      label       TEXT NOT NULL,
      description TEXT,
      emoji       TEXT,
      position    INTEGER NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_panels_guild_channel
      ON ticket_panels(guild_id, channel_id);

    CREATE TABLE IF NOT EXISTS ticket_flow_steps (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id   INTEGER NOT NULL REFERENCES ticket_options(id) ON DELETE CASCADE,
      step_order  INTEGER NOT NULL DEFAULT 0,
      step_type   TEXT NOT NULL DEFAULT 'message',
      content     TEXT NOT NULL,
      yes_content TEXT,
      no_content  TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      key      TEXT NOT NULL,
      value    TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      UNIQUE(guild_id, key, value)
    );

    CREATE TABLE IF NOT EXISTS onboarding_flows (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL UNIQUE,
      flow_type   TEXT NOT NULL DEFAULT 'questions',
      welcome_msg TEXT,
      created_by  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS onboarding_steps (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id     INTEGER NOT NULL REFERENCES onboarding_flows(id) ON DELETE CASCADE,
      step_order  INTEGER NOT NULL DEFAULT 0,
      step_type   TEXT NOT NULL DEFAULT 'text',
      content     TEXT NOT NULL,
      yes_content TEXT,
      no_content  TEXT
    );

    CREATE TABLE IF NOT EXISTS onboarding_sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id   TEXT NOT NULL,
      guild_id     TEXT NOT NULL,
      flow_id      INTEGER NOT NULL REFERENCES onboarding_flows(id) ON DELETE CASCADE,
      current_step INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'in_progress',
      answers      TEXT NOT NULL DEFAULT '[]',
      started_at   INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE(discord_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS invite_leaderboards (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id          TEXT NOT NULL,
      channel_id        TEXT NOT NULL,
      message_id        TEXT NOT NULL UNIQUE,
      scope             TEXT NOT NULL DEFAULT 'all_time',
      started_at        INTEGER NOT NULL,
      include_committee INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS event_thank_you (
      guild_id  TEXT PRIMARY KEY,
      message   TEXT NOT NULL DEFAULT 'Thank you for attending! We hope to see you at our next event.',
      link_text TEXT,
      link_url  TEXT
    );
  `);
}

module.exports = { runSchema };
