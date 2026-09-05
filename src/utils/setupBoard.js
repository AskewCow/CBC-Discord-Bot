const { EmbedBuilder } = require('discord.js');
const { brandFooter } = require('./embeds');
const config = require('./config');
const { SETUP_CHOICES, CHANNEL_KEYS, CATEGORY_KEYS, ROLE_KEYS } = require('../constants');

function buildSetupBoard(guildId) {
  const channelLines  = [];
  const categoryLines = [];
  const roleLines     = [];

  for (const { name, value } of SETUP_CHOICES) {
    const values = config.getValues(guildId, value);
    const isRole = ROLE_KEYS.has(value);
    const formatted = values.length
      ? values.map(v => isRole ? `<@&${v}>` : `<#${v}>`).join(', ')
      : '*Not configured*';
    const icon = values.length ? '✅' : '❌';
    const line = `${icon} **${name}**\n└ ${formatted}`;

    if (CHANNEL_KEYS.has(value))        channelLines.push(line);
    else if (CATEGORY_KEYS.has(value))  categoryLines.push(line);
    else if (ROLE_KEYS.has(value))      roleLines.push(line);
  }

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚙️⠀Server Setup')
    .addFields(
      { name: 'Channels',   value: channelLines.join('\n\n')  || '*None defined*', inline: false },
      { name: 'Categories', value: categoryLines.join('\n\n') || '*None defined*', inline: false },
      { name: 'Roles',      value: roleLines.join('\n\n')     || '*None defined*', inline: false },
    )
    .setFooter(brandFooter('Use /setup-add and /setup-remove to configure.'));
}

module.exports = { buildSetupBoard };
