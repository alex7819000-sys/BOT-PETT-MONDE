// src/systems/confession/index.js — Confession anonyme + devinette (flow image galerie)
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
        ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Confession = require('../../db/models/Confession');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');
const { COLORS } = require('../../config/constants');
const { safeReply } = require('../../utils/permissions');

// Map en attente d'image après modal : userId → { guildId, text, suspects, channelId, expiresAt }
const PENDING_IMAGE = new Map();
const PENDING_TTL   = 3 * 60 * 1000; // 3 minutes

// ── Ouvrir le modal ───────────────────────────────────────────────────────
async function openConfessionModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('confession:submit')
    .setTitle(`🤫 Envoyer une confession`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('text')
        .setLabel('Ta confession (anonyme)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('suspects')
        .setLabel('Suspects (3-5 pseudos séparés par des virgules)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex: Kuzan, Muck, Luna, Jack')
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

// ── Soumettre le modal → demander l'image ────────────────────────────────
async function handleConfessionSubmit(interaction) {
  const text    = interaction.fields.getTextInputValue('text');
  const rawSusp = interaction.fields.getTextInputValue('suspects');
  const gid     = interaction.guild.id;
  const uid     = interaction.user.id;

  const config = await Config.findOne({ guildId: gid });
  if (!config?.secretChannelId) {
    return interaction.reply({ content: '❌ Le salon #SECRET n\'est pas configuré. Fais `/setup confession`.', ephemeral: true });
  }

  // Résoudre les suspects
  const suspectNames = rawSusp.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
  if (suspectNames.length < 2) {
    return interaction.reply({ content: '❌ Mets au moins 2 suspects séparés par des virgules.', ephemeral: true });
  }

  const members  = await interaction.guild.members.fetch();
  const suspects = [];
  const notFound = [];

  for (const name of suspectNames) {
    const found = members.find(m =>
      m.displayName.toLowerCase().includes(name.toLowerCase()) ||
      m.user.username.toLowerCase().includes(name.toLowerCase())
    );
    if (found) suspects.push(found.id);
    else notFound.push(name);
  }

  if (notFound.length) {
    return interaction.reply({ content: `❌ Membres introuvables : ${notFound.join(', ')}`, ephemeral: true });
  }

  if (!suspects.includes(uid)) suspects.push(uid);
  const shuffled = suspects.sort(() => Math.random() - 0.5);

  // Stocker en attente d'image
  PENDING_IMAGE.set(uid, {
    guildId: gid,
    text,
    suspects: shuffled,
    channelId: config.secretChannelId,
    expiresAt: Date.now() + PENDING_TTL,
  });

  await interaction.reply({
    content: `✅ Parfait ! Maintenant **envoie une image** depuis ta galerie pour l'ajouter à ta confession (3 min).\nOu tape \`skip\` pour publier sans image 👀`,
    ephemeral: true,
  });
}

// ── Détecter l'image ou "skip" ────────────────────────────────────────────
async function handlePendingImage(message) {
  const uid     = message.author.id;
  const pending = PENDING_IMAGE.get(uid);
  if (!pending) return false;

  if (Date.now() > pending.expiresAt) {
    PENDING_IMAGE.delete(uid);
    return false;
  }

  const isSkip   = message.content.toLowerCase().trim() === 'skip';
  const hasImage = message.attachments.some(a => a.contentType?.startsWith('image'));

  if (!isSkip && !hasImage) return false;

  PENDING_IMAGE.delete(uid);
  const imageUrl = hasImage ? message.attachments.first().url : null;
  await message.delete().catch(() => {});
  await publishConfession(message.guild, pending, imageUrl);
  return true;
}

// ── Publier la confession ─────────────────────────────────────────────────
async function publishConfession(guild, { guildId, text, suspects, channelId }, imageUrl) {
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.DARK)
    .setTitle(`🤫 Confession Anonyme`)
    .setDescription(`> *${text}*`)
    .addFields({
      name: `🕵️ L'auteur est l'un de ces ${suspects.length} membres :`,
      value: suspects.map(id => `<@${id}>`).join(' · '),
    })
    .setFooter({ text: 'Qui a écrit ça ? Votez !' })
    .setTimestamp();

  if (imageUrl) embed.setImage(imageUrl);

  const row = new ActionRowBuilder().addComponents(
    suspects.map((id, i) =>
      new ButtonBuilder()
        .setCustomId(`confession:vote:${id}`)
        .setLabel(`${['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][i]}`)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await Confession.create({ guildId, authorId: suspects[0], text, suspects, messageId: msg.id, channelId });
  logger.info('Confession', 'Nouvelle confession publiée');
}

// ── Voter ─────────────────────────────────────────────────────────────────
async function handleVote(interaction, suspectId) {
  await interaction.deferUpdate();
  const uid   = interaction.user.id;
  const msgId = interaction.message.id;

  const confession = await Confession.findOne({ guildId: interaction.guild.id, messageId: msgId });
  if (!confession) return;

  if (confession.authorId === uid) {
    return interaction.followUp({ content: '❌ Tu ne peux pas voter sur ta propre confession 😏', ephemeral: true });
  }

  confession.votes.set(uid, suspectId);
  await confession.save();

  const counts = {};
  for (const [, sid] of confession.votes) counts[sid] = (counts[sid] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  await interaction.followUp({
    content: `✅ Vote enregistré ! ${confession.votes.size} vote(s). En tête : <@${top[0]}> (${top[1]} vote(s))`,
    ephemeral: true,
  });
}

// ── Révélation ────────────────────────────────────────────────────────────
async function handleReveal(interaction, confessionId) {
  await interaction.deferUpdate();
  const confession = await Confession.findById(confessionId);
  if (!confession || confession.authorId !== interaction.user.id) return;
  confession.revealedTo = true;
  await confession.save();
  const channel = interaction.guild.channels.cache.get(confession.channelId);
  if (channel) {
    await channel.send(`🎭 Révélation ! La confession était de <@${confession.authorId}> :\n> *${confession.text}*`);
  }
}

module.exports = { openConfessionModal, handleConfessionSubmit, handleVote, handleReveal, handlePendingImage };
