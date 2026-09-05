const { EmbedBuilder } = require('discord.js');

const BRAND_COLOR = 0x5865f2;

const BRAND_FOOTER_TEXT = 'Claude Builder Club · TCD';
// Served from the repo (assets/claude-footer.png) via GitHub's CDN — no
// third-party image host or token. Discord proxies and caches it.
const BRAND_FOOTER_ICON =
  'https://raw.githubusercontent.com/AskewCow/CBC-Discord-Bot/main/assets/claude-footer.png';

// Standard footer for every embed the bot sends. Pass a string to keep a
// context-specific label (e.g. "CBC Events") while still showing the icon.
function brandFooter(text = BRAND_FOOTER_TEXT) {
  return { text, iconURL: BRAND_FOOTER_ICON };
}

function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(title)
    .setDescription(description)
    .setFooter(brandFooter());
}

function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(title)
    .setDescription(description)
    .setFooter(brandFooter());
}

function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setFooter(brandFooter());
}

module.exports = {
  successEmbed,
  errorEmbed,
  infoEmbed,
  brandFooter,
  BRAND_FOOTER_TEXT,
  BRAND_FOOTER_ICON,
};
