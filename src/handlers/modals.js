// src/handlers/modals.js — Dispatch tous les modals
'use strict';
const logger = require('../utils/logger');

async function handleModal(interaction, client) {
  const id = interaction.customId;

  try {
    if (id === 'confession:submit') {
      const { handleConfessionSubmit } = require('../systems/confession');
      return handleConfessionSubmit(interaction);
    }
    if (id === 'pub:create') {
      const { handlePubCreate } = require('../systems/pubs');
      return handlePubCreate(interaction);
    }
  } catch (err) {
    logger.error('Modals', `Error handling modal ${id}`, err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Erreur.', ephemeral: true }).catch(() => {});
    }
  }
}

module.exports = { handleModal };
