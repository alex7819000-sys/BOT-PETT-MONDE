// src/systems/secret/index.js — Système Secret avec flow image 2 étapes
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
        ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Confession = require('../../db/models/Confession');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');
const { COLORS } = require('../../config/constants');

// Map pour gérer l'attente d'image après modal : userId → { guildId, isAnon, title, desc, channelId, expiresAt }
const PENDING_IMAGE = new Map();
const PENDING_TTL   = 3 * 60 * 1000; // 3 minutes pour envoyer l'image

// ── Bouton persistant dans le salon ──────────────────────────────────────
async function postSecretButton(client, guildId) {
  const config  = await Config.findOne({ guildId });
  if (!config?.secretChannelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(config.secretChannelId);
  if (!channel) return;

  if (config.secretButtonMessageId) {
    await channel.messages.delete(config.secretButtonMessageId).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.DARK)
    .setTitle('🤫 Le Salon Secret')
    .setDescription(
      'Ici tu peux partager un **secret, une confession, une histoire**.\n\n' +
      '🔒 Tu choisis si tu veux rester **anonyme** ou non.\n' +
      '🖼️ Tu peux ajouter une image depuis ta galerie.\n' +
      '💬 Les autres peuvent réagir dans le fil de discussion.'
    )
    .setFooter({ text: 'Clique sur le bouton pour partager' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('secret:open_modal')
      .setLabel('✨ Créer mon secret')
      .setStyle(ButtonStyle.Success),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await Config.updateOne({ guildId }, { secretButtonMessageId: msg.id });
}

// ── Ouvrir le modal (sans champ image) ───────────────────────────────────
async function openModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('secret:submit')
    .setTitle('🤫 Partager un secret');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anon')
        .setLabel('Anonyme ? (oui / non)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('oui')
        .setMaxLength(3)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Titre (obligatoire)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description (optionnel)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(false)
    ),
  );

  await interaction.showModal(modal);
}

// ── Soumettre le modal → demander l'image ────────────────────────────────
async function handleSubmit(interaction) {
  const gid     = interaction.guild.id;
  const uid     = interaction.user.id;
  const anonRaw = interaction.fields.getTextInputValue('anon').toLowerCase().trim();
  const isAnon  = anonRaw === 'oui' || anonRaw === 'o' || anonRaw === 'yes' || anonRaw === 'y';
  const title   = interaction.fields.getTextInputValue('title');
  const desc    = interaction.fields.getTextInputValue('description') || null;

  const config = await Config.findOne({ guildId: gid });
  if (!config?.secretChannelId) {
    return interaction.reply({ content: '❌ Salon secret non configuré.', ephemeral: true });
  }

  // Stocker l'état en attente d'image
  PENDING_IMAGE.set(uid, {
    guildId: gid,
    isAnon,
    title,
    desc,
    channelId: config.secretChannelId,
    expiresAt: Date.now() + PENDING_TTL,
  });

  // Demander l'image
  await interaction.reply({
    content: `✅ Super ! Maintenant **envoie une image** depuis ta galerie dans ce salon (tu as 3 minutes).\nOu tape \`skip\` pour publier sans image 🤫`,
    ephemeral: true,
  });
}

// ── Détecter l'image ou "skip" dans les messages ─────────────────────────
async function handlePendingImage(message) {
  const uid     = message.author.id;
  const pending = PENDING_IMAGE.get(uid);
  if (!pending) return false;

  // Expiration
  if (Date.now() > pending.expiresAt) {
    PENDING_IMAGE.delete(uid);
    return false;
  }

  // Vérifier que c'est dans le bon salon (DM ou salon secret)
  const isSkip     = message.content.toLowerCase().trim() === 'skip';
  const hasImage   = message.attachments.some(a => a.contentType?.startsWith('image'));

  if (!isSkip && !hasImage) return false; // Pas pour nous

  PENDING_IMAGE.delete(uid);

  const imageUrl = hasImage ? message.attachments.first().url : null;

  // Supprimer le message de l'user (propre)
  await message.delete().catch(() => {});

  // Publier le secret
  await publishSecret(message.client, message.guild, pending, imageUrl);
  return true;
}

// ── Publier le secret dans le salon ──────────────────────────────────────
async function publishSecret(client, guild, { guildId, isAnon, title, desc, channelId, authorId }, imageUrl) {
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return;

  // Retrouver l'auteur pour l'avatar si non-anon
  let member = null;
  try { member = await guild.members.fetch(authorId); } catch (_) {}

  const authorDisplay = isAnon ? '🤫 Anonyme' : (member?.displayName || 'Quelqu\'un');
  const authorIcon    = isAnon ? null : member?.displayAvatarURL({ size: 64 });
  const color         = isAnon ? COLORS.DARK : (member?.displayColor || COLORS.PURPLE);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${isAnon ? '🤫' : '📖'} ${title}`)
    .setAuthor({ name: authorDisplay, iconURL: authorIcon || undefined })
    .setTimestamp()
    .setFooter({ text: isAnon ? 'Secret anonyme' : `Partagé par ${authorDisplay}` });

  if (desc)     embed.setDescription(desc);
  if (imageUrl) embed.setImage(imageUrl);

  // Bouton "Créer mon secret" sous chaque secret
  const secretRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('secret:open_modal')
      .setLabel('✨ Créer mon secret')
      .setStyle(ButtonStyle.Success),
  );

  const msg = await channel.send({ embeds: [embed], components: [secretRow] });

  // Thread de discussion
  try {
    const thread = await msg.startThread({
      name: `💬 ${title}`.slice(0, 100),
      autoArchiveDuration: 4320,
    });
    await thread.send(`💬 Réagis au secret **"${title}"** ici !`);
  } catch (_) {}

  await Confession.create({
    guildId, authorId, text: title,
    suspects: [], messageId: msg.id, channelId,
  });

  logger.info('Secret', `Secret publié (anon: ${isAnon}) : ${title}`);
}

module.exports = { postSecretButton, openModal, handleSubmit, handlePendingImage };
