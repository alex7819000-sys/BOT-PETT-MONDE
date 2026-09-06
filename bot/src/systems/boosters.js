// src/systems/boosters.js — Embed listant/remerciant les boosters actuels
// (utilisé par /boosters et le cron quotidien), + relance en MP des anciens
// boosters (ceux qui ont arrêté), tant qu'ils n'ont pas re-boosté.
'use strict';

const { EmbedBuilder } = require('discord.js');
const Config = require('../db/models/Config');
const User   = require('../db/models/User');
const logger = require('../utils/logger');

// ── Embed listant tous les boosters actuels ────────────────────────────────
const INTRO_LINES = [
  `vous êtes littéralement nos chouchous no cap, le serveur vit grâce à vous et on oublie pas 💜`,
  `bro vous êtes trop là pour nous 😭💜 merci d'faire vivre ce serveur, vous êtes pas comme les autres fr`,
  `on revient là juste pour dire que vous êtes des goats absolus 💜 boost = amour eternal sur ce serveur`,
  `slay les chéris, vous faites vraiment plaisir, le serveur c'est vous qui le faites vivre istg 💜`,
  `petit rappel que vous êtes nos MVP no debate 💜 on vous aime trop fort`,
  `vous êtes nos piliers fr 💜 sans vous ce serveur serait pas pareil, on vous voit on vous oublie pas`,
  `besoin de dire que vous êtes juste incroyables 💜 vous boostez, vous êtes là, vous existez — merci`,
  `ayo vous êtes nos chouchous officiels du serveur, c'est pas un débat, c'est un fait 💜`,
  `on vous love trop 😭💜 vous faites vivre ce serveur comme personne d'autre, goats certifiés`,
  `shoutout à vous 💜 vous donnez trop de vous pour ce serveur et on capte, merci vraiment`,
];

async function buildBoostersEmbed(guild) {
  await guild.members.fetch().catch(() => {});
  const boosters = [...guild.members.cache.filter(m => m.premiumSince).values()]
    .sort((a, b) => a.premiumSinceTimestamp - b.premiumSinceTimestamp); // les plus fidèles en premier

  const embed = new EmbedBuilder()
    .setColor(0xFF73FA)
    .setTitle('💜 Merci à nos boosters !')
    .setTimestamp();

  if (!boosters.length) {
    embed.setDescription(
      `Personne ne booste **${guild.name}** pour l'instant. 😢\n\n` +
      `Toi aussi tu peux booster ? Un clic sur le nom du serveur en haut à gauche → Booster. 💜`
    );
    return embed;
  }

  const lines = boosters.map(m => `💜 <@${m.id}> — booste depuis <t:${Math.floor(m.premiumSinceTimestamp / 1000)}:R>`);
  const intro = INTRO_LINES[Math.floor(Math.random() * INTRO_LINES.length)];
  embed.setDescription(
    `**${boosters.length} booster${boosters.length > 1 ? 's' : ''}** font vivre ce serveur en ce moment — ${intro}\n\n` +
    lines.join('\n') +
    `\n\nMerci infiniment à eux 🙏💜`
  );
  return embed;
}

// ── Détection de fin de boost (appelé depuis index.js sur guildMemberUpdate) ──
async function handleBoostEnded(member) {
  await User.findOneAndUpdate(
    { userId: member.id, guildId: member.guild.id },
    { boostEndedAt: new Date(), lastExBoosterReminderAt: new Date() },
    { upsert: true }
  );

  const embed = new EmbedBuilder()
    .setColor(0xFF73FA)
    .setTitle('💜 Merci d\'avoir boosté !')
    .setDescription(
      `Ton boost sur **${member.guild.name}** vient de se terminer.\n\n` +
      `Merci infiniment pour ton soutien pendant que ça a duré — ça a vraiment aidé le serveur. 🙏\n\n` +
      `Si jamais tu veux relancer un boost un jour, on serait ravis de te revoir parmi nos boosters ! 💜`
    );
  await member.send({ embeds: [embed] }).catch(() => {});
}

// ── Boost qui reprend : on efface le statut "ex-booster" ──────────────────
async function clearExBoosterStatus(userId, guildId) {
  await User.updateOne({ userId, guildId }, { boostEndedAt: null, lastExBoosterReminderAt: null }).catch(() => {});
}

// ── Cron : relance en MP les anciens boosters, espacée dans le temps ──────
async function sendExBoosterReminders(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await Config.findOne({ guildId: guild.id }).lean();
      const reminderDays = config?.exBoosterReminderDays ?? 21;
      const cutoff = new Date(Date.now() - reminderDays * 24 * 60 * 60 * 1000);

      const candidates = await User.find({
        guildId: guild.id,
        boostEndedAt: { $ne: null },
        lastExBoosterReminderAt: { $lte: cutoff },
      }).lean();

      if (!candidates.length) continue;
      await guild.members.fetch().catch(() => {});

      for (const u of candidates) {
        const member = guild.members.cache.get(u.userId);
        if (!member) continue;           // plus sur le serveur
        if (member.premiumSince) {        // a re-boosté entre-temps (sécurité si l'event a été raté)
          await clearExBoosterStatus(u.userId, guild.id);
          continue;
        }

        const embed = new EmbedBuilder()
          .setColor(0xFF73FA)
          .setTitle('💜 On pense à toi')
          .setDescription(
            `Tu avais boosté **${guild.name}** avant — merci encore pour ça. 🙏\n\n` +
            `Si t'as l'occasion et l'envie, on serait ravis de te revoir parmi nos boosters ! ` +
            `Un clic sur le nom du serveur en haut à gauche → Booster. 💜\n\n` +
            `*(Ce petit rappel revient environ toutes les ${reminderDays} jours tant que t'as pas re-boosté — pas de spam promis 😄)*`
          );
        await member.send({ embeds: [embed] }).catch(() => {});
        await User.updateOne({ userId: u.userId, guildId: guild.id }, { lastExBoosterReminderAt: new Date() }).catch(() => {});
      }

      if (candidates.length) logger.info('Boosters', `${candidates.length} relance(s) ex-booster envoyée(s) sur ${guild.name}`);
    } catch (err) {
      logger.error('Boosters', `Erreur relance ex-boosters (${guild.id})`, err);
    }
  }
}

module.exports = { buildBoostersEmbed, handleBoostEnded, clearExBoosterStatus, sendExBoosterReminders };
