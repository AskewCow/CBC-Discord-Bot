// Small Discord-shaped helpers shared across handlers.

const logger = require('./logger');

/** Render a list of user ids as `<@id>` mentions, or `empty` when there are none. */
function mentionList(ids, empty = 'N/A') {
  return ids.length ? ids.map((id) => `<@${id}>`).join(', ') : empty;
}

/**
 * DM the same payload to many users, best-effort. A closed DM or fetch failure
 * for one recipient is logged and skipped, never thrown.
 *
 * @returns {Promise<{ sent: number, failed: string[] }>}
 */
async function dmUsers(client, ids, payload, label = 'message') {
  let sent = 0;
  const failed = [];
  for (const id of ids) {
    try {
      const user = await client.users.fetch(id);
      await user.send(payload);
      sent++;
    } catch (err) {
      failed.push(id);
      logger.warn(`Could not DM ${label} to ${id}: ${err.message}`);
    }
  }
  return { sent, failed };
}

module.exports = { mentionList, dmUsers };
