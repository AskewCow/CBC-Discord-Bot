const { MessageFlags } = require('discord.js');
const db     = require('../database/db');
const logger = require('./logger');
const { buildProjectEmbed, buildVoteRow } = require('./projectUtils');

function getVoteCounts(projectId) {
  const rows = db.prepare(`
    SELECT vote, COUNT(*) AS count FROM project_votes WHERE project_id = ? GROUP BY vote
  `).all(projectId);
  let upvotes = 0, downvotes = 0;
  for (const r of rows) {
    if (r.vote === 'up')   upvotes   = r.count;
    if (r.vote === 'down') downvotes = r.count;
  }
  return { upvotes, downvotes };
}

async function handleVote(interaction) {
  const parts     = interaction.customId.split(':'); // project:vote:up/down:id
  const direction = parts[2];  // 'up' or 'down'
  const projectId = parseInt(parts[3], 10);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return interaction.reply({ content: 'Project not found.', flags: MessageFlags.Ephemeral });
  }

  const now = Math.floor(Date.now() / 1000);

  // Reject votes after the window closes
  if (project.vote_closed || (project.vote_ends_at && project.vote_ends_at <= now)) {
    return interaction.reply({
      content: 'Voting for this project has closed.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check existing vote
  const existing = db.prepare(
    'SELECT vote FROM project_votes WHERE project_id = ? AND discord_id = ?'
  ).get(projectId, interaction.user.id);

  if (existing?.vote === direction) {
    return interaction.reply({
      content: `You have already voted **${direction === 'up' ? '👍 Feature It' : '👎 Pass'}** for this project.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Upsert vote (allows changing direction)
  db.prepare(`
    INSERT INTO project_votes (project_id, discord_id, vote, voted_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, discord_id) DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at
  `).run(projectId, interaction.user.id, direction, now);

  const counts = getVoteCounts(projectId);

  // Update the review message embed with current counts
  try {
    if (project.review_message_id && project.guild_id) {
      const [reviewChannelId] = db.prepare(
        "SELECT value FROM config WHERE guild_id = ? AND key = 'projects_review_channel' LIMIT 1"
      ).all(project.guild_id).map(r => r.value);

      if (reviewChannelId) {
        const channel = await interaction.client.channels.fetch(reviewChannelId);
        const msg     = await channel.messages.fetch(project.review_message_id);
        await msg.edit({
          embeds: [buildProjectEmbed(project, { forReview: true, counts })],
          components: [buildVoteRow(projectId)],
        });
      }
    }
  } catch (err) {
    logger.warn(`Could not update review message for project ${projectId}: ${err.message}`);
  }

  const changed = existing ? ' (changed)' : '';
  return interaction.reply({
    content: `Vote recorded: **${direction === 'up' ? '👍 Feature It' : '👎 Pass'}**${changed}. Thanks!`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { handleVote, getVoteCounts };
