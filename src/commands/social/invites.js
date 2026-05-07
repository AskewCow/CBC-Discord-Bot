const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getUserInviteCount } = require('../../utils/inviteUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check how many invites you (or someone else) have')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Check another member\'s invite count')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target  = interaction.options.getUser('user') ?? interaction.user;
    const guildId = interaction.guild.id;

    const count  = getUserInviteCount(guildId, target.id);
    const isSelf = target.id === interaction.user.id;
    const noun   = count === 1 ? 'invite' : 'invites';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(isSelf ? 'Your Invites' : `${target.username}'s Invites`)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(
        isSelf
          ? `You currently have **${count}** active ${noun} (members you invited who are still in the server).`
          : `**${target.username}** currently has **${count}** active ${noun}.`
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
