const {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const pg     = require('../../database/pg');
const config = require('../../utils/config');
const logger = require('../../utils/logger');
const { nowSec } = require('../../utils/time');
const { CONFIG_KEYS } = require('../../constants');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { buildProjectEmbed, buildVoteRow } = require('../../utils/projectUtils');
const { logToModLog, modLogEmbed } = require('../../utils/modLog');
const { requireMember } = require('../../utils/permissions');

// Keyed by userId; holds built_with + thumbnail URL until modal submits
const pendingSubmissions = new Map();

// Matches https://github.com/<owner>/<repo> (with optional www and trailing path)
const GITHUB_REPO_RE = /^https:\/\/(www\.)?github\.com\/[^/\s]+\/[^/\s]+/i;

// One submission per user per this window. Enforced from the projects table
// (persistent across bot restarts) against the caller's most recent submission.
const SUBMIT_COOLDOWN_SECONDS = 4 * 60 * 60;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit-project')
    .setDescription('Submit a project to the CBC showcase')
    .addStringOption(opt =>
      opt
        .setName('built_with')
        .setDescription('What did you build this with?')
        .setRequired(true)
        .addChoices(
          { name: 'Claude Code', value: 'claude_code' },
          { name: 'Claude Web',  value: 'claude_web'  },
          { name: 'Claude API',  value: 'claude_api'  },
          { name: 'Other',       value: 'other'       },
        )
    )
    .addAttachmentOption(opt =>
      opt
        .setName('thumbnail')
        .setDescription('Optional image / thumbnail for your project')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireMember(interaction))) return;

    // Cooldown: reject if this user submitted within the window.
    const now = nowSec();
    const last = await pg.get(
      'SELECT max(submitted_at) AS ts FROM projects WHERE submitted_by = $1',
      [interaction.user.id],
    );
    if (last?.ts && now - last.ts < SUBMIT_COOLDOWN_SECONDS) {
      const readyAt = last.ts + SUBMIT_COOLDOWN_SECONDS;
      return interaction.reply({
        embeds: [errorEmbed(
          'Slow down',
          `You can submit another project <t:${readyAt}:R>. One submission every 4 hours keeps the review queue manageable.`,
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    const builtWith  = interaction.options.getString('built_with');
    const attachment = interaction.options.getAttachment('thumbnail');
    const thumbUrl   = attachment?.proxyURL ?? '';

    pendingSubmissions.set(interaction.user.id, { builtWith, thumbUrl });

    const modal = new ModalBuilder()
      .setCustomId('submit_project')
      .setTitle('Submit Your Project');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('project_name')
          .setLabel('Project Name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description (200 characters max)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(200)
          .setPlaceholder('A short summary of what your project does.')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('github_url')
          .setLabel('GitHub Repository')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(200)
          .setPlaceholder('https://github.com/your-name/your-repo')
          .setRequired(true),
      ),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const pending = pendingSubmissions.get(interaction.user.id) ?? { builtWith: 'none', thumbUrl: '' };
    pendingSubmissions.delete(interaction.user.id);

    const name        = interaction.fields.getTextInputValue('project_name').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const githubUrl   = interaction.fields.getTextInputValue('github_url').trim();
    const { builtWith, thumbUrl } = pending;

    // Discord enforces the modal's 200-char cap, but guard server-side too.
    if (description.length > 200) {
      return interaction.editReply({
        embeds: [errorEmbed('Description too long', `Keep it under 200 characters — yours was ${description.length}.`)],
      });
    }

    if (!GITHUB_REPO_RE.test(githubUrl)) {
      return interaction.editReply({
        embeds: [errorEmbed('Invalid GitHub link', 'Enter a public GitHub repository URL, e.g. `https://github.com/your-name/your-repo`.')],
      });
    }

    const guildId      = interaction.guildId;
    const now          = nowSec();
    const voteEndsAt   = now + 7 * 24 * 3600;
    const submitterTag = interaction.user.username;

    const [projectsChannelId] = config.getValues(guildId, CONFIG_KEYS.PROJECTS_CHANNEL);
    const [reviewChannelId]   = config.getValues(guildId, CONFIG_KEYS.PROJECTS_REVIEW_CHANNEL);

    if (!projectsChannelId) {
      return interaction.editReply({
        embeds: [errorEmbed('Not configured', 'The projects channel has not been set up. Ask an ambassador to run `/setup-add`.')],
      });
    }
    if (!reviewChannelId) {
      return interaction.editReply({
        embeds: [errorEmbed('Not configured', 'The projects review channel has not been set up. Ask an ambassador to run `/setup-add`.')],
      });
    }

    // Insert the row and work from what the DB actually stored, so the embed
    // can't drift from the persisted project.
    const { rows: [project] } = await pg.query(
      `INSERT INTO projects
         (name, description, github_url, builder_name, submitted_by, submitter_tag,
          submitted_at, thumbnail_url, built_with, guild_id, vote_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        name, description, githubUrl, submitterTag,
        interaction.user.id, submitterTag, now,
        thumbUrl || null, builtWith, guildId, voteEndsAt,
      ],
    );
    const projectId = project.id;

    try {
      // ── Public projects channel ──────────────────────────────────────────────
      const projectsChannel = await interaction.client.channels.fetch(projectsChannelId);
      const publicMsg = await projectsChannel.send({
        embeds: [buildProjectEmbed(project)],
      });

      const thread = await publicMsg.startThread({
        name:                name.slice(0, 100),
        autoArchiveDuration: 10080, // 7 days
      });

      // ── Review channel ───────────────────────────────────────────────────────
      const reviewChannel = await interaction.client.channels.fetch(reviewChannelId);
      const reviewMsg = await reviewChannel.send({
        embeds: [buildProjectEmbed(project, { forReview: true, counts: { upvotes: 0, downvotes: 0 } })],
        components: [buildVoteRow(projectId)],
      });

      await pg.query(
        `UPDATE projects
            SET message_id = $1, thread_id = $2, review_message_id = $3
          WHERE id = $4`,
        [publicMsg.id, thread.id, reviewMsg.id, projectId],
      );

      // ── Mod log ──────────────────────────────────────────────────────────────
      await logToModLog(interaction.client, guildId, modLogEmbed({
        color: 0xdd7659,
        title: '📁⠀Project Submitted',
        fields: [
          { name: 'Project',      value: name,                        inline: true  },
          { name: 'Submitted By', value: `<@${interaction.user.id}>`, inline: true  },
          { name: 'Description',  value: description.slice(0, 1024),   inline: false },
        ],
      }));

      logger.info(`Project ${projectId} (${name}) submitted by ${interaction.user.id}`);

      return interaction.editReply({
        embeds: [successEmbed(
          'Project Submitted!',
          `**${name}** is now live in <#${projectsChannelId}>. A discussion thread has been opened there — feel free to share more details!`,
        )],
      });
    } catch (err) {
      logger.error(`Failed to post project ${projectId}: ${err.message}`, err);
      await pg.query('DELETE FROM projects WHERE id = $1', [projectId]).catch(() => {});
      return interaction.editReply({
        embeds: [errorEmbed('Submission Failed', 'Could not post your project. Please try again or contact an ambassador.')],
      });
    }
  },
};
