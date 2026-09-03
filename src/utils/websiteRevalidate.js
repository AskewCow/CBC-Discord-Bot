const logger = require('./logger');

const KNOWN_TAGS = new Set(['projects', 'events', 'announcements', 'stats', 'roster']);

/**
 * Tell the website to drop its cached copy of the given data so a bot change
 * appears immediately instead of waiting for the ISR window. Fire-and-forget:
 * failures are logged, never thrown — the bot's own write already succeeded.
 *
 * @param {string[]} tags  any of: projects, events, announcements, stats, roster
 */
async function revalidateWebsite(tags) {
  const url = process.env.WEBSITE_REVALIDATE_URL;
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!url || !secret) return; // hook disabled

  const wanted = (Array.isArray(tags) ? tags : [tags]).filter((t) => KNOWN_TAGS.has(t));
  if (!wanted.length) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ tags: wanted }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn(`Website revalidate [${wanted.join(', ')}] → HTTP ${res.status}`);
    } else {
      logger.debug(`Website revalidated: ${wanted.join(', ')}`);
    }
  } catch (err) {
    logger.warn(`Website revalidate [${wanted.join(', ')}] failed: ${err.message}`);
  }
}

module.exports = { revalidateWebsite };
