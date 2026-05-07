const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const config = require('../../utils/config');
const { SETUP_CHOICES, CHANNEL_KEYS, CATEGORY_KEYS, ROLE_KEYS } = require('../../constants');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { isAdmin } = require('../../utils/permissions');
const { buildSetupBoard } = require('../../utils/setupBoard');
const { logToModLog } = require('../../utils/eventHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-remove')
    .setDescription('Remove a channel, category, or role from a bot setting.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt
        .setName('from')
        .setDescription('Which setting to remove from')
        .setRequired(true)
        .addChoices(...SETUP_CHOICES)
    )
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('Channel to remove (for text channel settings)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption(opt =>
      opt
        .setName('category')
        .setDescription('Category to remove (for category settings like Ticket Category)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    )
    .addRoleOption(opt =>
      opt
        .setName('role')
        .setDescription('Role to remove (for role settings)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Access denied', 'This command is restricted to admins.')], flags: MessageFlags.Ephemeral });
    }
    const from     = interaction.options.getString('from');
    const channel  = interaction.options.getChannel('channel');
    const category = interaction.options.getChannel('category');
    const role     = interaction.options.getRole('role');

    const isChannelType  = CHANNEL_KEYS.has(from);
    const isCategoryType = CATEGORY_KEYS.has(from);
    const isRoleType     = ROLE_KEYS.has(from);
    const label = SETUP_CHOICES.find(c => c.value === from).name;

    const typeLabel = isRoleType ? 'role' : isCategoryType ? 'category' : 'channel';

    if (!channel && !category && !role) {
      return interaction.reply({
        embeds: [errorEmbed('Missing value', `Provide a ${typeLabel} to remove from **${label}**.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Mismatch guards
    if (isChannelType && (category || role)) {
      return interaction.reply({
        embeds: [errorEmbed('Wrong type', `**${label}** stores text channels. Use the \`channel\` option.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (isCategoryType && (channel || role)) {
      return interaction.reply({
        embeds: [errorEmbed('Wrong type', `**${label}** stores categories. Use the \`category\` option.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (isRoleType && (channel || category)) {
      return interaction.reply({
        embeds: [errorEmbed('Wrong type', `**${label}** stores roles. Use the \`role\` option.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    let value, mention;
    if (isRoleType)          { value = role.id;     mention = `<@&${value}>`; }
    else if (isChannelType)  { value = channel.id;  mention = `<#${value}>`; }
    else                     { value = category.id; mention = `<#${value}>`; }

    const removed = config.removeValue(interaction.guildId, from, value);

    if (!removed) {
      return interaction.reply({
        embeds: [errorEmbed('Not found', `${mention} is not in **${label}**.`), buildSetupBoard(interaction.guildId)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⚙️⠀Setup Updated — Removed')
      .addFields(
        { name: 'Setting',    value: label,                           inline: true },
        { name: 'Value',      value: mention,                         inline: true },
        { name: 'Updated By', value: `<@${interaction.user.id}>`,    inline: true },
      )
      .setTimestamp();
    await logToModLog(interaction.client, interaction.guildId, logEmbed);

    return interaction.reply({
      embeds: [successEmbed('Setting updated', `Removed ${mention} from **${label}**.`), buildSetupBoard(interaction.guildId)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
