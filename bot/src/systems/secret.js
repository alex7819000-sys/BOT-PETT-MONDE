// src/systems/secret.js — Messages secrets anonymes
'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');

// Bouton "Envoyer un secret" — ouvre le modal
async function openModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('secret_submit')
    .setTitle('Message secret anonyme')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('secret_text')
          .setLabel('Ton message secret')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(5)
          .setMaxLength(1000)
          .setRequired(true)
          .setPlaceholder('Écris ton message ici...')
      )
    );
  return interaction.showModal(modal);
}

// Soumission du modal secret (appelé depuis modals.js)
async function handleSecretModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const cfg = await Config.findOne({ guildId: gid });
  const text = interaction.fields.getTextInputValue('secret_text');
  const channelId = cfg?.secretChannelId;

  if (!channelId) return interaction.editReply({ content: '❌ Salon de secrets non configuré.' });
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return interaction.editReply({ content: '❌ Salon introuvable.' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.PURPLE)
    .setTitle('🤫 Message secret')
    .setDescription(text)
    .setFooter({ text: 'Message anonyme' })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  return interaction.editReply({ content: '✅ Message publié anonymement !' });
}

module.exports = { openModal, handleSecretModal };
