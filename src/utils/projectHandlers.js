const { MessageFlags } = require('discord.js');
const pg     = require('../database/pg');
const config = require('./config');
const logger = require('./logger');
const { nowSec } = require('./time');
const { CONFIG_KEYS } = require('../constants');
const { buildProjectEmbed, buildVoteRow } = require('./projectUtils');

async function getVoteCounts(projectId) {
  const rows = await pg.all(
    `SELECT vote, COUNT(*)::int AS count
       FROM project_votes
      WHERE project_id = $1
      GROUP BY vote`,
    [projectId],
  );
  let upvotes = 0, downvotes = 0;
  for (const r of rows) {
    if (r.vote === 'up')   upvotes   = r.count;
    if (r.vote === 'down') downvotes = r.count;
  }
  return { upvotes, downvotes };
}

/**
 * Re-render a project's message in the review channel. Shared by the live vote
 * button (open) and the scheduler when a vote window closes. Best-effort — a
 * missing channel/message is skipped.
 */
async function refreshReviewMessage(client, project, counts, { closed = false } = {}) {
  if (!project.review_message_id || !project.guild_id) return;
  const [reviewChannelId] = config.getValues(project.guild_id, CONFIG_KEYS.PROJECTS_REVIEW_CHANNEL);
  if (!reviewChannelId) return;

  const channel = await client.channels.fetch(reviewChannelId).catch(() => null);
  if (!channel) return;
  const msg = await channel.messages.fetch(project.review_message_id).catch(() => null);
  if (!msg) return;

  await msg.edit({
    embeds: [buildProjectEmbed(project, closed ? { voteClosed: true, counts } : { forReview: true, counts })],
    components: [buildVoteRow(project.id, closed ? { disabled: true, ...counts } : {})],
  });
}

async function handleVote(interaction) {
  const parts     = interaction.customId.split(':'); // project:vote:up/down:id
  const direction = parts[2];  // 'up' or 'down'
  const projectId = parseInt(parts[3], 10);

  const project = await pg.get('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project) {
    return interaction.reply({ content: 'Project not found.', flags: MessageFlags.Ephemeral });
  }

  const now = nowSec();

  // Reject votes after the window closes
  if (project.vote_closed || (project.vote_ends_at && project.vote_ends_at <= now)) {
    return interaction.reply({
      content: 'Voting for this project has closed.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check existing vote
  const existing = await pg.get(
    'SELECT vote FROM project_votes WHERE project_id = $1 AND discord_id = $2',
    [projectId, interaction.user.id],
  );

  if (existing?.vote === direction) {
    return interaction.reply({
      content: `You have already voted **${direction === 'up' ? '👍 Feature It' : '👎 Pass'}** for this project.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Upsert vote (allows changing direction)
  await pg.query(
    `INSERT INTO project_votes (project_id, discord_id, vote, voted_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, discord_id)
       DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at`,
    [projectId, interaction.user.id, direction, now],
  );

  const counts = await getVoteCounts(projectId);

  await refreshReviewMessage(interaction.client, project, counts).catch((err) =>
    logger.warn(`Could not update review message for project ${projectId}: ${err.message}`),
  );

  const changed = existing ? ' (changed)' : '';
  return interaction.reply({
    content: `Vote recorded: **${direction === 'up' ? '👍 Feature It' : '👎 Pass'}**${changed}. Thanks!`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { handleVote, getVoteCounts, refreshReviewMessage };
