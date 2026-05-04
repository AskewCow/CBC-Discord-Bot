const { COMMITTEE_ROLE_ID, MOD_ROLE_ID } = require('../constants');

function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

function isCommittee(member) {
  return hasRole(member, COMMITTEE_ROLE_ID);
}

function isMod(member) {
  return hasRole(member, MOD_ROLE_ID) || isCommittee(member);
}

module.exports = { hasRole, isCommittee, isMod };
