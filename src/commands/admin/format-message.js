const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { requireAdmin } = require('../../utils/permissions');
const pg = require('../../database/pg');
const logger = require('../../utils/logger');
const { revalidateWebsite } = require('../../utils/websiteRevalidate');

const STYLES = {
  announcement: { label: '📢 Announcement', color: 0x6A9BCC }, // sky
  reminder:     { label: '⏰ Reminder',      color: 0xD97757 }, // terracotta
  shoutout:     { label: '🌟 Shoutout',      color: 0xCD9D7D }, // sand
  resource:     { label: '📚 Resource',      color: 0x788C5D }, // sage
};

const FOOTER_TEXT = 'Claude Builder Club | Trinity College Dublin';
const FOOTER_ICON = 'https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/claude-color.png';

const COLORS = {
  default:    null,
  black:      0x141413,
  white:      0xFAF9F5,
  stone:      0xB0AEA5,
  mist:       0xE8E6DC,
  terracotta: 0xD97757,
  sky:        0x6A9BCC,
  sage:       0x788C5D,
  sand:       0xCD9D7D,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('format-message')
    .setDescription('Post a formatted club message to this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('style')
        .setDescription('Message style / type')
        .setRequired(true)
        .addChoices(
          { name: '📢 Announcement', value: 'announcement' },
          { name: '⏰ Reminder',      value: 'reminder' },
          { name: '🌟 Shoutout',      value: 'shoutout' },
          { name: '📚 Resource',      value: 'resource' },
        ),
    )
    .addBooleanOption(opt =>
      opt.setName('embed')
        .setDescription('Post as a rich embed instead of plain text')
        .setRequired(true),
    )
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('Embed accent color (ignored for plain text)')
        .setRequired(false)
        .addChoices(
          { name: 'Default (style preset)', value: 'default'    },
          { name: 'Black',                  value: 'black'      },
          { name: 'White',                  value: 'white'      },
          { name: 'Stone',                  value: 'stone'      },
          { name: 'Mist',                   value: 'mist'       },
          { name: 'Terracotta',             value: 'terracotta' },
          { name: 'Sky',                    value: 'sky'        },
          { name: 'Sage',                   value: 'sage'       },
          { name: 'Sand',                   value: 'sand'       },
        ),
    )
    .addBooleanOption(opt =>
      opt.setName('ping_everyone')
        .setDescription('Send an @everyone ping after the message (default: false)')
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    const style        = interaction.options.getString('style');
    const useEmbed     = interaction.options.getBoolean('embed');
    const colorKey     = interaction.options.getString('color') ?? 'default';
    const pingEveryone = interaction.options.getBoolean('ping_everyone') ?? false;

    const modal = new ModalBuilder()
      .setCustomId(`format_message:${style}:${useEmbed}:${colorKey}:${pingEveryone}`)
      .setTitle(`${STYLES[style].label} — compose`);

    const titleInput = new TextInputBuilder()
      .setCustomId('msg_title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(256)
      .setRequired(true);

    const bodyInput = new TextInputBuilder()
      .setCustomId('msg_body')
      .setLabel('Body (supports markdown, newlines)')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(2000)
      .setRequired(true);

    const linkLabelInput = new TextInputBuilder()
      .setCustomId('msg_link_label')
      .setLabel('Link label (optional)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(false);

    const linkUrlInput = new TextInputBuilder()
      .setCustomId('msg_link_url')
      .setLabel('Link URL (optional)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(512)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(bodyInput),
      new ActionRowBuilder().addComponents(linkLabelInput),
      new ActionRowBuilder().addComponents(linkUrlInput),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const [, style, useEmbedStr, colorKey, pingEveryoneStr] = interaction.customId.split(':');
    const useEmbed     = useEmbedStr === 'true';
    const pingEveryone = pingEveryoneStr === 'true';

    const title     = interaction.fields.getTextInputValue('msg_title');
    const body      = interaction.fields.getTextInputValue('msg_body');
    const linkLabel = interaction.fields.getTextInputValue('msg_link_label').trim();
    const linkUrl   = interaction.fields.getTextInputValue('msg_link_url').trim();

    if (linkUrl && !/^https:\/\//i.test(linkUrl)) {
      return interaction.reply({
        content: 'Invalid URL — must start with `https://`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Acknowledge the modal privately so the posted message stands on its own,
    // with no reply reference back to the invoking command.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let linkFragment = '';
    if (linkUrl) {
      linkFragment = linkLabel
        ? `\n\n[${linkLabel}](${linkUrl})`
        : `\n\n${linkUrl}`;
    }

    const styleInfo      = STYLES[style];
    const resolvedColor  = COLORS[colorKey] ?? styleInfo.color;

    let posted;
    if (useEmbed) {
      const embed = new EmbedBuilder()
        .setColor(resolvedColor)
        .setTitle(`${styleInfo.label}: ${title}`)
        .setDescription(body + linkFragment)
        .setFooter({ text: FOOTER_TEXT, iconURL: FOOTER_ICON });

      posted = await interaction.channel.send({ embeds: [embed] });
    } else {
      const header = `**${styleInfo.label}: ${title}**`;
      posted = await interaction.channel.send({
        content: `${header}\n\n${body}${linkFragment}\n\n-# ${FOOTER_TEXT}`,
      });
    }

    // @everyone must be a separate message — embeds suppress mentions
    if (pingEveryone) {
      await interaction.channel.send({ content: '@everyone' });
    }

    // Only the "announcement" style is mirrored to the website feed. The body
    // stored is the raw markdown the admin typed (plus any link), not the
    // decorated Discord version.
    if (style === 'announcement') {
      try {
        await pg.query(
          `INSERT INTO announcements (title, body, author_id, author_tag, channel_id, message_id, posted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            title,
            body + linkFragment,
            interaction.user.id,
            // Server display name (nickname → global name → username): the club
            // asks members to /nick to their real name, so this is what the
            // website shows as "posted by".
            interaction.member?.displayName ?? interaction.user.username,
            interaction.channelId,
            posted.id,
            Math.floor(Date.now() / 1000),
          ],
        );
        revalidateWebsite(['announcements']).catch(() => {});
      } catch (err) {
        logger.error(`Could not persist announcement to Postgres: ${err.message}`, err);
      }
    }

    await interaction.editReply({ content: '✅ Message posted.' });
  },
};
