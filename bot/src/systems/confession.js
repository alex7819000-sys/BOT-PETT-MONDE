// src/systems/confession.js — Confessions anonymes avec thread, classement par réactions,
// révélation différée de l'auteur, et XP quotidien pour le top 10 du classement.
'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');
const Confession = require('../db/models/Confession');
const User = require('../db/models/User');
const logger = require('../utils/logger');

// ── Bouton "Faire une confession" — ouvre le modal ──────────────────────────
async function openConfessionModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('confession_submit')
    .setTitle('Confession anonyme')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confession_text')
          .setLabel('Ta confession (anonyme pour le moment)')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1000)
          .setRequired(true)
          .setPlaceholder('Écris ta confession ici...')
      )
    );
  return interaction.showModal(modal);
}

// ── Soumission du modal confession ──────────────────────────────────────────
async function handleConfessionModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const cfg = await Config.findOne({ guildId: gid }).lean();

  const text = interaction.fields.getTextInputValue('confession_text');
  const channelId = cfg?.secretChannelId;

  if (!channelId) return interaction.editReply({ content: '❌ Salon de confession non configuré.' });

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return interaction.editReply({ content: '❌ Salon de confession introuvable.' });

  const revealHours = cfg?.confessionRevealHours ?? 48;
  const revealAt = new Date(Date.now() + revealHours * 60 * 60 * 1000);

  const embed = new EmbedBuilder()
    .setColor(COLORS.DARK)
    .setTitle('🤫 Confession anonyme')
    .setDescription(text)
    .setFooter({ text: `Confession anonyme · 🕵️ L'auteur sera révélé dans ${revealHours}h` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confession:hide').setLabel('🗑️ Masquer').setStyle(ButtonStyle.Secondary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (!msg) return interaction.editReply({ content: '❌ Impossible de publier la confession.' });

  // Thread dédié pour les réactions/commentaires (même pattern que Face Reveal)
  const thread = await msg.startThread({
    name: '🤫 Confession — Réagis ici',
    autoArchiveDuration: 1440,
  }).catch(() => null);

  // Sauvegarde — l'auteur est connu du bot dès le départ (jamais affiché publiquement avant revealAt)
  await Confession.create({
    guildId: gid,
    messageId: msg.id,
    threadId: thread?.id || null,
    channelId: channel.id,
    text,
    authorId: interaction.user.id,
    authorName: interaction.user.username,
    revealAt,
  });

  return interaction.editReply({ content: '✅ Confession publiée anonymement !' });
}

// ── Tracking des réactions (toutes confondues, pas seulement 2 emoji) ───────
async function handleReactionAdd(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  const msg = reaction.message;
  if (!msg?.guildId) return;

  await Confession.findOneAndUpdate(
    { messageId: msg.id },
    { $inc: { reactionCount: 1 } }
  ).catch(() => null);
}

async function handleReactionRemove(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  const msg = reaction.message;
  if (!msg?.guildId) return;

  await Confession.findOneAndUpdate(
    { messageId: msg.id },
    { $inc: { reactionCount: -1 } }
  ).catch(() => null);
}

// ── Révélation publique de l'auteur, après le délai configuré ──────────────
// Appelée par un cron périodique : cherche toutes les confessions dont revealAt est passé
// et qui n'ont pas encore été révélées.
async function processPendingReveals(client) {
  const due = await Confession.find({ isRevealed: false, revealAt: { $lte: new Date() } }).lean();
  for (const conf of due) {
    try {
      const guild = client.guilds.cache.get(conf.guildId);
      if (!guild) { await Confession.updateOne({ _id: conf._id }, { isRevealed: true }); continue; }

      const channel = guild.channels.cache.get(conf.channelId);
      let authorDisplay = conf.authorName;
      try {
        const member = await guild.members.fetch(conf.authorId);
        authorDisplay = member.displayName;
      } catch { /* membre parti, on garde le username sauvegardé */ }

      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(COLORS.GOLD)
          .setTitle('🕵️ Révélation de confession')
          .setDescription(`Cette confession était écrite par... <@${conf.authorId}> (**${authorDisplay}**) !`)
          .addFields({ name: 'La confession', value: conf.text.slice(0, 1000) })
          .setFooter({ text: `${conf.reactionCount} réaction(s) au total` })
          .setTimestamp();

        // Réponse dans le thread si possible (sinon dans le salon), pour garder le contexte
        const target = (conf.threadId && guild.channels.cache.get(conf.threadId)) || channel;
        await target.send({ embeds: [embed] }).catch(() => {});
      }

      await Confession.updateOne({ _id: conf._id }, { isRevealed: true });
      logger.info('Confession', `Révélation : ${conf.authorId} (${conf.reactionCount} réactions)`);
    } catch (err) {
      logger.error('Confession', `Erreur révélation (${conf._id})`, err);
    }
  }
}

// ── Classement permanent + XP quotidien pour le top 10 ──────────────────────
async function getConfessionLeaderboard(guildId, limit = 10) {
  return Confession.find({ guildId }).sort({ reactionCount: -1 }).limit(limit).lean();
}

// Donne l'XP du jour au top 10 (appelé par un cron quotidien).
// Chaque jour, tant qu'une confession reste dans le top 10, son auteur retouche l'XP de son rang.
async function awardDailyConfessionXp(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await Config.findOne({ guildId: guild.id }).lean();
      const xpTable = cfg?.confessionXpTop10 || [1000, 700, 500, 400, 300, 250, 200, 150, 120, 100];

      const top = await getConfessionLeaderboard(guild.id, xpTable.length);
      if (!top.length) continue;

      const lines = [];
      for (let i = 0; i < top.length; i++) {
        const conf = top[i];
        if (conf.reactionCount <= 0) continue; // pas de réaction = pas d'XP
        const xp = xpTable[i] || 0;
        if (!xp) continue;

        await User.findOneAndUpdate(
          { userId: conf.authorId, guildId: guild.id },
          { $inc: { xp, totalXp: xp, weekXp: xp, dailyXp: xp } },
          { upsert: true }
        ).catch(() => {});
        await Confession.updateOne({ _id: conf._id }, { $inc: { xpAwardedDays: 1 } }).catch(() => {});

        const displayName = conf.isRevealed ? `<@${conf.authorId}>` : '*Auteur anonyme*';
        lines.push(`**#${i + 1}** ${displayName} — ${conf.reactionCount} réactions → **+${xp} XP**`);
      }

      const announceChannelId = cfg?.secretChannelId;
      const channel = announceChannelId ? guild.channels.cache.get(announceChannelId) : null;
      if (channel && lines.length) {
        const embed = new EmbedBuilder()
          .setColor(COLORS.GOLD)
          .setTitle('🏆 Classement Confessions — Récompenses du jour')
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Classement permanent par nombre de réactions · Reste dans le top 10 pour continuer à gagner !' })
          .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => {});
      }

      logger.info('Confession', `XP quotidien distribué au top ${lines.length} (${guild.id})`);
    } catch (err) {
      logger.error('Confession', `Erreur XP quotidien confession (${guild.id})`, err);
    }
  }
}

module.exports = {
  openConfessionModal,
  handleConfessionModal,
  handleReactionAdd,
  handleReactionRemove,
  processPendingReveals,
  getConfessionLeaderboard,
  awardDailyConfessionXp,
};
