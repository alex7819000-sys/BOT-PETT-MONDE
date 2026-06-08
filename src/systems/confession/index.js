// src/systems/confession/index.js — v5 style "Identité protégée • Anonymat garanti"
'use strict';
const { EmbedBuilder, ModalBuilder, TextInputBuilder,
        TextInputStyle, ActionRowBuilder } = require('discord.js');
const Confession = require('../../db/models/Confession');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');
const { COLORS } = require('../../config/constants');

// ── Ouvrir le modal /confessions ───────────────────────────────────────────
async function openConfessionModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('confession:submit')
    .setTitle('Confession Anonyme');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Titre (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Donne un titre à ta confession...')
        .setRequired(false)
        .setMaxLength(80)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('text')
        .setLabel('Ta confession')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Écris ta confession ici... Elle sera envoyée de façon totalement anonyme.')
        .setRequired(true)
        .setMaxLength(1000)
    ),
  );

  await interaction.showModal(modal);
}

// ── Soumettre le modal → publier directement ───────────────────────────────
async function handleConfessionSubmit(interaction) {
  const title = (interaction.fields.getTextInputValue('title') || '').trim();
  const text  = interaction.fields.getTextInputValue('text').trim();
  const uid   = interaction.user.id;
  const gid   = interaction.guild.id;

  const config = await Config.findOne({ guildId: gid });
  if (!config?.secretChannelId) {
    return safeReply(interaction, '❌ Le salon confession n\'est pas configuré. Fais `/setup salon → Confession`.');
  }

  await publishConfession(interaction.guild, {
    guildId:   gid,
    authorId:  uid,
    title,
    text,
    anonymous: true,
    channelId: config.secretChannelId,
  });

  await safeReply(interaction, '✅ Ta confession a bien été envoyée anonymement !');
}

// ── Publier l'embed style "Identité protégée • Anonymat garanti" ───────────
async function publishConfession(guild, { guildId, authorId, title, text, anonymous, channelId }) {
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) {
    logger.error('Confession', `Canal ${channelId} introuvable`);
    return;
  }

  // Nom affiché si non-anonyme
  let authorName = 'Quelqu\'un';
  if (!anonymous) {
    const member = await guild.members.fetch(authorId).catch(() => null);
    authorName = member?.displayName || 'Quelqu\'un';
  }

  // Titre de l'embed
  const embedTitle = title || (anonymous ? null : authorName);

  // Thumbnail de l'auteur (même en anonyme, on met l'avatar du serveur comme placeholder)
  const config = await Config.findOne({ guildId }).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31) // couleur dark Discord comme dans les screenshots
    .setDescription(text);

  if (embedTitle) embed.setTitle(embedTitle);

  if (!anonymous) {
    // Confession non-anonyme : on montre l'auteur
    const member = await guild.members.fetch(authorId).catch(() => null);
    embed.setAuthor({
      name: member?.displayName || 'Quelqu\'un',
      iconURL: member?.user.displayAvatarURL() || undefined,
    });
  }

  // Barre "Identité protégée • Anonymat garanti" en bas
  embed.addFields({
    name: anonymous
      ? '🔒 Identité protégée  •  Anonymat garanti'
      : '📢 Confession non-anonyme',
    value: anonymous
      ? 'Confessions Anonymes — Personne ne sait qui tu es'
      : `Écrit par **${authorName}**`,
    inline: false,
  });

  embed.setTimestamp();

  const { ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BBS } = require('discord.js');
  const confRow = new AR().addComponents(
    new BB()
      .setCustomId('confession:open_modal')
      .setLabel('🤫 Faire ma confession')
      .setStyle(BBS.Secondary),
  );

  try {
    const msg = await channel.send({ embeds: [embed], components: [confRow] });
    await Confession.create({
      guildId,
      authorId,
      title,
      text,
      anonymous,
      messageId: msg.id,
      channelId,
    });
    logger.info('Confession', `Nouvelle confession publiée (${anonymous ? 'anonyme' : 'non-anonyme'})`);
  } catch (err) {
    logger.error('Confession', 'Publish failed', err);
  }
}

// ── Message d'accueil du salon confessions ────────────────────────────────
async function postConfessionWelcome(client, guildId) {
  const config  = await Config.findOne({ guildId });
  if (!config?.secretChannelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(config.secretChannelId);
  if (!channel) return;

  const { EmbedBuilder: E, ActionRowBuilder: A, ButtonBuilder: B, ButtonStyle: BS } = require('discord.js');

  const embed = new E()
    .setColor(0x2b2d31)
    .setTitle('💌 Confessions')
    .setDescription(
      'Envie de partager quelque chose avec la communauté ? C\'est le moment.\n\n' +
      '**➜ Confession non anonyme**\n' +
      'Si vous souhaitez assumer pleinement votre message et discuter librement, ' +
      'vous pouvez simplement écrire votre confession directement dans le salon.\n\n' +
      '**➜ Confession anonyme**\n' +
      'Vous préférez garder votre identité secrète ? Aucun souci.\n' +
      'Utilisez la commande `/confessions` pour envoyer votre message anonymement.\n' +
      'Votre confession sera publiée sans révéler son auteur.\n\n' +
      '> Que ce soit pour vider votre sac, poser une question ou partager un ressenti, ' +
      'cet espace est là pour vous. Merci de rester bienveillants envers les autres membres.'
    )
    .setFooter({ text: 'Identité protégée  •  Anonymat garanti' });

  const row = new A().addComponents(
    new B()
      .setCustomId('confession:open_modal')
      .setLabel('🤫 Envoyer une confession anonyme')
      .setStyle(BS.Secondary),
  );

  await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
}

// ── Stub pour handlePendingImage (plus utilisé, gardé pour compatibilité) ──
async function handlePendingImage(_message) {
  return false;
}

function safeReply(interaction, content) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content, ephemeral: true }).catch(() => {});
  }
  return interaction.reply({ content, ephemeral: true }).catch(() => {});
}

module.exports = {
  openConfessionModal,
  handleConfessionSubmit,
  handlePendingImage,
  postConfessionWelcome,
  // Stubs pour les anciens handlers (plus utilisés mais importés ailleurs)
  handleVote:   async () => {},
  handleReveal: async () => {},
};
