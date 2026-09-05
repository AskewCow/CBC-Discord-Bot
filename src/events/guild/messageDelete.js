const { Events } = require('discord.js');
const { deleteLeaderboard } = require('../../utils/inviteUtils');

module.exports = {
  name: Events.MessageDelete,
  once: false,
  execute(message) {
    // Cheap indexed delete keyed by the unique message_id — a no-op for the
    // vast majority of deletions, which is fine.
    deleteLeaderboard(message.id);
  },
};
