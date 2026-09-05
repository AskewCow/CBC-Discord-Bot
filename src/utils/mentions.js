const cfg = require('./config');

// Renders the channel(s) or role(s) configured for a /setup-add key as live
// Discord mentions, or a plain-text fallback when nothing is linked. Use this
// anywhere a user-facing message refers to a configurable channel/role so it
// resolves to a real #channel / @role instead of bare text.
//
//   mentionConfigured(guildId, CONFIG_KEYS.AMBASSADOR_ROLE, { type: 'role', fallback: 'the Ambassador role' })
function mentionConfigured(guildId, key, { type, fallback }) {
  const ids = guildId ? cfg.getValues(guildId, key) : [];
  if (!ids.length) return fallback;
  const wrap = type === 'role' ? (id) => `<@&${id}>` : (id) => `<#${id}>`;
  return ids.map(wrap).join(' ');
}

module.exports = { mentionConfigured };
