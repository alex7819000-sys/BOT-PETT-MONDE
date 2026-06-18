// src/systems/confession.js — Confessions anonymes
'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');

// Bouton "Faire une confession" — ouvre le modal
async function openConfessionModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('confession_submit')
    .setTitle('Confession anonyme')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confession_text')
          .setLabel('Ta confession (anonyme)')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1000)
          .setRequired(true)
          .setPlaceholder('Écris ta confession ici...')
      )
    );
  return interaction.showModal(modal);
}

// Soumission du modal confession (appelé depuis modals.js)
async function handleConfessionModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const cfg = await Config.findOne({ guildId: gid });

  const text = interaction.fields.getTextInputValue('confession_text');
  const channelId = cfg?.secretChannelId;

  if (!channelId) return interaction.editReply({ content: '❌ Salon de confession non configuré.' });

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return interaction.editReply({ content: '❌ Salon de confession introuvable.' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.DARK)
    .setTitle('🤫 Confession anonyme')
    .setDescription(text)
    .setFooter({ text: 'Confession anonyme' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confession:hide').setLabel('🗑️ Masquer').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ embeds: [embed], components: [row] });
  return interaction.editReply({ content: '✅ Confession publiée anonymement !' });
}

module.exports = { openConfessionModal, handleConfessionModal };
