// src/handlers/commandHandlers/debat.js
'use strict';
const { openDebatModal } = require('../../systems/debat');
async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'creer') return openDebatModal(interaction);
}
module.exports = { handle };
