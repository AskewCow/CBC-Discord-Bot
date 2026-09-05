const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { requireAmbassador } = require('../../utils/permissions');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const backupConfig = require('../../utils/backupConfig');
const { runBackup } = require('../../utils/backupUtils');
const config = require('../../utils/config');
const { CONFIG_KEYS } = require('../../constants');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription("Configure scheduled data backups, DM'd to the Ambassador role.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Turn on scheduled backups')
        .addIntegerOption((opt) =>
          opt
            .setName('interval')
            .setDescription('Days between backups (default 7, or keeps the current value)')
            .setMinValue(1)
            .setMaxValue(365)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Turn off scheduled backups'))
    .addSubcommand((sub) =>
      sub
        .setName('interval')
        .setDescription("Change how often backups run, without touching on/off")
        .addIntegerOption((opt) =>
          opt
            .setName('days')
            .setDescription('Days between backups')
            .setMinValue(1)
            .setMaxValue(365)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the current backup configuration'))
    .addSubcommand((sub) => sub.setName('run-now').setDescription('Run a backup immediately, regardless of schedule')),

  async execute(interaction) {
    if (!(await requireAmbassador(interaction))) return;

    const ambassadorRoles = config.getValues(interaction.guildId, CONFIG_KEYS.AMBASSADOR_ROLE);
    if (ambassadorRoles.length === 0) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            'Ambassador role not set',
            "Backups are DM'd to the Ambassador role, but none is configured yet — set one with `/setup-add type:Ambassador Role role:@...` first.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const ambassadorMention = ambassadorRoles.length
      ? ambassadorRoles.map((id) => `<@&${id}>`).join(', ')
      : '**Ambassador**';

    const sub = interaction.options.getSubcommand();

    if (sub === 'enable') {
      const interval = interaction.options.getInteger('interval');
      const current = backupConfig.getConfig(interaction.guildId);
      const updated = backupConfig.upsertConfig(
        interaction.guildId,
        { enabled: true, intervalDays: interval ?? current.interval_days },
        interaction.user.id,
      );
      return interaction.reply({
        embeds: [
          successEmbed(
            'Backups enabled',
            `Every **${updated.interval_days}** day(s), a Postgres + bot-data backup will be DM'd to everyone with the ${ambassadorMention} role.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'disable') {
      backupConfig.upsertConfig(interaction.guildId, { enabled: false }, interaction.user.id);
      return interaction.reply({
        embeds: [successEmbed('Backups disabled', 'Scheduled backups are now off.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'interval') {
      const days = interaction.options.getInteger('days', true);
      const updated = backupConfig.upsertConfig(interaction.guildId, { intervalDays: days }, interaction.user.id);
      return interaction.reply({
        embeds: [
          successEmbed(
            'Interval updated',
            `Backups now run every **${updated.interval_days}** day(s)` +
              (updated.enabled ? '.' : ' (currently disabled — run `/backup enable` to turn them on).'),
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'status') {
      const c = backupConfig.getConfig(interaction.guildId);
      return interaction.reply({
        embeds: [
          infoEmbed(
            '🗄️⠀Backup status',
            [
              `**Enabled:** ${c.enabled ? 'yes' : 'no'}`,
              `**Interval:** every ${c.interval_days} day(s)`,
              `**Last run:** ${c.last_run_at ? `<t:${c.last_run_at}:R>` : 'never'}`,
            ].join('\n'),
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'run-now') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const result = await runBackup(interaction.client, interaction.guild);
        return interaction.editReply({
          embeds: [
            successEmbed(
              'Backup sent',
              `Sent to ${result.sent}/${result.recipients} ambassador(s).` +
                (result.failed ? ` ${result.failed} couldn't be DM'd (DMs likely closed).` : ''),
            ),
          ],
        });
      } catch (err) {
        logger.error(`Manual backup failed: ${err.message}`, err);
        return interaction.editReply({
          embeds: [errorEmbed('Backup failed', `\`${err.message}\``)],
        });
      }
    }
  },
};
