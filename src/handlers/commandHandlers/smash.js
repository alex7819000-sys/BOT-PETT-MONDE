// src/handlers/commandHandlers/smash.js
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { postSmash, submitCommunity, getLeaderboard } = require('../../systems/smash');
const { COLORS, EMOJIS } = require('../../config/constants');

async function handleAnime(interaction, client) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'now') {
    await interaction.deferReply({ ephemeral: true });
    await postSmash(client, interaction.guild.id, 'anime-auto');
    return interaction.followUp({ content: '✅ Personnage anime posté !', ephemeral: true });
  }
  if (sub === 'classement') {
    await interaction.deferReply();
    const top = await getLeaderboard(interaction.guild.id, 'anime-auto');
    const embed = new EmbedBuilder().setColor(COLORS.PINK).setTitle('🎌 Top Anime — Smash or Pass')
      .setDescription(top.map(v => `**${v.rank}.** ${v.name} — ${v.smash}💚 ${v.pass}💔 (${v.pct}%)`).join('\n') || '*Aucun vote*');
    return interaction.followUp({ embeds: [embed] });
  }
}

async function handleWaifu(interaction, client) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'soumettre') {
    await interaction.deferReply({ ephemeral: true });
    const nom   = interaction.options.getString('nom');
    const image = interaction.options.getString('image');
    const anime = interaction.options.getString('anime') || '';
    const ok = await submitCommunity(client, interaction.guild.id, 'anime-community', { name: nom, imageUrl: image, extra: anime, submittedBy: interaction.user.id });
    return interaction.followUp({ content: ok ? `✅ **${nom}** soumis !` : '❌ Salon waifu non configuré.', ephemeral: true });
  }
  if (sub === 'classement') {
    await interaction.deferReply();
    const top = await getLeaderboard(interaction.guild.id, 'anime-community');
    const embed = new EmbedBuilder().setColor(COLORS.PINK).setTitle('🗳️ Top Waifu/Perso — Communauté')
      .setDescription(top.map(v => `**${v.rank}.** ${v.name} — ${v.smash}💚 ${v.pass}💔 (${v.pct}%)`).join('\n') || '*Aucun vote*');
    return interaction.followUp({ embeds: [embed] });
  }
}

async function handleAnimaux(interaction, client) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'now') {
    await interaction.deferReply({ ephemeral: true });
    await postSmash(client, interaction.guild.id, 'animals-auto');
    return interaction.followUp({ content: '✅ Animal posté !', ephemeral: true });
  }
  if (sub === 'soumettre') {
    await interaction.deferReply({ ephemeral: true });
    const nom   = interaction.options.getString('nom');
    const image = interaction.options.getString('image');
    const ok = await submitCommunity(client, interaction.guild.id, 'animals-community', { name: nom, imageUrl: image, extra: '🐾', submittedBy: interaction.user.id });
    return interaction.followUp({ content: ok ? `✅ **${nom}** soumis !` : '❌ Salon non configuré.', ephemeral: true });
  }
  if (sub === 'classement') {
    await interaction.deferReply();
    const top = await getLeaderboard(interaction.guild.id, 'animals-auto');
    const embed = new EmbedBuilder().setColor(COLORS.GREEN).setTitle('🐾 Top Animaux — Smash or Pass')
      .setDescription(top.map(v => `**${v.rank}.** ${v.name} — ${v.smash}💚 ${v.pass}💔 (${v.pct}%)`).join('\n') || '*Aucun vote*');
    return interaction.followUp({ embeds: [embed] });
  }
}

async function handleFaceReveal(interaction, client) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'soumettre') {
    await interaction.deferReply({ ephemeral: true });
    const image = interaction.options.getString('image');
    const ok = await submitCommunity(client, interaction.guild.id, 'face-reveal', { name: 'Anonyme', imageUrl: image, extra: '🤫', submittedBy: interaction.user.id });
    return interaction.followUp({ content: ok ? '✅ Photo soumise anonymement !' : '❌ Salon Face Reveal non configuré.', ephemeral: true });
  }
  if (sub === 'classement') {
    await interaction.deferReply();
    const top = await getLeaderboard(interaction.guild.id, 'face-reveal');
    const embed = new EmbedBuilder().setColor(COLORS.PINK).setTitle('💅 Face Reveal — Classement')
      .setDescription(top.map(v => `**${v.rank}.** ${v.name} — ${v.smash}💚 ${v.pass}💔 (${v.pct}%)`).join('\n') || '*Aucun vote*');
    return interaction.followUp({ embeds: [embed] });
  }
}

module.exports = { handleAnime, handleWaifu, handleAnimaux, handleFaceReveal };
