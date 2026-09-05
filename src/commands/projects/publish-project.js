const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const pg     = require('../../database/pg');
const logger = require('../../utils/logger');
const { requireAmbassador } = require('../../utils/permissions');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { deriveTagsFromGitHub } = require('../../utils/githubTags');
const { revalidateWebsite } = require('../../utils/websiteRevalidate');
const { logToModLog } = require('../../utils/eventHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('publish-project')
    .setDescription('Publish a submitted project to the CBC website showcase')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('project')
        .setDescription('The project to publish')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const rows = await pg.all(
      `SELECT id, name FROM projects
        WHERE guild_id = $1 AND published = false
        ORDER BY submitted_at DESC
        LIMIT 25`,
      [interaction.guildId],
    );
    const filtered = focused
      ? rows.filter(r => r.name.toLowerCase().includes(focused))
      : rows;
    await interaction.respond(filtered.slice(0, 25).map(r => ({ name: r.name, value: String(r.id) })));
  },

  async execute(interaction) {
    if (!(await requireAmbassador(interaction))) return;

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
    if (project.published) {
      return interaction.editReply({
        embeds: [errorEmbed('Already published', `**${project.name}** is already live on the website.`)],
      });
    }

    const now = Math.floor(Date.now() / 1000);
    await pg.query(
      'UPDATE projects SET published = true, published_at = $1 WHERE id = $2',
      [now, projectId],
    );

    // Derive tags only if none are set yet — never clobber existing ones.
    let tags = project.tags ?? [];
    if (!tags.length) {
      tags = await deriveTagsFromGitHub(project.github_url);
      if (tags.length) {
        await pg.query('UPDATE projects SET tags = $1 WHERE id = $2', [tags, projectId]);
      }
    }

    revalidateWebsite(['projects', 'stats']).catch(() => {});
    logger.info(`Project ${projectId} (${project.name}) published by ${interaction.user.id}`);

    if (interaction.guildId) {
      await logToModLog(interaction.client, interaction.guildId, new EmbedBuilder()
        .setColor(0x788c5d)
        .setTitle('🌐⠀Project Published')
        .addFields(
          { name: 'Project',      value: project.name,                          inline: true },
          { name: 'Published by', value: `<@${interaction.user.id}>`,           inline: true },
          { name: 'How',          value: 'Manual (/publish-project)',            inline: true },
          { name: 'Tags',         value: tags.length ? tags.join(', ') : '—',    inline: false },
        )).catch(() => {});
    }

    const base = process.env.WEBSITE_BASE_URL;
    return interaction.editReply({
      embeds: [successEmbed(
        'Project published',
        `**${project.name}** is now live in the showcase${base ? ` — ${base}/projects` : '.'}`,
      )],
    });
  },
};
