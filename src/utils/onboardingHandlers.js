const { MessageFlags } = require('discord.js');
const { errorEmbed }       = require('./embeds');
const onb                  = require('./onboarding');
const { resumeAfterYesNo } = require('./onboardingFlow');

async function handleYesNo(interaction) {
  // customId: onboarding:yn:{choice}:{discordId}:{guildId}:{stepId}
  const parts     = interaction.customId.split(':');
  const choice    = parts[2];           // 'yes' | 'no'
  const discordId = parts[3];
  const guildId   = parts[4];
  const stepId    = Number(parts[5]);

  // Only the intended recipient can answer
  if (interaction.user.id !== discordId) {
    return interaction.reply({
      embeds: [errorEmbed('Not for you', 'This question is not addressed to you.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const session = onb.getSession(discordId, guildId);
  if (!session || session.status !== 'in_progress') {
    return interaction.update({ components: [] });
  }

  await resumeAfterYesNo(interaction, session, stepId, choice);
}

module.exports = { handleYesNo };
