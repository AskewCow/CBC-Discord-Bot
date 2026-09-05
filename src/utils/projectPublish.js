// Shared implementation for /publish-project and /unpublish-project.

const { MessageFlags } = require('discord.js');
const pg = require('../database/pg');
const logger = require('./logger');
const { nowSec } = require('./time');
const { requireAmbassador } = require('./permissions');
const { errorEmbed, successEmbed } = require('./embeds');
const { toChoices } = require('./autocomplete');
const { deriveTagsFromGitHub } = require('./githubTags');
const { revalidateWebsite } = require('./websiteRevalidate');
const { logToModLog, modLogEmbed } = require('./modLog');

/** Autocomplete over the caller's guild projects filtered by published state. */
async function autocompleteProjects(interaction, { published }) {
  const focused = interaction.options.getFocused();
  const rows = await pg.all(
    `SELECT id, name FROM projects
      WHERE guild_id = $1 AND published = $2 AND name ILIKE '%' || $3 || '%'
      ORDER BY ${published ? 'published_at DESC NULLS LAST' : 'submitted_at DESC'}
      LIMIT 25`,
    [interaction.guildId, published, focused],
  );
  await interaction.respond(toChoices(rows));
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {'publish'|'unpublish'} mode
 */
async function runProjectPublish(interaction, mode) {
  if (!(await requireAmbassador(interaction))) return;
  const publishing = mode === 'publish';

  const projectId = parseInt(interaction.options.getString('project'), 10);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const project = await pg.get(
    'SELECT * FROM projects WHERE id = $1 AND guild_id = $2',
    [projectId, interaction.guildId],
  );
  if (!project) {
    return interaction.editReply({
      embeds: [errorEmbed('Not found', 'That project does not exist in this server.')],
    });
  }
  if (publishing && project.published) {
    return interaction.editReply({
      embeds: [errorEmbed('Already published', `**${project.name}** is already live on the website.`)],
    });
  }
  if (!publishing && !project.published) {
    return interaction.editReply({
      embeds: [errorEmbed('Not published', `**${project.name}** is not currently on the website.`)],
    });
  }

  let tags = project.tags ?? [];
  if (publishing) {
    await pg.query(
      'UPDATE projects SET published = true, published_at = $1 WHERE id = $2',
      [nowSec(), projectId],
    );
    // Derive tags only if none are set yet — never clobber existing ones.
    if (!tags.length) {
      tags = await deriveTagsFromGitHub(project.github_url);
      if (tags.length) await pg.query('UPDATE projects SET tags = $1 WHERE id = $2', [tags, projectId]);
    }
  } else {
    await pg.query(
      'UPDATE projects SET published = false, published_at = NULL WHERE id = $1',
      [projectId],
    );
  }

  revalidateWebsite(['projects', 'stats']).catch(() => {});
  logger.info(`Project ${projectId} (${project.name}) ${mode}ed by ${interaction.user.id}`);

  if (interaction.guildId) {
    const fields = [
      { name: 'Project', value: project.name, inline: true },
      { name: publishing ? 'Published by' : 'Unpublished by', value: `<@${interaction.user.id}>`, inline: true },
    ];
    if (publishing) {
      fields.push({ name: 'How', value: 'Manual (/publish-project)', inline: true });
      fields.push({ name: 'Tags', value: tags.length ? tags.join(', ') : '—', inline: false });
    }
    await logToModLog(
      interaction.client,
      interaction.guildId,
      modLogEmbed({
        color: publishing ? 0x788c5d : 0xb0aea5,
        title: publishing ? '🌐⠀Project Published' : '🌐⠀Project Unpublished',
        fields,
      }),
    ).catch(() => {});
  }

  if (!publishing) {
    return interaction.editReply({
      embeds: [successEmbed('Project unpublished', `**${project.name}** has been removed from the showcase.`)],
    });
  }
  const base = process.env.WEBSITE_BASE_URL;
  return interaction.editReply({
    embeds: [successEmbed(
      'Project published',
      `**${project.name}** is now live in the showcase${base ? ` — ${base}/projects` : '.'}`,
    )],
  });
}

module.exports = { autocompleteProjects, runProjectPublish };
