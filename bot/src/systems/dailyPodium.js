'use strict';
// systems/dailyPodium.js — Podium quotidien à 00h00
// Affiche les 5 champions de la journée : XP, messages, images, vocal, bumps

const { EmbedBuilder } = require('discord.js');
const User   = require('../db/models/User');
const Config = require('../db/models/Config');
const logger = require('../utils/logger');

// Catégories du podium
const CATEGORIES = [
  { key: 'dailyXp',            emoji: '⭐', label: 'XP du jour',       unit: 'XP' },
  { key: 'messagesDay',        emoji: '💬', label: 'Messages',          unit: 'msgs' },
  { key: 'imagesDay',          emoji: '🖼️', label: 'Images envoyées',  unit: 'images' },
  { key: 'vocalMinutesToday',  emoji: '🎙️', label: 'Temps en vocal',   unit: 'min' },
  { key: 'bumpDay',            emoji: '🚀', label: 'Bumps',             unit: 'bumps' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Poste le podium dans le salon podium (ou annonces en fallback) et reset les compteurs journaliers.
 */
async function postDailyPodium(client) {
  const configs = await Config.find({}).lean();

  for (const cfg of configs) {
    try {
      const guildId = cfg.guildId;
      const guild   = client.guilds.cache.get(guildId);
      if (!guild) continue;

      // Cherche le salon podium (podiumChannelId), ou le salon Trophy Room en fallback
      const channelId = cfg.podiumChannelId || cfg.trophyChannelId;
      if (!channelId) continue;
      const channel = guild.channels.cache.get(channelId);
      if (!channel) continue;

      // Construction de l'embed principal
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Podium du jour')
        .setDescription('Voici les membres les plus actifs d\'aujourd\'hui !')
        .setTimestamp()
        .setFooter({ text: `${guild.name} • Les compteurs ont été remis à zéro`, iconURL: guild.iconURL({ dynamic: true }) });

      const pings = new Set(); // tous les membres à pinger

      for (const cat of CATEGORIES) {
        // Top 3 pour cette catégorie
        const top = await User.find({ guildId, [cat.key]: { $gt: 0 } })
          .sort({ [cat.key]: -1 })
          .limit(3)
          .lean();

        if (!top.length) continue;

        let lines = '';
        for (let i = 0; i < top.length; i++) {
          const u = top[i];
          const medal = MEDALS[i] || `**${i + 1}.**`;
          const val   = u[cat.key];
          lines += `${medal} <@${u.userId}> — **${val} ${cat.unit}**\n`;
          if (i === 0) pings.add(u.userId); // ping uniquement le 1er
        }

        embed.addFields({ name: `${cat.emoji} ${cat.label}`, value: lines.trim(), inline: true });
      }

      // Pas de données aujourd'hui → on skip
      if (!embed.data.fields?.length) continue;

      // Ping des vainqueurs
      const pingStr = [...pings].map(id => `<@${id}>`).join(' ');
      await channel.send({ content: `${pingStr}\n🌙 **Fin de journée !** Voici les champions d'aujourd'hui :`, embeds: [embed] });

      // ── Tips DM aux membres du top (rang + stats perso) ─────────────────
      try {
        const { sendTip, TIPS } = require('./tips');
        const seen = new Set();
        for (const cat of CATEGORIES) {
          const topCat = await User.find({ guildId: cfg.guildId, [cat.key]: { $gt: 0 } })
            .sort({ [cat.key]: -1 }).limit(3).lean().catch(() => []);
          for (let i = 0; i < topCat.length; i++) {
            const u = topCat[i];
            if (seen.has(u.userId)) continue;
            seen.add(u.userId);
            try {
              const member = guild.members.cache.get(u.userId);
              if (member) {
                await member.user.send(
                  TIPS.podiumResult(i + 1, u.dailyXp || 0, u.messagesDay || 0)
                ).catch(() => {});
              }
            } catch { /* DMs fermés */ }
          }
        }
      } catch { /* tips non critiques */ }

      logger.info('DailyPodium', `Podium posté sur ${guild.name}`);
    } catch (err) {
      logger.error('DailyPodium', `Erreur guild ${cfg.guildId}`, err);
    }
  }

  // Reset les compteurs journaliers pour tous les membres
  try {
    await User.updateMany({}, {
      $set: {
        dailyXp: 0,
        messagesDay: 0,
        imagesDay: 0,
        vocalMinutesToday: 0,
        bumpDay: 0,
        reactionsToday: 0,
        invitesToday: 0,
      }
    });
    logger.info('DailyPodium', 'Compteurs journaliers remis à zéro');
  } catch (err) {
    logger.error('DailyPodium', 'Erreur reset compteurs', err);
  }
}

module.exports = { postDailyPodium };
