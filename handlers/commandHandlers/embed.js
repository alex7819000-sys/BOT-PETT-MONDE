// src/handlers/commandHandlers/embed.js — /embed
'use strict';
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = async function handleEmbed(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'creer') {
    const modal = new ModalBuilder().setCustomId('embed:creer').setTitle('Créer un Embed');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('couleur').setLabel('Couleur hex (ex: #FFD700)').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('URL image (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  if (sub === 'modifier') {
    const salon  = interaction.options.getChannel('salon');
    const msgId  = interaction.options.getString('message_id');
    const modal  = new ModalBuilder().setCustomId(`embed:modifier:${salon.id}:${msgId}`).setTitle('Modifier l\'Embed');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    );
    return interaction.showModal(modal);
  }
};
