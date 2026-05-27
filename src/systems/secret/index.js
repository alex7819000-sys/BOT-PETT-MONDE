// src/systems/secret/index.js — Système Secret/Confession rebâti
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
        ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Confession = require('../../db/models/Confession');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');
const { COLORS } = require('../../config/constants');

// ── Poster le bouton persistant dans le salon ─────────────────────────────
async function postSecretButton(client, guildId) {
  const config  = await Config.findOne({ guildId });
  if (!config?.secretChannelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(config.secretChannelId);
  if (!channel) return;

  // Supprimer l'ancien bouton si existe
  if (config.secretButtonMessageId) {
    await channel.messages.delete(config.secretButtonMessageId).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.DARK)
    .setTitle('🤫 Le Salon Secret')
    .setDescription(
      'Ici tu peux partager un **secret, une confession, une histoire**.\n\n' +
      '🔒 Tu choisis si tu veux rester **anonyme** ou non.\n' +
      '🖼️ Tu peux ajouter une image et un titre.\n' +
      '💬 Les autres peuvent réagir dans le fil de discussion.'
    )
    .setFooter({ text: 'Clique sur le bouton pour partager' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('secret:open_modal')
      .setLabel('📝 Créer un secret')
      .setStyle(ButtonStyle.Primary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await Config.updateOne({ guildId }, { secretButtonMessageId: msg.id });
  logger.info('Secret', 'Bouton posté dans le salon');
}

// ── Ouvrir le modal ───────────────────────────────────────────────────────
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
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('imageUrl')
        .setLabel('Lien image (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
  );

  await interaction.showModal(modal);
}

// ── Soumettre le secret ───────────────────────────────────────────────────
async function handleSubmit(interaction) {
  const gid   = interaction.guild.id;
  const uid   = interaction.user.id;

  const anonRaw = interaction.fields.getTextInputValue('anon').toLowerCase().trim();
  const isAnon  = anonRaw === 'oui' || anonRaw === 'o' || anonRaw === 'yes';
  const title   = interaction.fields.getTextInputValue('title');
  const desc    = interaction.fields.getTextInputValue('description') || null;
  const imgUrl  = interaction.fields.getTextInputValue('imageUrl') || null;

  const config  = await Config.findOne({ guildId: gid });
  if (!config?.secretChannelId) {
    return interaction.reply({ content: '❌ Salon secret non configuré.', ephemeral: true });
  }
  const channel = interaction.guild.channels.cache.get(config.secretChannelId);
  if (!channel) return interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true });

  const member = interaction.member;
  const authorDisplay = isAnon ? '🤫 Anonyme' : member.displayName;
  const authorIcon    = isAnon ? null : member.displayAvatarURL({ size: 64 });

  const embed = new EmbedBuilder()
    .setColor(isAnon ? COLORS.DARK : (member.displayColor || COLORS.PURPLE))
    .setTitle(`${isAnon ? '🤫' : '📖'} ${title}`)
    .setAuthor({ name: authorDisplay, iconURL: authorIcon || undefined })
    .setTimestamp();

  if (desc)    embed.setDescription(desc);
  if (imgUrl)  embed.setImage(imgUrl);
  embed.setFooter({ text: isAnon ? 'Secret anonyme' : `Partagé par ${member.displayName}` });

  const msg    = await channel.send({ embeds: [embed] });

  // ── Bouton "Créer mon secret" sous chaque secret ─────────────────────
  const secretRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('secret:open_modal')
      .setLabel('✨ Créer mon secret')
      .setStyle(ButtonStyle.Success),
  );
  await channel.send({ components: [secretRow] });

  const thread = await msg.startThread({
    name: `💬 ${title}`.slice(0, 100),
    autoArchiveDuration: 4320, // 3 jours
  });
  await thread.send(`💬 Réagis au secret **"${title}"** ici !`);

  await Confession.create({
    guildId: gid, authorId: uid, text: title,
    suspects: [], messageId: msg.id, channelId: config.secretChannelId,
  });

  await interaction.reply({ content: `✅ Secret publié ${isAnon ? 'anonymement' : ''} dans <#${config.secretChannelId}> !`, ephemeral: true });
  logger.info('Secret', `Nouveau secret de ${uid} (anon: ${isAnon})`);
}

module.exports = { postSecretButton, openModal, handleSubmit };
