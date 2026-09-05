const { Events } = require('discord.js');
const pg                      = require('../../database/pg');   // Postgres — members
const logger                  = require('../../utils/logger');
const { nowSec }              = require('../../utils/time');
const { startOnboardingFlow } = require('../../utils/onboardingFlow');
const {
  getActiveLeaderboards,
  buildInviteMap,
  bumpInviteUse,
} = require('../../utils/inviteUtils');
const { revalidateWebsite }    = require('../../utils/websiteRevalidate');

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    logger.info(`New member joined: ${member.user.tag} (${member.id})`);

    const { usedCode, inviterId } = await detectUsedInvite(member);

    await upsertMember(member, usedCode);
    if (usedCode && inviterId) bumpInviteUse(usedCode, inviterId, member.guild.id);

    revalidateWebsite(['stats']).catch(() => {});
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

  let usedCode  = null;
  let inviterId = null;

  for (const invite of newInvites.values()) {
    if (!invite.inviter) continue;
    const prior = cachedMap.get(invite.code);
    // Existing invite whose use count went up, or a brand-new invite that
    // already has a use — either way this member came through it.
    if ((prior && invite.uses > prior.uses) || (!prior && invite.uses > 0)) {
      usedCode  = invite.code;
      inviterId = invite.inviter.id;
      break;
    }
  }

  client.inviteCache.set(guildId, buildInviteMap(newInvites));
  return { usedCode, inviterId };
}

async function upsertMember(member, inviteCode) {
  await pg.query(
    `INSERT INTO members (discord_id, username, joined_at, invite_code, left_at)
     VALUES ($1, $2, $3, $4, NULL)
     ON CONFLICT (discord_id) DO UPDATE SET
       username    = excluded.username,
       joined_at   = excluded.joined_at,
       invite_code = COALESCE(excluded.invite_code, members.invite_code),
       left_at     = NULL`,
    [member.id, member.user.tag, nowSec(), inviteCode ?? null],
  );
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
