// src/systems/confession/index.js — Confession anonyme + devinette (flow image galerie) — v5 fix
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
        ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Confession = require('../../db/models/Confession');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');
const { COLORS } = require('../../config/constants');

// Map en attente d'image après modal : userId → { guildId, text, suspects, channelId, anonymous, expiresAt }
const PENDING_IMAGE = new Map();
const PENDING_TTL   = 3 * 60 * 1000; // 3 minutes

// ── Ouvrir le modal ────────────────────────────────────────────────────────
async function openConfessionModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('confession:submit')
    .setTitle('🤫 Envoyer une confession');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anonymous')
        .setLabel('Anonyme ? (oui / non)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('oui')
        .setRequired(true)
        .setMaxLength(3)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('text')
        .setLabel('Ta confession')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('suspects')
        .setLabel('Suspects (2-5 pseudos séparés par des virgules)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex: Kuzan, Muck, Luna, Jack')
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

// ── Soumettre le modal → demander l'image ──────────────────────────────────
async function handleConfessionSubmit(interaction) {
  const anonymous = interaction.fields.getTextInputValue('anonymous').trim().toLowerCase();
  const text      = interaction.fields.getTextInputValue('text').trim();
  const rawSusp   = interaction.fields.getTextInputValue('suspects');
  const gid       = interaction.guild.id;
  const uid       = interaction.user.id;
  const isAnon    = anonymous !== 'non';

  const config = await Config.findOne({ guildId: gid });
  if (!config?.secretChannelId) {
    return safeReply(interaction, '❌ Le salon confession n\'est pas configuré. Fais `/setup salon → Confession`.');
  }

  // Résoudre les suspects
  const suspectNames = rawSusp.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
  if (suspectNames.length < 2) {
    return safeReply(interaction, '❌ Mets au moins 2 suspects séparés par des virgules.');
  }

  let members;
  try {
    members = await interaction.guild.members.fetch();
  } catch (err) {
    logger.error('Confession', 'Fetch members failed', err);
    return safeReply(interaction, '❌ Impossible de récupérer les membres. Réessaie.');
  }

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
    return safeReply(interaction, `❌ Membres introuvables : ${notFound.join(', ')}`);
  }

  // Ajouter l'auteur si non-anonyme ou si pas déjà dedans
  if (!suspects.includes(uid)) suspects.push(uid);
  const shuffled = [...suspects].sort(() => Math.random() - 0.5);

  // Stocker en attente d'image (dans le canal DM ou n'importe quel canal)
  PENDING_IMAGE.set(uid, {
    guildId:   gid,
    text,
    suspects:  shuffled,
    channelId: config.secretChannelId,
    anonymous: isAnon,
    authorId:  uid,
    expiresAt: Date.now() + PENDING_TTL,
  });

  // Nettoyage TTL
  setTimeout(() => {
    const p = PENDING_IMAGE.get(uid);
    if (p && p.expiresAt <= Date.now()) PENDING_IMAGE.delete(uid);
  }, PENDING_TTL + 1000);

  try {
    await interaction.reply({
      content: `✅ Super ! Maintenant **envoie une image** depuis ta galerie pour l'ajouter (3 min).\nOu tape \`skip\` pour publier sans image 👀`,
      ephemeral: true,
    });
  } catch (err) {
    logger.error('Confession', 'Reply failed after modal submit', err);
  }
}

// ── Détecter l'image ou "skip" dans n'importe quel canal ──────────────────
async function handlePendingImage(message) {
  const uid     = message.author.id;
  const pending = PENDING_IMAGE.get(uid);
  if (!pending) return false;

  // TTL expiré
  if (Date.now() > pending.expiresAt) {
    PENDING_IMAGE.delete(uid);
    return false;
  }

  const content  = message.content.toLowerCase().trim();
  const isSkip   = content === 'skip';
  const hasImage = message.attachments.some(a =>
    a.contentType?.startsWith('image') ||
    a.contentType?.startsWith('video') ||
    /\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i.test(a.name || '')
  );

  // Ni skip ni image → on laisse passer (user peut encore envoyer)
  if (!isSkip && !hasImage) return false;

  PENDING_IMAGE.delete(uid);

  const imageUrl = hasImage ? message.attachments.first().url : null;

  // Supprimer le message d'image pour garder propre (pas le skip)
  if (hasImage) await message.delete().catch(() => {});

  await publishConfession(message.guild, pending, imageUrl);
  return true;
}

// ── Publier la confession ──────────────────────────────────────────────────
async function publishConfession(guild, { guildId, text, suspects, channelId, anonymous, authorId }, imageUrl) {
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) {
    logger.error('Confession', `Canal ${channelId} introuvable`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.DARK)
    .setTitle('🤫 Confession ' + (anonymous ? 'Anonyme' : ''))
    .setDescription(`> *${text}*`)
    .addFields({
      name: `🕵️ L'auteur est l'un de ces ${suspects.length} membres :`,
      value: suspects.map(id => `<@${id}>`).join(' · '),
    })
    .setFooter({ text: 'Qui a écrit ça ? Votez !' })
    .setTimestamp();

  if (!anonymous) {
    embed.setFooter({ text: `Écrit par ${guild.members.cache.get(authorId)?.displayName || 'quelqu\'un'} • Qui a écrit ça ?` });
  }

  if (imageUrl) embed.setImage(imageUrl);

  // Max 5 boutons
  const row = new ActionRowBuilder().addComponents(
    suspects.slice(0, 5).map((id, i) =>
      new ButtonBuilder()
        .setCustomId(`confession:vote:${id}`)
        .setLabel(['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][i])
        .setStyle(ButtonStyle.Secondary)
    )
  );

  try {
    const msg = await channel.send({ embeds: [embed], components: [row] });
    await Confession.create({
      guildId,
      authorId,
      text,
      suspects,
      messageId: msg.id,
      channelId,
    });
    logger.info('Confession', 'Nouvelle confession publiée');
  } catch (err) {
    logger.error('Confession', 'Publish failed', err);
  }
}

// ── Voter ──────────────────────────────────────────────────────────────────
async function handleVote(interaction, suspectId) {
  await interaction.deferUpdate();
  const uid   = interaction.user.id;
  const msgId = interaction.message.id;

  const confession = await Confession.findOne({ guildId: interaction.guild.id, messageId: msgId });
  if (!confession) {
    return interaction.followUp({ content: '❌ Confession introuvable.', ephemeral: true });
  }

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

// ── Révélation ─────────────────────────────────────────────────────────────
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

function safeReply(interaction, content) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content, ephemeral: true }).catch(() => {});
  }
  return interaction.reply({ content, ephemeral: true }).catch(() => {});
}

module.exports = { openConfessionModal, handleConfessionSubmit, handleVote, handleReveal, handlePendingImage };
