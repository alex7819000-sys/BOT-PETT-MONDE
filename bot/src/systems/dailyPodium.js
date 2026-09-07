'use strict';
// systems/dailyPodium.js — Podium quotidien à 00h00
// Juste 2 champions : Top 1 Textuel (dailyXp, du texte pur — l'XP vocal n'y est jamais
// ajouté, voir index.js) et Top 1 Vocal (vocalMinutesToday). Chacun affiche aussi son
// nombre de fois n°1 au total (compteur permanent, jamais remis à zéro).

const { EmbedBuilder } = require('discord.js');
const User   = require('../db/models/User');
const Config = require('../db/models/Config');
const logger = require('../utils/logger');

const CATEGORIES = [
  { key: 'dailyXp',           counterField: 'top1TextCount',  roleField: 'podiumTextChampionRoleId',  emoji: '💬', label: 'Top 1 Textuel', unit: 'XP' },
  { key: 'vocalMinutesToday', counterField: 'top1VoiceCount', roleField: 'podiumVoiceChampionRoleId', emoji: '🎙️', label: 'Top 1 Vocal',    unit: 'min' },
];

function ordinal(n) {
  return n === 1 ? '1ère' : `${n}e`;
}

/**
 * Poste le podium dans le salon podium (ou trophy room en fallback) et reset les compteurs journaliers.
 */
async function postDailyPodium(client) {
  const configs = await Config.find({}).lean();

  for (const cfg of configs) {
    try {
      const guildId = cfg.guildId;
      const guild   = client.guilds.cache.get(guildId);
      if (!guild) continue;

      const channelId = cfg.podiumChannelId || cfg.trophyChannelId;
      if (!channelId) continue;
      const channel = guild.channels.cache.get(channelId);
      if (!channel) continue;

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Champions du jour')
        .setTimestamp()
        .setFooter({ text: `${guild.name} • Les compteurs journaliers ont été remis à zéro`, iconURL: guild.iconURL({ dynamic: true }) });

      const pings = new Set();
      const winners = []; // pour les DM de fin (tips)

      for (const cat of CATEGORIES) {
        const winner = await User.findOne({ guildId, [cat.key]: { $gt: 0 } })
          .sort({ [cat.key]: -1 })
          .lean();

        if (!winner) continue;

        // Incrémente son compteur "nombre de fois n°1" et récupère la nouvelle valeur
        const updated = await User.findOneAndUpdate(
          { userId: winner.userId, guildId },
          { $inc: { [cat.counterField]: 1 } },
          { new: true }
        );
        const timesTop1 = updated[cat.counterField] || 1;

        // ── Rôle "Champion" du jour — retiré à l'ancien détenteur, donné au nouveau ──
        let roleLine = '';
        const roleId = cfg[cat.roleField];
        if (roleId) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            const holders = guild.members.cache.filter((m) => m.roles.cache.has(role.id));
            for (const [, m] of holders) {
              if (m.id !== winner.userId) await m.roles.remove(role).catch(() => {});
            }
            const member = await guild.members.fetch(winner.userId).catch(() => null);
            if (member && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(() => {});
            roleLine = `\n${role}`;
          }
        }

        embed.addFields({
          name: `${cat.emoji} ${cat.label}`,
          value: `<@${winner.userId}> — **${winner[cat.key]} ${cat.unit}**\n🎖️ ${ordinal(timesTop1)} fois n°1 !${roleLine}`,
          inline: true,
        });

        pings.add(winner.userId);
        winners.push({ userId: winner.userId, label: cat.label, value: winner[cat.key], unit: cat.unit, timesTop1 });
      }

      if (!embed.data.fields?.length) continue;

      const pingStr = [...pings].map(id => `<@${id}>`).join(' ');
      await channel.send({ content: `${pingStr}\n🌙 **Fin de journée !** Voici les champions d'aujourd'hui :`, embeds: [embed] });

      // ── Tip DM aux 2 champions ────────────────────────────────────────
      try {
        const { TIPS } = require('./tips');
        for (const w of winners) {
          try {
            const member = guild.members.cache.get(w.userId);
            if (member) {
              await member.user.send(TIPS.podiumResult(w.label, w.value, w.unit, w.timesTop1)).catch(() => {});
            }
          } catch { /* DMs fermés */ }
        }
      } catch { /* tips non critiques */ }

      logger.info('DailyPodium', `Podium posté sur ${guild.name}`);
    } catch (err) {
      logger.error('DailyPodium', `Erreur guild ${cfg.guildId}`, err);
    }
  }

  // Reset les compteurs journaliers pour tous les membres (les compteurs "nombre de fois n°1"
  // ne sont PAS touchés ici — ils sont permanents)
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
