const {
  getFlowSteps,
  getFlowStep,
  setTicketPendingStep,
  buildFlowEmbed,
  buildYesNoRow,
  buildDisabledYesNoRow,
} = require('./ticket');

// Run all flow steps for a ticket from the beginning
async function runFlow(channel, ticket) {
  if (!ticket.option_id) return;
  const steps = getFlowSteps(ticket.option_id);
  await _runSteps(channel, ticket, steps);
}

// Called when the ticket opener presses Yes or No on a yes_no step
async function resumeAfterYesNo(interaction, ticket, stepId, choice) {
  const step = getFlowStep(stepId);
  if (!step) return interaction.update({ components: [] });

  // Immediately disable the buttons so the user can't click again
  await interaction.update({ components: [buildDisabledYesNoRow(choice)] });

  // Send the choice-specific follow-up if configured
  const followUp = choice === 'yes' ? step.yes_content : step.no_content;
  if (followUp) {
    await interaction.channel.send({ embeds: [buildFlowEmbed(followUp)] });
  }

  // Continue with any remaining steps after this one
  const allSteps = getFlowSteps(step.option_id);
  const remaining = allSteps.filter(
    s => s.step_order > step.step_order || (s.step_order === step.step_order && s.id > step.id)
  );

  await _runSteps(interaction.channel, ticket, remaining);
}

async function _runSteps(channel, ticket, steps) {
  for (const step of steps) {
    if (step.step_type === 'message') {
      await channel.send({ embeds: [buildFlowEmbed(step.content)] });
    } else if (step.step_type === 'yes_no') {
      await channel.send({
        embeds: [buildFlowEmbed(step.content)],
        components: [buildYesNoRow(ticket.id, step.id)],
      });
      setTicketPendingStep(ticket.id, step.id);
      return; // Pause — resumes when the opener clicks Yes or No
    }
  }
  // All steps exhausted — clear any pending step marker
  setTicketPendingStep(ticket.id, null);
}

module.exports = { runFlow, resumeAfterYesNo };
