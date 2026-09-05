const { EmbedBuilder } = require('discord.js');

const BRAND_COLOR = 0x5865f2;

function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(title)
    .setDescription(description);
}

function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(title)
    .setDescription(description);
}

function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(title)
    .setDescription(description);
}

module.exports = { successEmbed, errorEmbed, infoEmbed };
