'use strict';
const { EmbedBuilder } = require('discord.js');
const User = require('../../db/models/User');
const logger = require('../../utils/logger');

function todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// XP bonus selon le streak
function streakBonus(streak) {
  if (streak >= 30) return 50;
  if (streak >= 14) return 30;
  if (streak >= 7)  return 20;
  if (streak >= 3)  return 10;
  return 5;
}

// Appelé à chaque message (via addXP)
async function updateStreak(user, guild, config) {
  try {
    if (!config.streakEnabled) return;

    const today = todayStr();
    const yesterday = yesterdayStr();

    if (user.streakLastDay === today) return; // déjà fait aujourd'hui

    let bonusXp = 0;
    let notify = false;

    if (user.streakLastDay === yesterday) {
      // continuation du streak
      user.streakCurrent += 1;
    } else if (!user.streakLastDay || user.streakLastDay < yesterday) {
      // streak cassé ou nouveau
      if (user.streakCurrent > 0) {
        // streak cassé — on reset silencieusement
        user.streakCurrent = 1;
      } else {
        user.streakCurrent = 1;
      }
    }

    if (user.streakCurrent > user.streakBest) {
      user.streakBest = user.streakCurrent;
    }

    user.streakLastDay = today;
    bonusXp = streakBonus(user.streakCurrent);
    user.totalXp += bonusXp;
    user.xp += bonusXp;

    // Notif si palier atteint
    notify = [3, 7, 14, 30].includes(user.streakCurrent);

    await user.save();

    if (notify) {
      try {
        const member = await guild.members.fetch(user.userId);
        const embed = new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle(`🔥 Streak ${user.streakCurrent} jours !`)
          .setDescription(`Tu es actif depuis **${user.streakCurrent} jours** d'affilée !\n**+${bonusXp} XP King** bonus aujourd'hui.`)
          .setFooter({ text: `Record : ${user.streakBest} jours` });
        await member.send({ embeds: [embed] }).catch(() => {});
      } catch {}
    }
  } catch (err) {
    logger.error('[Streak] updateStreak:', err);
  }
}

module.exports = { updateStreak };
