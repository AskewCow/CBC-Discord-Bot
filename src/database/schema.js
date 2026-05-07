const db = require('./db');

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
  // Old scaffold used thread_id; new schema uses channel_id
  const hasChannelId = cols.some(c => c.name === 'channel_id');
  if (!hasChannelId) {
    db.exec('DROP TABLE IF EXISTS tickets');
  }
}

function runSchema() {
  migrateConfig();
  migrateTickets();

  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      discord_id   TEXT PRIMARY KEY,
      username     TEXT NOT NULL,
      joined_at    INTEGER NOT NULL,
      onboarded_at INTEGER,
      invite_code  TEXT
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      author_id  TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      posted_at  INTEGER NOT NULL,
      pinned     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      description  TEXT,
      location     TEXT,
      starts_at    INTEGER NOT NULL,
      ends_at      INTEGER,
      created_by   TEXT NOT NULL,
      message_id   TEXT,
      checkin_form TEXT,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_registrations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      discord_id    TEXT NOT NULL,
      registered_at INTEGER NOT NULL,
      attended      INTEGER NOT NULL DEFAULT 0,
      UNIQUE(event_id, discord_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      description  TEXT NOT NULL,
      github_url   TEXT,
      builder_name TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      submitted_at INTEGER NOT NULL,
      approved     INTEGER NOT NULL DEFAULT 0,
      message_id   TEXT
    );

    CREATE TABLE IF NOT EXISTS invites (
      code         TEXT PRIMARY KEY,
      inviter_id   TEXT NOT NULL,
      uses         INTEGER NOT NULL DEFAULT 0,
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
  `);
}

module.exports = { runSchema };
