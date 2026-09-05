const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { autocompleteProjects, runProjectPublish } = require('../../utils/projectPublish');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('publish-project')
    .setDescription('Publish a submitted project to the CBC website showcase')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('project')
        .setDescription('The project to publish')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  autocomplete(interaction) {
    return autocompleteProjects(interaction, { published: false });
  },

  execute(interaction) {
    return runProjectPublish(interaction, 'publish');
  },
};
