const { PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const { CONFIG_KEYS } = require('../constants');

function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return config.getValues(member.guild.id, CONFIG_KEYS.ADMIN_ROLE)
    .some(id => member.roles.cache.has(id));
}

function isCommittee(member) {
  if (isAdmin(member)) return true;
  return config.getValues(member.guild.id, CONFIG_KEYS.COMMITTEE_ROLE)
    .some(id => member.roles.cache.has(id));
}

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

module.exports = { isAdmin, isCommittee, hasRole };
