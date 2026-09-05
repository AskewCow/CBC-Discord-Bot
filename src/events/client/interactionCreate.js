const { Events, MessageFlags } = require('discord.js');
const logger               = require('../../utils/logger');
const { errorEmbed }       = require('../../utils/embeds');
const ticketModals         = require('../../utils/ticketModals');
const ticketHandlers       = require('../../utils/ticketHandlers');
const onboardingModals     = require('../../utils/onboardingModals');
const onboardingHandlers   = require('../../utils/onboardingHandlers');
const formatMessage        = require('../../commands/admin/format-message');
const eventHandlers        = require('../../utils/eventHandlers');
const eventCreate          = require('../../commands/events/event-create');
const submitProject        = require('../../commands/projects/submit-project');
const projectHandlers      = require('../../utils/projectHandlers');

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {

    // ── Slash commands ──────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        logger.warn(`Unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error(`Error executing /${interaction.commandName}: ${err.message}`, err);

        const reply = {
          embeds: [errorEmbed('Something went wrong', 'An unexpected error occurred. Please try again.')],
          flags: MessageFlags.Ephemeral,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
      return;
    }

    // ── Autocomplete ────────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        logger.error(`Autocomplete error /${interaction.commandName}: ${err.message}`);
      }
      return;
    }

    // ── Component / modal routing ──────────────────────────────────────────────
    // Each route is [matcher, handler]; matcher is an exact id or a prefix
    // ending in ':'. First match wins. Handlers are awaited so rejections land
    // in the catch below instead of becoming unhandled rejections.
    const routes = {
      modal: [
        ['ticket_panel:setup',        ticketModals.handlePanelSetup],
        ['ticket_panel:add_option:',  ticketModals.handlePanelAddOption],
        ['ticket_flow:add_msg:',      ticketModals.handleFlowAddMessage],
        ['ticket_flow:add_yn:',       ticketModals.handleFlowAddYesNo],
        ['onboarding_flow:set_welcome', onboardingModals.handleFlowSetWelcome],
        ['onboarding_flow:add_text:', onboardingModals.handleFlowAddText],
        ['onboarding_flow:add_yn:',   onboardingModals.handleFlowAddYesNo],
        ['format_message:',           (i) => formatMessage.handleModal(i)],
        ['event_create',              (i) => eventCreate.handleModal(i)],
        ['submit_project',            (i) => submitProject.handleModal(i)],
      ],
      select: [
        ['ticket:open', ticketHandlers.handleTicketOpen],
      ],
      button: [
        ['ticket:close_confirm:', ticketHandlers.handleCloseConfirm],
        ['ticket:close_cancel:',  ticketHandlers.handleCloseCancel],
        ['ticket:close:',         ticketHandlers.handleClose],
        ['ticket:yn:',            ticketHandlers.handleYesNo],
        ['onboarding:yn:',        onboardingHandlers.handleYesNo],
        ['event:register:',       eventHandlers.handleRegister],
        ['event:withdraw:',       eventHandlers.handleWithdraw],
        ['event:attend:',         eventHandlers.handleAttend],
        ['project:vote:',         projectHandlers.handleVote],
      ],
    };

    const dispatch = async (kind) => {
      const id = interaction.customId;
      const route = routes[kind].find(([m]) => (m.endsWith(':') ? id.startsWith(m) : id === m));
      if (!route) return;
      try {
        await route[1](interaction);
      } catch (err) {
        logger.error(`${kind} error (${id}): ${err.message}`, err);
      }
    };

    if (interaction.isModalSubmit())      return dispatch('modal');
    if (interaction.isStringSelectMenu()) return dispatch('select');
    if (interaction.isButton())           return dispatch('button');
  },
};
