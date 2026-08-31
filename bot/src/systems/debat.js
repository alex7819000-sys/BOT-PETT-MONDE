// src/systems/debat.js — Système débat (forum)
'use strict';
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const Config = require('../db/models/Config');

async function openDebatModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('debat:submit')
    .setTitle('💬 Créer un débat');

  const sujetInput = new TextInputBuilder()
    .setCustomId('sujet')
    .setLabel('Sujet du débat')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: Chien > Chat ?')
    .setRequired(true)
    .setMaxLength(100);

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description / contexte')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Donne des détails sur le débat...')
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(sujetInput),
    new ActionRowBuilder().addComponents(descInput),
  );

  return interaction.showModal(modal);
}

async function handleDebatSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const cfg = await Config.findOne({ guildId: gid });

  const sujet = interaction.fields.getTextInputValue('sujet');
  const desc  = interaction.fields.getTextInputValue('description') || '';

  const forumId = cfg?.debatChannelId;
  if (!forumId) return interaction.editReply({ content: '❌ Aucun forum de débat configuré. Demande à un admin d\'utiliser `/setup salon` → Débat.' });

  const forum = interaction.guild.channels.cache.get(forumId);
  if (!forum) return interaction.editReply({ content: '❌ Forum introuvable.' });

  try {
    await forum.threads.create({
      name: sujet,
      message: { content: desc ? `📝 ${desc}` : `💬 Nouveau débat : **${sujet}**\n\nDonnez votre avis !` },
    });
    return interaction.editReply({ content: `✅ Ton débat **${sujet}** a été créé dans le forum !` });
  } catch (err) {
    return interaction.editReply({ content: '❌ Erreur lors de la création du débat.' });
  }
}

module.exports = { openDebatModal, handleDebatSubmit };
