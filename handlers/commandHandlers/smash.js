// src/handlers/commandHandlers/smash.js — Smash or Pass
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');

function smashPassRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sop:smash:${id}`).setLabel('💚 Smash').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sop:pass:${id}`).setLabel('💔 Pass').setStyle(ButtonStyle.Danger),
  );
}

async function handleAnime(interaction, client) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  if (sub === 'classement') {
    return interaction.editReply({ content: '📊 Classement anime — fonctionnalité disponible via le système SOP.' });
  }
  const embed = new EmbedBuilder().setColor(COLORS.PINK).setTitle(`${EMOJIS.ANIME} Smash or Pass Anime`)
    .setDescription('Posté depuis la commande /anime now');
  return interaction.editReply({ embeds: [embed] });
}

async function handleWaifu(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === 'soumettre') {
    const nom = interaction.options.getString('nom');
    const image = interaction.options.getString('image');
    return interaction.editReply({ content: `✅ **${nom}** soumis ! Il sera validé avant publication.` });
  }
  return interaction.editReply({ content: '📊 Classement waifus disponible bientôt.' });
}

async function handleAnimaux(interaction, client) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  if (sub === 'classement') return interaction.editReply({ content: '📊 Classement animaux disponible bientôt.' });
  if (sub === 'soumettre') {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({ content: '✅ Animal soumis ! Il sera validé avant publication.' });
  }
  return interaction.editReply({ content: '🐾 Animal aléatoire posté !' });
}

async function handleFaceReveal(interaction, client) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'soumettre') {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({ content: '✅ Photo soumise anonymement ! Elle sera publiée après validation.' });
  }
  await interaction.deferReply();
  return interaction.editReply({ content: '📊 Classement face reveals disponible bientôt.' });
}

module.exports = { handleAnime, handleWaifu, handleAnimaux, handleFaceReveal };
