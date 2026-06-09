// src/systems/xp/index.js — Système XP / Niveaux — v5 (notifs level-up)
'use strict';
const User    = require('../../db/models/User');
const logger  = require('../../utils/logger');
const { XP }  = require('../../config/constants');
const { getWeekNumber, getCurrentYear } = require('../../utils/permissions');

function xpForLevel(level) { return 5 * (level ** 2) + 50 * level + 100; }

function getLevelFromXP(totalXp) {
  let level = 0, acc = 0;
  while (true) {
    const needed = xpForLevel(level);
    if (acc + needed > totalXp) return level;
    acc += needed;
    level++;
  }
}

function xpProgress(totalXp) {
  let level = 0, acc = 0;
  while (true) {
    const needed = xpForLevel(level);
    if (acc + needed > totalXp) return { level, current: totalXp - acc, needed };
    acc += needed;
    level++;
  }
}

function buildProgressBar(current, needed, len = 10) {
  const pct   = Math.min(current / needed, 1);
  const filled = Math.round(pct * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

async function getOrCreate(userId, guildId) {
  let user = await User.findOne({ userId, guildId });
  if (!user) user = await User.create({ userId, guildId });
  return user;
}

async function addXP(userId, guildId, amount, message = null) {
  try {
    // ── Sécurité absolue : jamais d'XP pour un bot ───────────────────────
    if (message?.author?.bot) return null;
    if (message?.guild) {
      const member = message.guild.members.cache.get(userId);
      if (member?.user?.bot) return null;
    }

    const week = getWeekNumber();
    const year = getCurrentYear();
    const user = await getOrCreate(userId, guildId);

    // Track messageCount et activeDays
    user.messageCount = (user.messageCount || 0) + 1;
    const today = new Date().toISOString().slice(0, 10);
    if (!user.activeDays) user.activeDays = [];
    if (!user.activeDays.includes(today)) {
      user.activeDays.push(today);
      // Garder 90 jours max
      if (user.activeDays.length > 90) user.activeDays = user.activeDays.slice(-90);
    }

    // Reset hebdo si nouvelle semaine
    if (user.weekNumber !== week || user.weekYear !== year) {
      user.weekXp     = 0;
      user.weekNumber = week;
      user.weekYear   = year;
    }

    // Calcul XP avec bonus
    let xpGain = amount;
    if (user.xpBoostUntil     && user.xpBoostUntil     > new Date()) xpGain *= 2;
    if (user.podiumBoostUntil && user.podiumBoostUntil > new Date()) xpGain = Math.round(xpGain * 1.5);
    if (user.defiXpBoostUntil && user.defiXpBoostUntil > new Date()) xpGain *= 2;

    const oldLevel = user.level;
    user.xp       += xpGain;
    user.totalXp  += xpGain;
    user.weekXp   += xpGain;
    user.level     = getLevelFromXP(user.totalXp);

    // Contribution guilde
    if (user.guildeId) {
      const Guilde = require('../../db/models/Guilde');
      await Guilde.updateOne(
        { guildId, guildeId: user.guildeId },
        { $inc: { totalXp: xpGain, weekXp: xpGain } },
      );
    }

    await user.save();

    const levelUp = user.level > oldLevel;

    // ── Streak journalier ──────────────────────────────────────────────
    if (message) {
      try {
        const Config = require('../../db/models/Config');
        const config = await Config.findOne({ guildId });
        const { updateStreak } = require('../streak');
        await updateStreak(user, message.guild, config || {});
        const { checkMissions } = require('../missions');
        await checkMissions(user, message.guild, null);
      } catch {}
    }

    // ── Notif level-up dans le salon XP ou announce ──────────────────
    if (levelUp && message) {
      try {
        const Config = require('../../db/models/Config');
        const config = await Config.findOne({ guildId });
        const notifChannelId = config?.rankChannelId || config?.announceChannelId;
        const channel = notifChannelId
          ? message.guild?.channels.cache.get(notifChannelId)
          : message.channel;

        if (channel) {
          const { EmbedBuilder } = require('discord.js');
          const prog = xpProgress(user.totalXp);
          const bar  = buildProgressBar(prog.current, prog.needed);

          // ── Rôle par niveau (basé sur totalXp — permanent) ─────────────
          if (config?.levelRoles?.length) {
            const sortedRoles = [...config.levelRoles].sort((a, b) => b.level - a.level);
            const newRoleEntry = sortedRoles.find(r => r.level <= user.level);
            const member = message.guild?.members.cache.get(userId)
              || await message.guild?.members.fetch(userId).catch(() => null);
            if (member && newRoleEntry) {
              for (const r of sortedRoles) {
                if (r.roleId !== newRoleEntry.roleId && member.roles.cache.has(r.roleId)) {
                  await member.roles.remove(r.roleId).catch(() => {});
                }
              }
              if (!member.roles.cache.has(newRoleEntry.roleId)) {
                await member.roles.add(newRoleEntry.roleId).catch(() => {});
              }
            }
          }

          const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🎉 NIVEAU ${user.level} !`)
            .setDescription(
              `<@${userId}> vient de passer **Niveau ${user.level}** ! 🚀\n\n` +
              `\`${bar}\` ${Math.round((prog.current / prog.needed) * 100)}%\n` +
              `**${prog.current}** / **${prog.needed}** XP vers le niveau ${user.level + 1}`
            )
            .setThumbnail(message.author?.displayAvatarURL?.({ size: 128 }))
            .setTimestamp();

          // Ajouter le rôle obtenu dans l'embed
          if (config?.levelRoles?.length) {
            const sortedRoles = [...config.levelRoles].sort((a, b) => b.level - a.level);
            const newRoleEntry = sortedRoles.find(r => r.level <= user.level);
            if (newRoleEntry) {
              const roleObj = message.guild?.roles.cache.get(newRoleEntry.roleId);
              if (roleObj) embed.addFields({ name: '🎖️ Rôle obtenu', value: `${roleObj}`, inline: true });
            }
          }

          const notif = await channel.send({ embeds: [embed] });
          setTimeout(() => notif.delete().catch(() => {}), 15000);
        }

        // ── Mise à jour live board ────────────────────────────────────
        try {
          const Config = require('../../db/models/Config');
          const config2 = config || await Config.findOne({ guildId });
          if (config2?.liveBoardChannelId && config2?.liveBoardMessageId) {
            const { updateLiveBoard } = require('./liveboard');
            await updateLiveBoard(message.guild, config2).catch(() => {});
          }
        } catch {}

      } catch (err) {
        logger.error('XP', 'Level-up notif failed', err);
      }
    }

    return { user, levelUp, newLevel: user.level, xpGain };
  } catch (err) {
    logger.error('XP', 'addXP failed', err);
    return null;
  }
}

async function getTopUsers(guildId, limit = 10, by = 'weekXp') {
  return User.find({ guildId }).sort({ [by]: -1 }).limit(limit);
}

async function getUserRank(userId, guildId, by = 'weekXp') {
  const user = await User.findOne({ userId, guildId });
  if (!user) return null;
  const rank = await User.countDocuments({ guildId, [by]: { $gt: user[by] } });
  return { rank: rank + 1, user };
}

module.exports = { addXP, getOrCreate, getLevelFromXP, xpProgress, buildProgressBar, getTopUsers, getUserRank };
