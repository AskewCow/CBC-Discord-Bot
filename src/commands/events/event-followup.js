const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { requireAmbassador } = require('../../utils/permissions');

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

    // No options — show current config
    if (!message && !linkText && !linkUrl) {
      const current = db.prepare('SELECT * FROM event_thank_you WHERE guild_id = ?').get(interaction.guildId);
      if (!current) {
        return interaction.reply({
          embeds: [infoEmbed(
            'Post-event follow-up message',
            'No custom message set. Default:\n\n*Thank you for attending! We hope to see you at our next event.*',
          )],
          flags: MessageFlags.Ephemeral,
        });
      }
      const lines = [`**Message:** ${current.message}`];
      if (current.link_text && current.link_url) {
        lines.push(`**Link:** [${current.link_text}](${current.link_url})`);
      }
      return interaction.reply({
        embeds: [infoEmbed('Current post-event follow-up message', lines.join('\n'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Validate URL if provided
    if (linkUrl) {
      try { new URL(linkUrl); } catch {
        return interaction.reply({
          embeds: [errorEmbed('Invalid URL', 'Please provide a valid URL (e.g. `https://example.com`).')],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const current     = db.prepare('SELECT * FROM event_thank_you WHERE guild_id = ?').get(interaction.guildId);
    const newMessage  = message  ?? current?.message  ?? 'Thank you for attending! We hope to see you at our next event.';
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

    const lines = [`**Message:** ${newMessage}`];
    if (newLinkText && newLinkUrl) lines.push(`**Link:** [${newLinkText}](${newLinkUrl})`);

    return interaction.reply({
      embeds: [successEmbed('Post-event follow-up message updated', lines.join('\n'))],
      flags: MessageFlags.Ephemeral,
    });
  },
};
