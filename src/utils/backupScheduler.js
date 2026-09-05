// Checks hourly whether any guild's backup interval has elapsed. Interval is
// day-granularity, so an hourly tick is plenty (mirrors eventScheduler.js's
// pattern, just with a coarser cadence since nothing here is time-critical).

const logger = require('./logger');
const backupConfig = require('./backupConfig');
const { runBackup } = require('./backupUtils');

const TICK_MS = 60 * 60 * 1000;

let _client = null;

function start(client) {
  _client = client;
  tick();
  setInterval(tick, TICK_MS);
}

async function tick() {
  if (!_client?.isReady()) return;
  const now = Math.floor(Date.now() / 1000);

  for (const row of backupConfig.getAllEnabled()) {
    const dueAt = (row.last_run_at || 0) + row.interval_days * 86400;
    if (now < dueAt) continue;

    const guild = _client.guilds.cache.get(row.guild_id);
    if (!guild) continue;

    try {
      await runBackup(_client, guild);
    } catch (err) {
      logger.error(`Scheduled backup failed for guild ${row.guild_id}: ${err.message}`, err);
    }
  }
}

module.exports = { start };
