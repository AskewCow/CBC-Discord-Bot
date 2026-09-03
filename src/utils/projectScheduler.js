const { EmbedBuilder } = require('discord.js');
const pg     = require('../database/pg');
const config = require('./config');
const logger = require('./logger');
const { buildProjectEmbed, buildVoteRow } = require('./projectUtils');
const { getVoteCounts } = require('./projectHandlers');
const { deriveTagsFromGitHub } = require('./githubTags');
const { revalidateWebsite } = require('./websiteRevalidate');
const { logToModLog } = require('./eventHandlers');

// A project auto-publishes to the website when its closed vote clears this net
// score (👍 minus 👎). Committee can also publish manually with /publish-project.
const PUBLISH_NET_THRESHOLD = 3;

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
  const expired = await pg.all(
    `SELECT * FROM projects
      WHERE vote_closed = false
        AND vote_ends_at IS NOT NULL
        AND vote_ends_at <= $1`,
    [now],
  );

  for (const project of expired) {
    try {
      await finaliseVote(project);
    } catch (err) {
      logger.error(`Failed to close vote for project ${project.id}: ${err.message}`, err);
    }
  }
}

async function finaliseVote(project) {
  const counts = await getVoteCounts(project.id);

  // Mark closed in DB first so concurrent ticks skip it
  await pg.query('UPDATE projects SET vote_closed = true WHERE id = $1', [project.id]);

  await updateReviewEmbed(project, counts).catch(err =>
    logger.warn(`Project ${project.id}: could not update review embed — ${err.message}`)
  );

  logger.info(
    `Closed vote for project ${project.id} (${project.name}) — 👍 ${counts.upvotes} / 👎 ${counts.downvotes}`
  );

  const net = counts.upvotes - counts.downvotes;
  if (net >= PUBLISH_NET_THRESHOLD) {
    await publishFromVote(project, counts).catch(err =>
      logger.error(`Project ${project.id}: auto-publish failed — ${err.message}`, err)
    );
  }
}

async function updateReviewEmbed(project, counts) {
  if (!project.review_message_id || !project.guild_id) {
    logger.warn(`Project ${project.id} has no review_message_id or guild_id — skipping embed update`);
    return;
  }

  const [reviewChannelId] = config.getValues(project.guild_id, 'projects_review_channel');
  if (!reviewChannelId) {
    logger.warn(`No projects_review_channel configured for guild ${project.guild_id}`);
    return;
  }

  const channel = await _client.channels.fetch(reviewChannelId);
  const msg     = await channel.messages.fetch(project.review_message_id);
  await msg.edit({
    embeds: [buildProjectEmbed(project, { voteClosed: true, counts })],
    components: [buildVoteRow(project.id, { disabled: true, ...counts })],
  });
}

// Publish a project to the website after a passing vote: set the flag, derive
// tags from GitHub, refresh the site, and let people know in Discord.
async function publishFromVote(project, counts) {
  const now = Math.floor(Date.now() / 1000);
  const { rowCount } = await pg.query(
    `UPDATE projects
        SET published = true, published_at = $1
      WHERE id = $2 AND published = false`,
    [now, project.id],
  );
  if (rowCount === 0) return; // already published (e.g. manual publish beat us)

  const tags = await deriveTagsFromGitHub(project.github_url);
  if (tags.length) {
    await pg.query('UPDATE projects SET tags = $1 WHERE id = $2', [tags, project.id]);
  }

  revalidateWebsite(['projects', 'stats']).catch(() => {});

  logger.info(
    `Published project ${project.id} (${project.name}) to the website — net vote +${counts.upvotes - counts.downvotes}` +
    (tags.length ? `, tags: ${tags.join(', ')}` : '')
  );

  // Announce in the project's discussion thread
  if (project.thread_id) {
    try {
      const thread = await _client.channels.fetch(project.thread_id);
      await thread.send({
        embeds: [new EmbedBuilder()
          .setColor(0x788c5d)
          .setTitle('🌐⠀Published to the CBC website')
          .setDescription(
            `**${project.name}** cleared committee voting (👍 ${counts.upvotes} / 👎 ${counts.downvotes}) and is now live in the showcase.`,
          )
          .setTimestamp()],
      });
    } catch (err) {
      logger.warn(`Project ${project.id}: could not post publish notice to thread — ${err.message}`);
    }
  }

  // Mod log
  if (project.guild_id) {
    await logToModLog(_client, project.guild_id, new EmbedBuilder()
      .setColor(0x788c5d)
      .setTitle('🌐⠀Project Published')
      .addFields(
        { name: 'Project',     value: project.name,                                    inline: true },
        { name: 'Final Vote',   value: `👍 ${counts.upvotes} · 👎 ${counts.downvotes}`, inline: true },
        { name: 'How',          value: `Auto (net ≥ ${PUBLISH_NET_THRESHOLD})`,          inline: true },
        { name: 'Tags',         value: tags.length ? tags.join(', ') : '—',              inline: false },
      )
      .setTimestamp()).catch(() => {});
  }
}

module.exports = { start, PUBLISH_NET_THRESHOLD };
