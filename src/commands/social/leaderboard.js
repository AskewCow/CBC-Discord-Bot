const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { requireAdmin }            = require('../../utils/permissions');
const { getLeaderboard, createLeaderboard } = require('../../utils/inviteUtils');
const { logToModLog }             = require('../../utils/eventHandlers');
const { CONFIG_KEYS }             = require('../../constants');
const config                      = require('../../utils/config');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite-leaderboard')
    .setDescription('Show the top 10 inviters for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('scope')
        .setDescription('What period to count invites over')
        .setRequired(true)
        .addChoices(
          { name: 'All Time',        value: 'all_time' },
          { name: 'Live (from now)', value: 'live'     },
        )
    )
    .addBooleanOption(opt =>
      opt.setName('include_committee')
        .setDescription('Include committee members in the rankings?')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;

    await interaction.deferReply();

    const scope            = interaction.options.getString('scope');
    const includeCommittee = interaction.options.getBoolean('include_committee');
    const guildId          = interaction.guild.id;
    const startedAt        = scope === 'live' ? Date.now() : null;

    let rows = await getLeaderboard(guildId, scope, startedAt);

    if (!includeCommittee) {
      rows = await filterCommittee(interaction.guild, rows);
    }

    rows = rows.slice(0, 10);

    const embed = buildLeaderboardEmbed(rows, scope, includeCommittee, startedAt);
    const reply = await interaction.editReply({ embeds: [embed] });

    createLeaderboard({
      guildId,
      channelId:        reply.channelId,
      messageId:        reply.id,
      scope,
      startedAt:        startedAt ?? Date.now(),
      includeCommittee,
    });

    await logLeaderboard(interaction, scope, includeCommittee, rows, startedAt);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function filterCommittee(guild, rows) {
  const committeeIds = config.getValues(guild.id, CONFIG_KEYS.COMMITTEE_ROLE);
  if (!committeeIds.length) return rows;

  const filtered = [];
  for (const row of rows) {
    const member = await guild.members.fetch(row.inviter_id).catch(() => null);
    if (!member) { filtered.push(row); continue; }
    const isCommittee = committeeIds.some(id => member.roles.cache.has(id));
    if (!isCommittee) filtered.push(row);
  }
  return filtered;
}

function buildLeaderboardEmbed(rows, scope, includeCommittee, startedAt) {
  const isLive   = scope === 'live';
  const scopeLabel = isLive
    ? `Live (since ${new Date(startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })})`
    : 'All Time';

  const embed = new EmbedBuilder()
    .setColor(isLive ? 0x57f287 : 0x5865f2)
    .setTitle(isLive ? '📊 Live Invite Leaderboard' : '📊 Invite Leaderboard')
    .setTimestamp()
    .setFooter({ text: `Scope: ${scopeLabel} • Committee ${includeCommittee ? 'included' : 'excluded'}` });

  if (!rows.length) {
    embed.setDescription(isLive
      ? 'No invites tracked yet — this leaderboard updates as new members join.'
      : 'No invite data found.');
    return embed;
  }

  const lines = rows.map((row, i) => {
    const medal = MEDALS[i] ?? `**${i + 1}.**`;
    const count = row.invite_count;
    return `${medal} <@${row.inviter_id}> — **${count}** invite${count !== 1 ? 's' : ''}`;
  });

  embed.setDescription(lines.join('\n'));
  return embed;
}

async function logLeaderboard(interaction, scope, includeCommittee, rows, startedAt) {
  const top3 = rows.slice(0, 3)
    .map((r, i) => `${MEDALS[i] ?? `${i + 1}.`} <@${r.inviter_id}> (${r.invite_count})`)
    .join('\n') || 'No data yet';

  const scopeLabel = scope === 'live'
    ? `Live (started <t:${Math.floor(startedAt / 1000)}:R>)`
    : 'All Time';

  const logEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 Invite Leaderboard Generated')
    .addFields(
      { name: 'Requested by', value: `<@${interaction.user.id}>`,               inline: true },
      { name: 'Scope',        value: scopeLabel,                                 inline: true },
      { name: 'Committee',    value: includeCommittee ? 'Included' : 'Excluded', inline: true },
      { name: 'Top 3',        value: top3 },
    )
    .setTimestamp();

  await logToModLog(interaction.client, interaction.guild.id, logEmbed);
}

// ── Exported helper: rebuild + edit a live leaderboard message ────────────────

async function refreshLiveLeaderboard(client, record) {
  const { guild_id, channel_id, message_id, scope, started_at, include_committee } = record;

  const guild = client.guilds.cache.get(guild_id);
  if (!guild) return;

  const channel = guild.channels.cache.get(channel_id)
    ?? await client.channels.fetch(channel_id).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(message_id).catch(() => null);
  if (!message) return;

  let rows = await getLeaderboard(guild_id, scope, started_at);

  if (!include_committee) {
    rows = await filterCommittee(guild, rows);
  }

  rows = rows.slice(0, 10);
  const embed = buildLeaderboardEmbed(rows, scope, !!include_committee, started_at);
  await message.edit({ embeds: [embed] }).catch(() => null);
}

module.exports.refreshLiveLeaderboard = refreshLiveLeaderboard;
module.exports.buildLeaderboardEmbed  = buildLeaderboardEmbed;
module.exports.filterCommittee        = filterCommittee;
