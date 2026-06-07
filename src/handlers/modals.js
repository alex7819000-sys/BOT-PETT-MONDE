// src/handlers/modals.js — Dispatch tous les modals
'use strict';
const logger = require('../utils/logger');

async function handleModal(interaction, client) {
  const id = interaction.customId;

  try {
    // Présentation — modals étapes 1 à 5
    if (id.startsWith('present_modal:')) {
      const { handleModalSubmit } = require('../systems/presentation');
      return handleModalSubmit(interaction, client);
    }
    if (id === 'confession:submit') {
      const { handleConfessionSubmit } = require('../systems/confession');
      return handleConfessionSubmit(interaction);
    }
    if (id === 'secret:submit') {
      const { handleSubmit } = require('../systems/secret');
      return handleSubmit(interaction);
    }
    if (id === 'debat:submit') {
      const { handleDebatSubmit } = require('../systems/debat');
      return handleDebatSubmit(interaction);
    }
    if (id === 'pub:create') {
      const { handlePubCreate } = require('../systems/pubs');
      return handlePubCreate(interaction);
    }
    if (id.startsWith('staff:modal:')) {
      const { handleModalStaff } = require('../systems/staff');
      return handleModalStaff(interaction, client);
    }
    if (id.startsWith('staff:modal_refus:')) {
      const { handleModalRefus } = require('../systems/staff');
      return handleModalRefus(interaction);
    }
    if (id.startsWith('partner:modal:')) {
      const { handleModalPartner } = require('../systems/partenariat');
      return handleModalPartner(interaction);
    }
    if (id.startsWith('partner:modal_refus:')) {
      const { handleModalRefusPartner } = require('../systems/partenariat');
      return handleModalRefusPartner(interaction);
    }
    if (id.startsWith('pub:ticket:')) {
      const { handleModalPubTicket } = require('../systems/pubs');
      return handleModalPubTicket(interaction);
    }
  } catch (err) {
    logger.error('Modals', `Error handling modal ${id}`, err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Erreur.', ephemeral: true }).catch(() => {});
    }
  }
}

module.exports = { handleModal };
