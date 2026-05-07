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

    // ── Modal submissions ───────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      try {
        if (id === 'ticket_panel:setup')                return ticketModals.handlePanelSetup(interaction);
        if (id.startsWith('ticket_panel:add_option:')) return ticketModals.handlePanelAddOption(interaction);
        if (id.startsWith('ticket_flow:add_msg:'))     return ticketModals.handleFlowAddMessage(interaction);
        if (id.startsWith('ticket_flow:add_yn:'))      return ticketModals.handleFlowAddYesNo(interaction);
        if (id === 'onboarding_flow:set_welcome')       return onboardingModals.handleFlowSetWelcome(interaction);
        if (id.startsWith('onboarding_flow:add_text:')) return onboardingModals.handleFlowAddText(interaction);
        if (id.startsWith('onboarding_flow:add_yn:'))   return onboardingModals.handleFlowAddYesNo(interaction);
        if (id.startsWith('format_message:'))            return formatMessage.handleModal(interaction);
        if (id === 'event_create')                       return eventCreate.handleModal(interaction);
        if (id === 'submit_project')                     return submitProject.handleModal(interaction);
      } catch (err) {
        logger.error(`Modal error (${id}): ${err.message}`, err);
      }
      return;
    }

    // ── String select menus ─────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      try {
        if (interaction.customId === 'ticket:open') return ticketHandlers.handleTicketOpen(interaction);
      } catch (err) {
        logger.error(`Select menu error (${interaction.customId}): ${err.message}`, err);
      }
      return;
    }

    // ── Buttons ─────────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;
      try {
        if (id.startsWith('ticket:close:') && !id.includes('confirm') && !id.includes('cancel')) {
          return ticketHandlers.handleClose(interaction);
        }
        if (id.startsWith('ticket:close_confirm:')) return ticketHandlers.handleCloseConfirm(interaction);
        if (id.startsWith('ticket:close_cancel:'))  return ticketHandlers.handleCloseCancel(interaction);
        if (id.startsWith('ticket:yn:'))              return ticketHandlers.handleYesNo(interaction);
        if (id.startsWith('onboarding:yn:'))          return onboardingHandlers.handleYesNo(interaction);
        if (id.startsWith('event:register:'))         return eventHandlers.handleRegister(interaction);
        if (id.startsWith('event:withdraw:'))         return eventHandlers.handleWithdraw(interaction);
        if (id.startsWith('event:attend:'))           return eventHandlers.handleAttend(interaction);
        if (id.startsWith('project:vote:'))           return projectHandlers.handleVote(interaction);
      } catch (err) {
        logger.error(`Button error (${id}): ${err.message}`, err);
      }
      return;
    }
  },
};
