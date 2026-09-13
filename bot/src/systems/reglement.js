// src/systems/reglement.js — Système de règlement style Etherya
'use strict';
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');

/**
 * Affiche le règlement avec un menu déroulant pour sélectionner les sections
 */
async function postReglement(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const gid = interaction.guild.id;
  const cfg = await Config.findOne({ guildId: gid });

  if (!cfg?.reglementEnabled) {
    return interaction.editReply({ content: '❌ Le système de règlement n\'est pas activé.' });
  }

  if (!cfg.reglementChannelId) {
    return interaction.editReply({ content: '❌ Aucun salon de règlement configuré.' });
  }

  const channel = await interaction.guild.channels.fetch(cfg.reglementChannelId).catch(() => null);
  if (!channel) {
    return interaction.editReply({ content: '❌ Salon de règlement introuvable.' });
  }

  // Générer l'embed principal
  const embed = getReglementMainEmbed(cfg);

  // Créer le menu déroulant
  const selectRow = createReglementSelectMenu(cfg);

  // Créer les boutons de règlement
  const buttonsRow = createReglementButtons(cfg);

  try {
    await channel.send({
      embeds: [embed],
      components: [selectRow, buttonsRow],
    });
    return interaction.editReply({ content: '✅ Règlement posté !' });
  } catch (err) {
    console.error('Error posting reglement:', err);
    return interaction.editReply({ content: '❌ Erreur lors de l\'envoi du règlement.' });
  }
}

/**
 * Affiche une section du règlement en réponse
 */
async function handleReglementSection(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const gid = interaction.guild.id;
  const sectionId = interaction.values?.[0];

  if (!sectionId) {
    return interaction.editReply({ content: '❌ Erreur: section non trouvée.' });
  }

  const cfg = await Config.findOne({ guildId: gid });
  const section = cfg?.reglementSections?.find(s => s.id === sectionId);

  if (!section) {
    return interaction.editReply({ content: '❌ Section introuvable.' });
  }

  const embed = getSectionEmbed(cfg, section);
  const acceptButton = createAcceptButton(cfg);

  return interaction.editReply({
    embeds: [embed],
    components: [acceptButton],
  });
}

/**
 * Génère l'embed principal du règlement
 */
function getReglementMainEmbed(cfg) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Règlement du serveur')
    .setColor(cfg.reglementColor || COLORS.green)
    .setDescription(
      'Bienvenue ! Ce serveur dispose d\'un système de règlement complet.\n' +
      'Sélectionne une section ci-dessous pour lire les règles en détail.'
    );

  if (cfg.reglementImage) {
    embed.setImage(cfg.reglementImage);
  }

  // Ajouter les sections comme champs
  if (cfg.reglementSections && cfg.reglementSections.length > 0) {
    cfg.reglementSections.forEach(section => {
      embed.addFields({
        name: `${section.emoji || '📌'} ${section.title}`,
        value: '> Clique sur le menu pour voir les détails',
        inline: false,
      });
    });
  }

  embed.setFooter({ text: 'Clique sur le menu déroulant pour voir chaque section' });
  return embed;
}

/**
 * Génère l'embed d'une section
 */
function getSectionEmbed(cfg, section) {
  const embed = new EmbedBuilder()
    .setTitle(`${section.emoji || '📌'} ${section.title}`)
    .setColor(cfg.reglementColor || COLORS.green)
    .setDescription(section.description || 'Aucune description disponible.');

  if (cfg.reglementImage) {
    embed.setImage(cfg.reglementImage);
  }

  embed.setFooter({ text: `Après avoir lu, clique sur le bouton pour accepter le règlement` });
  return embed;
}

/**
 * Crée le menu déroulant des sections
 */
function createReglementSelectMenu(cfg) {
  const options = (cfg.reglementSections || []).map(section => ({
    label: section.title.substring(0, 100),
    value: section.id,
    emoji: section.emoji,
    description: 'Voir cette section',
  }));

  if (options.length === 0) {
    options.push({
      label: 'Pas de sections',
      value: 'empty',
      description: 'Configurer d\'abord',
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('reglement:section:select')
    .setPlaceholder('📌 Sélectionne une section...')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

/**
 * Crée les boutons d'action du règlement
 */
function createReglementButtons(cfg) {
  const acceptBtn = new ButtonBuilder()
    .setCustomId('reglement:accept')
    .setLabel('✅ J\'accepte le règlement')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder().addComponents(acceptBtn);
}

/**
 * Crée le bouton d'acceptation (affiché après lecture d'une section)
 */
function createAcceptButton(cfg) {
  const acceptBtn = new ButtonBuilder()
    .setCustomId('reglement:accept')
    .setLabel('✅ J\'accepte')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder().addComponents(acceptBtn);
}

/**
 * Traite l'acceptation du règlement (existant)
 */
async function handleAccepterReglement(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const uid = interaction.user.id;
  const cfg = await Config.findOne({ guildId: gid });

  if (!cfg?.confirmedRoleId) {
    return interaction.editReply({ content: '❌ Rôle membre non configuré. Utilisez `/setup role`.' });
  }

  const member = await interaction.guild.members.fetch(uid).catch(() => null);
  if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

  if (member.roles.cache.has(cfg.confirmedRoleId)) {
    return interaction.editReply({ content: '✅ Tu as déjà accepté le règlement !' });
  }

  await member.roles.add(cfg.confirmedRoleId).catch(() => {});
  return interaction.editReply({ content: '✅ Règlement accepté ! Bienvenue sur le serveur 🎉' });
}

module.exports = {
  postReglement,
  handleReglementSection,
  handleAccepterReglement,
  getReglementMainEmbed,
  getSectionEmbed,
};

