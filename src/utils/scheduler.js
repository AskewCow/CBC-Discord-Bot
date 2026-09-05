const logger = require('./logger');
const { nowSec } = require('./time');

/**
 * A polling task that runs `job(client, now)` on an interval once the client is
 * ready. The first run is delayed by `firstDelayMs` (default 5s) so it doesn't
 * fire mid gateway-identify, when member/user fetches get rate-limited.
 *
 * @param {{ name: string, intervalMs: number, firstDelayMs?: number,
 *           job: (client: import('discord.js').Client, now: number) => Promise<void> }} opts
 */
function makeScheduler({ name, intervalMs, firstDelayMs = 5_000, job }) {
  let client = null;

  async function tick() {
    if (!client?.isReady()) return;
    try {
      await job(client, nowSec());
    } catch (err) {
      logger.error(`${name} scheduler tick error: ${err.message}`, err);
    }
  }

  function start(c) {
    client = c;
    setTimeout(tick, firstDelayMs);
    setInterval(tick, intervalMs);
  }

  return { start };
}

module.exports = { makeScheduler };
