// src/systems/welcomeInteractive.js — Système de bienvenue interactif style Etherya
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');

/**
 * Envoie le message de bienvenue interactif à un nouveau membre
 */
async function sendWelcomeMessage(member) {
  if (!member || !member.guild) return;

  const gid = member.guild.id;
  const cfg = await Config.findOne({ guildId: gid });

  if (!cfg?.welcomeInteractiveEnabled || !cfg?.welcomeCardChannelId) return;

  const channel = await member.guild.channels.fetch(cfg.welcomeCardChannelId).catch(() => null);
  if (!channel) return;

  try {
    // Remplacer les variables
    let title = cfg.welcomeEmbedTitle || 'Bienvenue sur {server}!';
    let desc = cfg.welcomeEmbedDesc || 'Hey {user}! 👋';

    title = title
      .replace('{server}', member.guild.name)
      .replace('{user}', member.user.username);

    desc = desc
      .replace('{server}', member.guild.name)
      .replace('{user}', `@${member.user.username}`)
      .replace('{mention}', `<@${member.id}>`)
      .replace('{membercount}', member.guild.memberCount);

    // Créer l'embed principal
    const embed = new EmbedBuilder()
      .setTitle(`${cfg.welcomeEmbedEmoji || '⭐'} ${title}`)
      .setDescription(desc)
      .setColor(cfg.welcomeColor || COLORS.green)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }));

    if (cfg.welcomeImage) {
      embed.setImage(cfg.welcomeImage);
    }

    // Ajouter les sections comme champs
    if (cfg.welcomeSections && cfg.welcomeSections.length > 0) {
      embed.addFields({
        name: '📍 Par où commencer?',
        value: cfg.welcomeSections.map(s => `${s.emoji} ${s.title}`).join('\n'),
        inline: false,
      });
    }

    // Créer les boutons des sections
    const sectionButtons = (cfg.welcomeSections || []).map(section => 
      new ButtonBuilder()
        .setCustomId(`welcome:section:${section.id}`)
        .setLabel(section.title.substring(0, 80))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(section.emoji)
    );

    // Créer les boutons d'action
    const actionButtons = (cfg.welcomeButtons || []).map(btn => {
      const style = btn.action === 'present' ? ButtonStyle.Primary : ButtonStyle.Success;
      return new ButtonBuilder()
        .setCustomId(`welcome:action:${btn.action}`)
        .setLabel(btn.label.substring(0, 80))
        .setStyle(style)
        .setEmoji(btn.emoji);
    });

    // Organiser les boutons par lignes (max 5 par ligne)
    const allButtons = [...sectionButtons, ...actionButtons];
    const rows = [];
    for (let i = 0; i < allButtons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(allButtons.slice(i, i + 5)));
    }

    // Envoyer le message
    await channel.send({
      content: cfg.welcomeCardText ? `${cfg.welcomeCardText}\n<@${member.id}>` : `Bienvenue <@${member.id}>! 🎉`,
      embeds: [embed],
      components: rows.length > 0 ? rows : [],
    });
  } catch (err) {
    console.error('Error sending welcome message:', err);
  }
}

/**
 * Affiche une section du welcome
 */
async function handleWelcomeSection(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const sectionId = interaction.customId.split(':')[2];
  const gid = interaction.guild?.id || interaction.user.id;
  const cfg = await Config.findOne({ guildId: gid });

  const section = cfg?.welcomeSections?.find(s => s.id === sectionId);
  if (!section) {
    return interaction.editReply({ content: '❌ Section introuvable.' });
  }

  const embed = new EmbedBuilder()
    .setTitle(`${section.emoji} ${section.title}`)
    .setDescription(section.description)
    .setColor(cfg?.welcomeColor || COLORS.green);

  if (cfg?.welcomeImage) {
    embed.setImage(cfg.welcomeImage);
  }

  return interaction.editReply({ embeds: [embed] });
}

/**
 * Gère les actions du welcome (présentation, couleur)
 */
async function handleWelcomeAction(interaction) {
  const action = interaction.customId.split(':')[2];
  const gid = interaction.guild?.id;

  if (action === 'present') {
    // Déclencher la présentation
    return interaction.reply({
      content: 'Utilise `/presentation reprendre` pour commencer ta présentation!',
      ephemeral: true,
    });
  }

  if (action === 'color') {
    // Déclencher la sélection de couleur
    const Config = require('../db/models/Config');
    const config = await Config.findOne({ guildId: gid });
    const colorRoles = config?.colorRoleIds || [];

    if (colorRoles.length === 0) {
      return interaction.reply({
        content: '❌ Aucune couleur disponible actuellement.',
        ephemeral: true,
      });
    }

    // Tu peux implémenter le select menu de couleurs ici
    return interaction.reply({
      content: `Couleurs disponibles: ${colorRoles.map(c => `${c.emoji} ${c.name}`).join(' • ')}`,
      ephemeral: true,
    });
  }

  return interaction.reply({ content: '❌ Action inconnue.', ephemeral: true });
}

module.exports = {
  sendWelcomeMessage,
  handleWelcomeSection,
  handleWelcomeAction,
};
