const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('./config');
const { CONFIG_KEYS } = require('../constants');
const { errorEmbed } = require('./embeds');

// True Discord Administrator permission always passes — this is the server's
// own access control, independent of anything configured via /setup-add.
function isAmbassador(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return config.getValues(member.guild.id, CONFIG_KEYS.AMBASSADOR_ROLE)
    .some(id => member.roles.cache.has(id));
}

function isCommittee(member) {
  if (isAmbassador(member)) return true;
  return config.getValues(member.guild.id, CONFIG_KEYS.COMMITTEE_ROLE)
    .some(id => member.roles.cache.has(id));
}

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

// Holds the configured Member role (assigned on completing onboarding).
// Ambassadors/committee always count. If no Member role is configured for the
// guild, this passes for everyone — the gate only applies once one is set.
function isMember(member) {
  if (isCommittee(member)) return true;
  const memberRoles = config.getValues(member.guild.id, CONFIG_KEYS.MEMBER_ROLE);
  if (memberRoles.length === 0) return true;
  return memberRoles.some(id => member.roles.cache.has(id));
}

// "Mod" / staff = anyone with ambassador or committee privileges. These are
// the roles granted management access inside ticket channels.
function isMod(member) {
  return isCommittee(member);
}

async function _deny(interaction, who) {
  const body = {
    embeds: [errorEmbed('Access denied', `This command is restricted to ${who}.`)],
    flags: MessageFlags.Ephemeral,
  };
  if (interaction.deferred || interaction.replied) await interaction.followUp(body);
  else await interaction.reply(body);
  return false;
}

// Command guards — use at the top of an execute():
//   if (!(await requireAmbassador(interaction))) return;
async function requireAmbassador(interaction) {
  if (isAmbassador(interaction.member)) return true;
  return _deny(interaction, 'ambassadors');
}

async function requireCommittee(interaction) {
  if (isCommittee(interaction.member)) return true;
  return _deny(interaction, 'ambassadors and committee members');
}

async function requireMember(interaction) {
  if (isMember(interaction.member)) return true;
  return _deny(interaction, 'members (complete onboarding first)');
}

module.exports = {
  isAmbassador,
  isCommittee,
  isMember,
  hasRole,
  isMod,
  requireAmbassador,
  requireCommittee,
  requireMember,
};
