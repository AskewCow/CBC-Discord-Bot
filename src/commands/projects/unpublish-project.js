const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const pg     = require('../../database/pg');
const logger = require('../../utils/logger');
const { requireCommittee } = require('../../utils/permissions');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { revalidateWebsite } = require('../../utils/websiteRevalidate');
const { logToModLog } = require('../../utils/eventHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unpublish-project')
    .setDescription('Remove a project from the CBC website showcase')
    .addStringOption(opt =>
      opt.setName('project')
        .setDescription('The project to unpublish')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const rows = await pg.all(
      `SELECT id, name FROM projects
        WHERE guild_id = $1 AND published = true
        ORDER BY published_at DESC NULLS LAST
        LIMIT 25`,
      [interaction.guildId],
    );
    const filtered = focused
      ? rows.filter(r => r.name.toLowerCase().includes(focused))
      : rows;
    await interaction.respond(filtered.slice(0, 25).map(r => ({ name: r.name, value: String(r.id) })));
  },

  async execute(interaction) {
    if (!(await requireCommittee(interaction))) return;

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
    if (!project.published) {
      return interaction.editReply({
        embeds: [errorEmbed('Not published', `**${project.name}** is not currently on the website.`)],
      });
    }

    await pg.query(
      'UPDATE projects SET published = false, published_at = NULL WHERE id = $1',
      [projectId],
    );

    revalidateWebsite(['projects', 'stats']).catch(() => {});
    logger.info(`Project ${projectId} (${project.name}) unpublished by ${interaction.user.id}`);

    if (interaction.guildId) {
      await logToModLog(interaction.client, interaction.guildId, new EmbedBuilder()
        .setColor(0xb0aea5)
        .setTitle('🌐⠀Project Unpublished')
        .addFields(
          { name: 'Project',        value: project.name,               inline: true },
          { name: 'Unpublished by', value: `<@${interaction.user.id}>`, inline: true },
        )
        .setTimestamp()).catch(() => {});
    }

    return interaction.editReply({
      embeds: [successEmbed('Project unpublished', `**${project.name}** has been removed from the showcase.`)],
    });
  },
};
