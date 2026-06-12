// src/handlers/commandHandlers/guildes.js
'use strict';
const { createGuilde, joinGuilde, leaveGuilde, getGuildeInfo, getGuildesClassement } = require('../../systems/guildes');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'creer')      return createGuilde(interaction, interaction.options.getString('nom'), interaction.options.getString('emoji'), interaction.options.getString('description'));
  if (sub === 'rejoindre')  return joinGuilde(interaction, interaction.options.getString('id'));
  if (sub === 'quitter')    return leaveGuilde(interaction);
  if (sub === 'info')       return getGuildeInfo(interaction, interaction.options.getString('id'));
  if (sub === 'classement') return getGuildesClassement(interaction);
}

module.exports = { handle };
