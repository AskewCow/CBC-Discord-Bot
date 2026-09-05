// Dumps the shared Postgres DB + the bot's own SQLite file and DMs both to
// every member holding the configured Ambassador role. Restore path:
//   psql "$DATABASE_URL" < cbc-postgres-*.sql
// and replacing data/bot.db with the downloaded .db file (bot stopped).

const { execFile } = require('child_process');
const { brandFooter } = require('./embeds');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const cfg = require('./config');
const { CONFIG_KEYS } = require('../constants');
const logger = require('./logger');
const backupConfig = require('./backupConfig');
const { logToModLog } = require('./eventHandlers');
const { mentionConfigured } = require('./mentions');

const execFileAsync = promisify(execFile);

function todayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Plain-text SQL, no ownership/privilege statements (those reference roles —
// cbc_bot/cbc_web — that may not exist wherever this gets restored).
async function dumpPostgres() {
  const { stdout } = await execFileAsync(
    'pg_dump',
    [process.env.DATABASE_URL, '--no-owner', '--no-privileges'],
    { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
  );
  return Buffer.from(stdout, 'utf8');
}

// better-sqlite3's online backup API — safe to call while the bot is
// running under WAL mode, unlike a plain file copy.
async function dumpSqlite() {
  const tmpPath = path.join(os.tmpdir(), `cbc-bot-backup-${Date.now()}.db`);
  await db.backup(tmpPath);
  const buffer = await fs.readFile(tmpPath);
  await fs.unlink(tmpPath).catch(() => {});
  return buffer;
}

// Full guild member fetches hit the gateway (opcode 8) and get rate-limited,
// most often right after a restart. Retry with backoff before giving up —
// this job isn't time-critical, so a few minutes of waiting is fine.
const MEMBER_FETCH_RETRY_MS = [30_000, 60_000, 120_000];

async function fetchGuildMembers(guild) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await guild.members.fetch();
    } catch (err) {
      if (attempt >= MEMBER_FETCH_RETRY_MS.length) throw err;
      const waitMs = MEMBER_FETCH_RETRY_MS[attempt];
      logger.warn(
        `backup: member fetch for guild ${guild.id} failed (${err.message}); ` +
          `retry ${attempt + 1}/${MEMBER_FETCH_RETRY_MS.length} in ${waitMs / 1000}s`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function findRecipients(guild) {
  const roleIds = cfg.getValues(guild.id, CONFIG_KEYS.AMBASSADOR_ROLE);
  if (roleIds.length === 0) return [];
  const members = await fetchGuildMembers(guild);
  return [...members.values()].filter((m) => roleIds.some((id) => m.roles.cache.has(id)));
}

/**
 * Run a full backup for one guild: dump both databases, DM them to every
 * ambassador, record the run. Used by both `/backup run-now` and the
 * scheduler — throws on dump failure, per-recipient DM failures are caught
 * and just counted.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 */
async function runBackup(client, guild) {
  const stamp = todayStamp();
  const [pgBuffer, sqliteBuffer] = await Promise.all([dumpPostgres(), dumpSqlite()]);

  const files = [
    new AttachmentBuilder(pgBuffer, { name: `cbc-postgres-${stamp}.sql` }),
    new AttachmentBuilder(sqliteBuffer, { name: `cbc-bot-${stamp}.db` }),
  ];

  const recipients = await findRecipients(guild);
  let sent = 0;
  const failed = [];

  for (const member of recipients) {
    try {
      await member.send({
        content:
          `🗄️⠀**CBC data backup — ${stamp}**\n` +
          `Restore Postgres with \`psql "$DATABASE_URL" < cbc-postgres-${stamp}.sql\`. ` +
          `The \`.db\` file is a drop-in replacement for the bot's \`data/bot.db\` (stop the bot first).`,
        files,
      });
      sent++;
    } catch (err) {
      failed.push(member.id);
      logger.warn(`Could not DM backup to ${member.id}: ${err.message}`);
    }
  }

  backupConfig.markRun(guild.id, Math.floor(Date.now() / 1000));
  logger.info(`Backup for guild ${guild.id}: sent to ${sent}/${recipients.length} ambassador(s)`);

  const ambassadorMention = mentionConfigured(guild.id, CONFIG_KEYS.AMBASSADOR_ROLE, {
    type: 'role',
    fallback: 'the Ambassador role',
  });

  await logToModLog(
    client,
    guild.id,
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🗄️⠀Backup sent')
      .setDescription(`Sent to ${sent}/${recipients.length} member(s) with ${ambassadorMention}.`)
      .setFooter(brandFooter()),
  ).catch(() => {});

  return { recipients: recipients.length, sent, failed: failed.length };
}

module.exports = { runBackup };
