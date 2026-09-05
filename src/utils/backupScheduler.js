// Checks hourly whether any guild's backup interval has elapsed. Day-granularity
// intervals mean an hourly tick is plenty. The first check is delayed a couple
// of minutes so a due backup doesn't race the gateway identify (member fetches
// get rate-limited then) and thrash on every restart.

const logger = require('./logger');
const backupConfig = require('./backupConfig');
const { runBackup } = require('./backupUtils');
const { makeScheduler } = require('./scheduler');

async function tick(client, now) {
  for (const row of backupConfig.getAllEnabled()) {
    const dueAt = (row.last_run_at || 0) + row.interval_days * 86400;
    if (now < dueAt) continue;

    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;

    try {
      await runBackup(client, guild);
    } catch (err) {
      logger.error(`Scheduled backup failed for guild ${row.guild_id}: ${err.message}`, err);
    }
  }
}

module.exports = makeScheduler({
  name: 'backup',
  intervalMs: 60 * 60 * 1000,
  firstDelayMs: 2 * 60 * 1000,
  job: tick,
});
