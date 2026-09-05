// Shared implementation for /setup-add and /setup-remove — they differ only in
// the verb (add vs remove), the option name, and a couple of strings.

const { ChannelType, MessageFlags } = require('discord.js');
const config = require('./config');
const { SETUP_CHOICES, KIND_BY_KEY } = require('../constants');
const { successEmbed, errorEmbed } = require('./embeds');
const { requireAmbassador } = require('./permissions');
const { buildSetupBoard } = require('./setupBoard');
const { logToModLog, modLogEmbed } = require('./modLog');

const KIND_WORD = { channel: 'text channels', category: 'categories', role: 'roles' };

/** Add the value + channel/category/role options that both commands share. */
function addSetupOptions(sub, { valueName, valueDesc }) {
  return sub
    .addStringOption((opt) =>
      opt.setName(valueName).setDescription(valueDesc).setRequired(true).addChoices(...SETUP_CHOICES),
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel (for text-channel settings)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addChannelOption((opt) =>
      opt
        .setName('category')
        .setDescription('Category (for category settings like Ticket Category)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory),
    )
    .addRoleOption((opt) =>
      opt.setName('role').setDescription('Role (for role settings)').setRequired(false),
    );
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {'add'|'remove'} mode
 * @param {string} valueName  the string-option name ('type' for add, 'from' for remove)
 */
async function runSetupChange(interaction, mode, valueName) {
  if (!(await requireAmbassador(interaction))) return;

  const key      = interaction.options.getString(valueName);
  const channel  = interaction.options.getChannel('channel');
  const category = interaction.options.getChannel('category');
  const role     = interaction.options.getRole('role');

  const kind  = KIND_BY_KEY[key];
  const label = SETUP_CHOICES.find((c) => c.value === key).name;
  const ephemeral = { flags: MessageFlags.Ephemeral };
  const reply = (embed, extra = []) =>
    interaction.reply({ embeds: [embed, ...extra], ...ephemeral });

  // add with no value shows the board; remove with no value is an error.
  if (!channel && !category && !role) {
    return mode === 'add'
      ? interaction.reply({ embeds: [buildSetupBoard(interaction.guildId)], ...ephemeral })
      : reply(errorEmbed('Missing value', `Provide a ${kind} to remove from **${label}**.`));
  }

  const provided = channel ?? category ?? role;
  const providedKind = role ? 'role' : category ? 'category' : 'channel';
  if (providedKind !== kind) {
    return reply(
      errorEmbed('Wrong type', `**${label}** stores ${KIND_WORD[kind]}. Use the \`${kind}\` option.`),
    );
  }

  const value   = provided.id;
  const mention  = kind === 'role' ? `<@&${value}>` : `<#${value}>`;
  const changed = mode === 'add'
    ? config.addValue(interaction.guildId, key, value)
    : config.removeValue(interaction.guildId, key, value);

  if (!changed) {
    const msg = mode === 'add'
      ? errorEmbed('Already added', `${mention} is already in **${label}**.`)
      : errorEmbed('Not found', `${mention} is not in **${label}**.`);
    return reply(msg, [buildSetupBoard(interaction.guildId)]);
  }

  // The website's ambassador/committee sidebar is derived from these roles.
  if (key === 'ambassador_role' || key === 'committee_role') {
    require('./roster').syncRoster(interaction.guild).catch(() => {});
  }

  await logToModLog(
    interaction.client,
    interaction.guildId,
    modLogEmbed({
      color: mode === 'add' ? 0x57f287 : 0xed4245,
      title: `⚙️⠀Setup Updated — ${mode === 'add' ? 'Added' : 'Removed'}`,
      fields: [
        { name: 'Setting',    value: label,                        inline: true },
        { name: 'Value',      value: mention,                      inline: true },
        { name: 'Updated By', value: `<@${interaction.user.id}>`, inline: true },
      ],
    }),
  );

  const verb = mode === 'add' ? 'Added' : 'Removed';
  const prep = mode === 'add' ? 'to' : 'from';
  return reply(
    successEmbed('Setting updated', `${verb} ${mention} ${prep} **${label}**.`),
    [buildSetupBoard(interaction.guildId)],
  );
}

module.exports = { addSetupOptions, runSetupChange };
