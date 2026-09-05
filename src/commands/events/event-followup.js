const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { requireAmbassador } = require('../../utils/permissions');
const { DEFAULT_EVENT_THANKYOU } = require('../../constants');

const getThankYou = (guildId) =>
  db.prepare('SELECT * FROM event_thank_you WHERE guild_id = ?').get(guildId);

const summarise = (message, linkText, linkUrl) => {
  const lines = [`**Message:** ${message}`];
  if (linkText && linkUrl) lines.push(`**Link:** [${linkText}](${linkUrl})`);
  return lines.join('\n');
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event-followup')
    .setDescription('Configure the post-event message sent to attendees after an event ends')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('message').setDescription('The follow-up message text').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('link_text').setDescription('Hyperlink label (e.g. "Join our newsletter")').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('link_url').setDescription('URL for the hyperlink').setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireAmbassador(interaction))) return;

    const message  = interaction.options.getString('message');
    const linkText = interaction.options.getString('link_text');
    const linkUrl  = interaction.options.getString('link_url');
    const current  = getThankYou(interaction.guildId);

    // No options — show current config.
    if (!message && !linkText && !linkUrl) {
      return interaction.reply({
        embeds: [current
          ? infoEmbed('Current post-event follow-up message', summarise(current.message, current.link_text, current.link_url))
          : infoEmbed(
              'Post-event follow-up message',
              `No custom message set. Default:\n\n*${DEFAULT_EVENT_THANKYOU}*`,
            )],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Validate URL if provided.
    if (linkUrl) {
      try { new URL(linkUrl); } catch {
        return interaction.reply({
          embeds: [errorEmbed('Invalid URL', 'Please provide a valid URL (e.g. `https://example.com`).')],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const newMessage  = message  ?? current?.message   ?? DEFAULT_EVENT_THANKYOU;
    const newLinkText = linkText ?? current?.link_text ?? null;
    const newLinkUrl  = linkUrl  ?? current?.link_url  ?? null;

    db.prepare(`
      INSERT INTO event_thank_you (guild_id, message, link_text, link_url)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        message   = excluded.message,
        link_text = excluded.link_text,
        link_url  = excluded.link_url
    `).run(interaction.guildId, newMessage, newLinkText, newLinkUrl);

    return interaction.reply({
      embeds: [successEmbed('Post-event follow-up message updated', summarise(newMessage, newLinkText, newLinkUrl))],
      flags: MessageFlags.Ephemeral,
    });
  },
};
