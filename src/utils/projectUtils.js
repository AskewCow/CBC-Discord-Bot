const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { brandFooter } = require('./embeds');

const BUILT_WITH_LABELS = {
  claude_code: 'Claude Code',
  claude_web:  'Claude Web',
  claude_api:  'Claude API',
  other:       'Other',
};

const PROJECT_COLOR = 0xdd7659;

// project: { id, name, description, github_url, submitted_by, submitter_tag,
//            built_with, thumbnail_url, vote_ends_at, vote_closed }
// counts:  { upvotes, downvotes }  (required when forReview=true or voteClosed=true)
function buildProjectEmbed(project, { forReview = false, voteClosed = false, counts = null } = {}) {
  const fields = [];

  fields.push({ name: 'Builder', value: project.submitter_tag ? `@${project.submitter_tag}` : `<@${project.submitted_by}>`, inline: true });

  if (project.built_with && project.built_with !== 'none') {
    fields.push({
      name:   'Built With',
      value:  BUILT_WITH_LABELS[project.built_with] ?? project.built_with,
      inline: true,
    });
  }

  if (project.github_url) {
    fields.push({ name: 'GitHub', value: `[View Repository](${project.github_url})`, inline: true });
  }

  if (forReview && !voteClosed) {
    const up   = counts?.upvotes   ?? 0;
    const down = counts?.downvotes ?? 0;
    fields.push({ name: 'Vote Ends',     value: `<t:${project.vote_ends_at}:R>`,       inline: true });
    fields.push({ name: 'Current Votes', value: `👍 **${up}**  ·  👎 **${down}**`, inline: true });
  }

  if (voteClosed && counts) {
    fields.push({
      name:   'Final Vote',
      value:  `👍 **${counts.upvotes}**  ·  👎 **${counts.downvotes}**`,
      inline: true,
    });
    fields.push({ name: 'Vote Closed', value: `<t:${project.vote_ends_at}:D>`, inline: true });
  }

  let color = PROJECT_COLOR;
  let title = `🚀⠀${project.name}`;
  if (voteClosed) {
    color = (counts?.upvotes ?? 0) > (counts?.downvotes ?? 0) ? 0x57f287 : 0x99aab5;
    title = `🏁⠀${project.name}`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(project.description)
    .addFields(fields)
    .setFooter(brandFooter())
    .setTimestamp(project.submitted_at * 1000);

  if (project.thumbnail_url) {
    embed.setImage(project.thumbnail_url);
  }

  return embed;
}

function buildVoteRow(projectId, { disabled = false, upvotes = 0, downvotes = 0 } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`project:vote:up:${projectId}`)
      .setLabel(disabled ? `Feature It (${upvotes})` : 'Feature It')
      .setEmoji('👍')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`project:vote:down:${projectId}`)
      .setLabel(disabled ? `Pass (${downvotes})` : 'Pass')
      .setEmoji('👎')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

module.exports = { buildProjectEmbed, buildVoteRow, BUILT_WITH_LABELS };
