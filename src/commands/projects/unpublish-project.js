const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { autocompleteProjects, runProjectPublish } = require('../../utils/projectPublish');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unpublish-project')
    .setDescription('Remove a project from the CBC website showcase')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('project')
        .setDescription('The project to unpublish')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  autocomplete(interaction) {
    return autocompleteProjects(interaction, { published: true });
  },

  execute(interaction) {
    return runProjectPublish(interaction, 'unpublish');
  },
};
