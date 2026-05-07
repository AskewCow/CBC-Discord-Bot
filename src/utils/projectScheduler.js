const db     = require('../database/db');
const logger = require('./logger');
const { buildProjectEmbed, buildVoteRow } = require('./projectUtils');
const { getVoteCounts } = require('./projectHandlers');

let _client = null;

function start(client) {
  _client = client;
  tick();
  setInterval(tick, 5 * 60_000); // check every 5 minutes
}

async function tick() {
  if (!_client?.isReady()) return;
  const now = Math.floor(Date.now() / 1000);
  await closeExpiredVotes(now).catch(err =>
    logger.error(`Project vote close tick error: ${err.message}`, err)
  );
}

async function closeExpiredVotes(now) {
  const expired = db.prepare(`
    SELECT * FROM projects
    WHERE vote_closed = 0
      AND vote_ends_at IS NOT NULL
      AND vote_ends_at <= ?
  `).all(now);

  for (const project of expired) {
    try {
      await finaliseVote(project);
    } catch (err) {
      logger.error(`Failed to close vote for project ${project.id}: ${err.message}`, err);
    }
  }
}

async function finaliseVote(project) {
  const counts = getVoteCounts(project.id);

  // Mark closed in DB first so concurrent ticks skip it
  db.prepare('UPDATE projects SET vote_closed = 1 WHERE id = ?').run(project.id);

  if (!project.review_message_id || !project.guild_id) {
    logger.warn(`Project ${project.id} has no review_message_id or guild_id — skipping embed update`);
    return;
  }

  const reviewChannelIds = db.prepare(
    "SELECT value FROM config WHERE guild_id = ? AND key = 'projects_review_channel'"
  ).all(project.guild_id).map(r => r.value);

  if (!reviewChannelIds.length) {
    logger.warn(`No projects_review_channel configured for guild ${project.guild_id}`);
    return;
  }

  const [reviewChannelId] = reviewChannelIds;

  const channel = await _client.channels.fetch(reviewChannelId);
  const msg     = await channel.messages.fetch(project.review_message_id);

  await msg.edit({
    embeds: [buildProjectEmbed(project, { voteClosed: true, counts })],
    components: [buildVoteRow(project.id, { disabled: true, ...counts })],
  });

  logger.info(
    `Closed vote for project ${project.id} (${project.name}) — 👍 ${counts.upvotes} / 👎 ${counts.downvotes}`
  );
}

module.exports = { start };
