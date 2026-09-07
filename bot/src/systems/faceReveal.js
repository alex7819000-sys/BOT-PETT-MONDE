// src/systems/faceReveal.js — Face Reveal: thread par image, emoji smash/pass, classement quotidien
'use strict';
const { EmbedBuilder, ChannelType } = require('discord.js');
const Config = require('../db/models/Config');
const FaceReveal = require('../db/models/FaceReveal');
const { COLORS } = require('../config/constants');

async function postFaceReveal(channel, guild, guildId, { imageUrl, authorId, authorName }) {
  try {
    const cfg = await Config.findOne({ guildId }).lean().catch(() => null);
    if (!cfg?.faceRevealChannelId) return null;

    const smashEmoji = cfg?.smashEmoji || '🔥';
    const passEmoji = cfg?.passEmoji || '💀';

    // Poste l'image dans le salon principal
    const embed = new EmbedBuilder()
      .setColor(COLORS.PINK)
      .setTitle(`👤 ${authorName} — Face Reveal`)
      .setImage(imageUrl)
      .setFooter({ text: `${smashEmoji} Smash  |  ${passEmoji} Pass` })
      .setTimestamp();

    const faceChannel = guild.channels.cache.get(cfg.faceRevealChannelId);
    if (!faceChannel) return null;

    const msg = await faceChannel.send({ embeds: [embed] }).catch(() => null);
    if (!msg) return null;

    // Ajoute les réactions
    await msg.react(smashEmoji).catch(() => {});
    await msg.react(passEmoji).catch(() => {});

    // Crée un thread pour les commentaires
    const thread = await msg.startThread({
      name: `👤 ${authorName} — Commentaires`,
      autoArchiveDuration: 1440, // 24h
    }).catch(() => null);

    // Enregistre en DB
    const doc = await FaceReveal.create({
      guildId,
      messageId: msg.id,
      threadId: thread?.id || null,
      imageUrl,
      authorId,
      authorName,
    });

    return { message: msg, thread, doc };
  } catch (err) {
    console.error('Erreur postFaceReveal:', err);
    return null;
  }
}

async function handleReactionAdd(reaction, user, client) {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => null);
    if (!reaction.message.guildId) return;

    const cfg = await Config.findOne({ guildId: reaction.message.guildId }).lean().catch(() => null);
    if (!cfg?.faceRevealChannelId || reaction.message.channelId !== cfg.faceRevealChannelId) return;

    const smashEmoji = cfg?.smashEmoji || '🔥';
    const passEmoji = cfg?.passEmoji || '💀';

    // Vérifie que c'est une des 2 emoji
    if (reaction.emoji.toString() !== smashEmoji && reaction.emoji.toString() !== passEmoji) return;

    // Met à jour le compteur en DB
    const isSmash = reaction.emoji.toString() === smashEmoji;
    const field = isSmash ? 'smashCount' : 'passCount';

    await FaceReveal.findOneAndUpdate(
      { messageId: reaction.message.id },
      { $inc: { [field]: 1 } }
    ).catch(() => null);
  } catch (err) {
    console.error('Erreur handleReactionAdd:', err);
  }
}

async function handleReactionRemove(reaction, user, client) {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => null);
    if (!reaction.message.guildId) return;

    const cfg = await Config.findOne({ guildId: reaction.message.guildId }).lean().catch(() => null);
    if (!cfg?.faceRevealChannelId || reaction.message.channelId !== cfg.faceRevealChannelId) return;

    const smashEmoji = cfg?.smashEmoji || '🔥';
    const passEmoji = cfg?.passEmoji || '💀';

    if (reaction.emoji.toString() !== smashEmoji && reaction.emoji.toString() !== passEmoji) return;

    // Décrémente le compteur
    const isSmash = reaction.emoji.toString() === smashEmoji;
    const field = isSmash ? 'smashCount' : 'passCount';

    await FaceReveal.findOneAndUpdate(
      { messageId: reaction.message.id },
      { $inc: { [field]: -1 } }
    ).catch(() => null);
  } catch (err) {
    console.error('Erreur handleReactionRemove:', err);
  }
}

async function announceDailyWinner(guild, client) {
  try {
    const gid = guild.id;
    const cfg = await Config.findOne({ guildId: gid }).lean().catch(() => null);

    if (!cfg?.announceChannelId) return;

    // Récupère le meilleur face reveal du jour (et non encore annoncé)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const winner = await FaceReveal.findOne({
      guildId: gid,
      createdAt: { $gte: today },
      winnerAnnounced: false,
    })
      .sort({ smashCount: -1 })
      .lean()
      .catch(() => null);

    if (!winner) return; // Aucun face reveal aujourd'hui

    // Marque comme annoncé
    await FaceReveal.findByIdAndUpdate(winner._id, { winnerAnnounced: true }).catch(() => null);

    // Récupère l'utilisateur
    let authorDisplay = winner.authorName;
    if (winner.authorId) {
      try {
        const user = await client.users.fetch(winner.authorId).catch(() => null);
        if (user) authorDisplay = user.username;
      } catch {}
    }

    // Annonce
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle(`🏆 Face Reveal du Jour!`)
      .setDescription(`**${authorDisplay}** a eu le plus de 🔥 smash avec **${winner.smashCount}** votes!\n\nRéagis pour voir les autres propositions du jour.`)
      .setImage(winner.imageUrl)
      .setFooter({ text: `${winner.smashCount} Smash | ${winner.passCount} Pass` })
      .setTimestamp();

    const announceChannel = guild.channels.cache.get(cfg.announceChannelId);
    if (announceChannel) {
      await announceChannel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('Erreur announceDailyWinner:', err);
  }
}

module.exports = {
  postFaceReveal,
  handleReactionAdd,
  handleReactionRemove,
  announceDailyWinner,
};
