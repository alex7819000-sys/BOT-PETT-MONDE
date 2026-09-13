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
    if (id === 'confession_submit' || id === 'confession:submit') {
      const { handleConfessionModal } = require('../systems/confession');
      return handleConfessionModal(interaction);
    }
    if (id === 'secret_submit' || id === 'secret:submit') {
      const { handleSecretModal } = require('../systems/secret');
      return handleSecretModal(interaction);
    }
    if (id === 'pub:create') {
      const { handlePubModal } = require('../systems/pubs');
      return handlePubModal(interaction);
    }
    if (id === 'partner_form' || id.startsWith('partner:modal:')) {
      const { handlePartnerModal } = require('../systems/partenariat');
      return handlePartnerModal(interaction);
    }
    if (id === 'debat:submit') {
      const { handleDebatSubmit } = require('../systems/debat');
      return handleDebatSubmit(interaction);
    }
    if (id.startsWith('pub:ticket:')) {
      const { handleModalPubTicket } = require('../systems/pubs');
      return handleModalPubTicket(interaction);
    }
    if (id.startsWith('embed:modal:')) {
      const { handleEmbedModal } = require('./commandHandlers/embed');
      return handleEmbedModal(interaction);
    }
    if (id.startsWith('embed:edit:')) {
      const { handleEmbedEditModal } = require('./commandHandlers/embed');
      return handleEmbedEditModal(interaction);
    }

    if (id.startsWith('sigrep:modal:')) {
      const targetId = id.split(':')[2];
      const { handleModalSubmit } = require('../systems/reportPanel');
      return handleModalSubmit(interaction, targetId);
    }

    logger.debug('Modals', `Unknown modal: ${id}`);
  } catch (err) {
    logger.error('Modals', `Error handling modal ${id}`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Erreur.', ephemeral: true }).catch(() => {});
    }
  }
}

module.exports = { handleModal };
