const { Events } = require('discord.js');
const db                      = require('../../database/db');
const logger                  = require('../../utils/logger');
const { startOnboardingFlow } = require('../../utils/onboardingFlow');
const { getActiveLeaderboards } = require('../../utils/inviteUtils');

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    logger.info(`New member joined: ${member.user.tag} (${member.id})`);

    const { usedCode, inviterId } = await detectUsedInvite(member);

    upsertMember(member, usedCode);
    if (usedCode && inviterId) syncInviteUses(member.guild.id, usedCode, inviterId);

    await refreshLiveLeaderboards(member);

    try {
      await startOnboardingFlow(member, member.guild);
    } catch (err) {
      logger.error(`Onboarding DM failed for ${member.user.tag}: ${err.message}`, err);
    }
  },
};

async function detectUsedInvite(member) {
  const client   = member.client;
  const guildId  = member.guild.id;
  const cachedMap = client.inviteCache.get(guildId) ?? new Map();

  let newInvites;
  try {
    newInvites = await member.guild.invites.fetch();
  } catch (err) {
    logger.warn(`Could not fetch invites on member join: ${err.message}`);
    return { usedCode: null, inviterId: null };
  }

  let usedCode   = null;
  let inviterId  = null;

  for (const invite of newInvites.values()) {
    if (!invite.inviter) continue;
    const prior = cachedMap.get(invite.code);
    if (prior && invite.uses > prior.uses) {
      usedCode  = invite.code;
      inviterId = invite.inviter.id;
      break;
    }
    // New invite (not previously cached) with uses > 0 means it was just created and used
    if (!prior && invite.uses > 0) {
      usedCode  = invite.code;
      inviterId = invite.inviter.id;
      break;
    }
  }

  // Refresh cache with current invite state
  const newMap = new Map();
  for (const invite of newInvites.values()) {
    if (invite.inviter) {
      newMap.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter.id });
    }
  }
  client.inviteCache.set(guildId, newMap);

  return { usedCode, inviterId };
}

function upsertMember(member, inviteCode) {
  db.prepare(`
    INSERT INTO members (discord_id, username, joined_at, invite_code, left_at)
    VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT(discord_id) DO UPDATE SET
      username = excluded.username,
      joined_at = excluded.joined_at,
      invite_code = COALESCE(excluded.invite_code, invite_code),
      left_at = NULL
  `).run(member.id, member.user.tag, Date.now(), inviteCode ?? null);
}

async function refreshLiveLeaderboards(member) {
  const records = getActiveLeaderboards(member.guild.id);
  if (!records.length) return;

  // Lazy-require to avoid circular dependency at module load time
  const { refreshLiveLeaderboard } = require('../../commands/social/leaderboard');
  for (const record of records) {
    await refreshLiveLeaderboard(member.client, record).catch(err =>
      logger.warn(`Failed to refresh live leaderboard ${record.message_id}: ${err.message}`)
    );
  }
}

function syncInviteUses(guildId, code, inviterId) {
  db.prepare(`
    INSERT INTO invites (code, inviter_id, uses, guild_id, created_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      uses = uses + 1,
      last_used_at = ?
  `).run(code, inviterId, guildId, Date.now(), Date.now());
}
