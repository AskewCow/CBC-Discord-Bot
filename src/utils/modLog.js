const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const logger = require('./logger');
const { CONFIG_KEYS } = require('../constants');
const { brandFooter } = require('./embeds');

// Standard mod-log embed. Pass a plain object; `fields` is passed straight to
// EmbedBuilder#addFields. The brand footer is applied unless `footer` is given.
function modLogEmbed({ color, title, description, fields = [], footer } = {}) {
  const embed = new EmbedBuilder().setColor(color ?? 0x5865f2).setTitle(title);
  if (description) embed.setDescription(description);
  if (fields.length) embed.addFields(...fields);
  embed.setFooter(footer ? brandFooter(footer) : brandFooter());
  return embed;
}

/**
 * Post an embed to every configured mod-log channel for a guild. Best-effort:
 * missing config or an unreachable channel is skipped silently.
 */
async function logToModLog(client, guildId, embed, files = []) {
  const channelIds = config.getValues(guildId, CONFIG_KEYS.MOD_LOG_CHANNEL);
  if (!channelIds.length) return;
  for (const channelId of channelIds) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) continue;
    await channel
      .send({ embeds: [embed], files })
      .catch((err) => logger.warn(`Could not post to mod log ${channelId}: ${err.message}`));
  }
}

module.exports = { logToModLog, modLogEmbed };
