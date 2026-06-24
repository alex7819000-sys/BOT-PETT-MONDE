// src/systems/countingLeaderboard.js — Classement counting (bons chiffres - fautes + bluffs démasqués)
// - Mini-classement posté toutes les 3h dans le salon counting (juste pour suivre l'évolution)
// - Classement final posté chaque jour à minuit : le gagnant reçoit le rôle "Champion du Counting"
//   qui donne +X% d'XP pendant 24h, puis les stats du jour sont remises à zéro.
'use strict';

const { EmbedBuilder } = require('discord.js');
const Config = require('../db/models/Config');
const User = require('../db/models/User');
const { getDailyCountingLeaderboard, resetDailyCountingStats } = require('./counting');
const logger = require('../utils/logger');

function formatBoard(entries, guild) {
  if (!entries.length) return '_Personne n\'a encore participé aujourd\'hui._';
  const medals = ['🥇', '🥈', '🥉'];
  return entries
    .map((e, i) => {
      const tag = medals[i] || `**#${i + 1}**`;
      return `${tag} <@${e.userId}> — **${e.score} pts** (✅ ${e.good} · ❌ ${e.faults} · 🔍 ${e.caught})`;
    })
    .join('\n');
}

// ── Mini-classement intermédiaire (toutes les 3h, pas de bonus attribué) ───
async function postIntermediateLeaderboard(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await Config.findOne({ guildId: guild.id }).lean();
      if (!cfg?.countingChannelId) continue;

      const channel = guild.channels.cache.get(cfg.countingChannelId);
      if (!channel) continue;

      const top = await getDailyCountingLeaderboard(guild.id, 5);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Classement Counting — En direct')
        .setDescription(formatBoard(top, guild))
        .setFooter({ text: 'Score = bons chiffres − fautes + bluffs démasqués · Classement final à minuit' })
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      logger.error('CountingLeaderboard', `Erreur mini-classement (${guild.id})`, err);
    }
  }
}

// ── Classement final quotidien (minuit) — attribue le rôle bonus ───────────
async function postFinalLeaderboardAndCrown(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await Config.findOne({ guildId: guild.id }).lean();
      if (!cfg?.countingChannelId) continue;

      const channel = guild.channels.cache.get(cfg.countingChannelId);
      const top = await getDailyCountingLeaderboard(guild.id, 10);

      const winner = top[0];

      // Retirer le rôle à l'ancien champion (s'il existe encore)
      if (cfg.countingChampionRoleId) {
        const role = guild.roles.cache.get(cfg.countingChampionRoleId);
        if (role) {
          const holders = guild.members.cache.filter((m) => m.roles.cache.has(role.id));
          for (const [, m] of holders) await m.roles.remove(role).catch(() => {});
        }
      }

      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🏆 Classement Counting du jour')
          .setDescription(formatBoard(top, guild))
          .setFooter({ text: 'Score = bons chiffres − fautes + bluffs démasqués' })
          .setTimestamp();

        if (winner && winner.score > 0) {
          embed.addFields({
            name: '👑 Champion du jour',
            value: `<@${winner.userId}> avec **${winner.score} points** !\n` +
              (cfg.countingChampionRoleId
                ? `Reçoit le rôle <@&${cfg.countingChampionRoleId}> → **+${cfg.countingXpBonusPercent || 50}% XP pendant 24h** !`
                : '_(Aucun rôle bonus configuré — utilise `/setup salon` ou le dashboard pour en définir un)_'),
          });
        }

        await channel.send({ embeds: [embed] }).catch(() => {});
      }

      // Donner le rôle + l'expiration au gagnant
      if (winner && winner.score > 0 && cfg.countingChampionRoleId) {
        const role = guild.roles.cache.get(cfg.countingChampionRoleId);
        const member = role ? await guild.members.fetch(winner.userId).catch(() => null) : null;
        if (member && role) {
          await member.roles.add(role).catch(() => {});
          const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await User.updateOne(
            { userId: winner.userId, guildId: guild.id },
            { countingChampionUntil: until },
            { upsert: true }
          );
          logger.info('CountingLeaderboard', `${winner.userId} devient Champion du Counting (${winner.score} pts)`);
        }
      }

      // Reset les stats du jour pour repartir à zéro
      await resetDailyCountingStats(guild.id);
    } catch (err) {
      logger.error('CountingLeaderboard', `Erreur classement final (${guild.id})`, err);
    }
  }
}

// ── Retire le rôle bonus à ceux dont les 24h sont passées ───────────────────
// (sécurité en plus de l'écrasement quotidien — utile si le bonus doit s'arrêter
// avant le prochain classement, ou si le cron de minuit a été manqué un jour)
async function expireCountingChampions(client) {
  const now = new Date();
  const expired = await User.find({ countingChampionUntil: { $lte: now } }).lean();
  for (const u of expired) {
    try {
      const guild = client.guilds.cache.get(u.guildId);
      if (!guild) continue;
      const cfg = await Config.findOne({ guildId: u.guildId }).lean();
      if (cfg?.countingChampionRoleId) {
        const member = await guild.members.fetch(u.userId).catch(() => null);
        if (member) await member.roles.remove(cfg.countingChampionRoleId).catch(() => {});
      }
      await User.updateOne({ userId: u.userId, guildId: u.guildId }, { countingChampionUntil: null });
    } catch (err) {
      logger.error('CountingLeaderboard', `Erreur expiration champion (${u.userId})`, err);
    }
  }
}

// ── Multiplicateur d'XP actif pour un membre (appelé par les systèmes qui donnent de l'XP) ──
async function getCountingXpMultiplier(userId, guildId) {
  const user = await User.findOne({ userId, guildId }).lean();
  if (!user?.countingChampionUntil) return 1;
  if (new Date(user.countingChampionUntil) <= new Date()) return 1;
  const cfg = await Config.findOne({ guildId }).lean();
  const percent = cfg?.countingXpBonusPercent ?? 50;
  return 1 + percent / 100;
}

module.exports = {
  postIntermediateLeaderboard,
  postFinalLeaderboardAndCrown,
  expireCountingChampions,
  getCountingXpMultiplier,
};
