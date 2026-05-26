// src/systems/xp/index.js — Système XP / Niveaux
'use strict';
const User    = require('../../db/models/User');
const logger  = require('../../utils/logger');
const { XP }  = require('../../config/constants');
const { getWeekNumber, getCurrentYear } = require('../../utils/permissions');

// Formule MEE6
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

async function getOrCreate(userId, guildId) {
  let user = await User.findOne({ userId, guildId });
  if (!user) {
    user = await User.create({ userId, guildId });
  }
  return user;
}

async function addXP(userId, guildId, amount) {
  try {
    const week  = getWeekNumber();
    const year  = getCurrentYear();
    const user  = await getOrCreate(userId, guildId);

    // Reset hebdo si nouvelle semaine
    if (user.weekNumber !== week || user.weekYear !== year) {
      user.weekXp     = 0;
      user.weekNumber = week;
    }

    // Bonus x2 si guilde dominante
    let xpGain = amount;
    if (user.xpBoostUntil && user.xpBoostUntil > new Date()) xpGain *= 2;

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
    return { user, levelUp: user.level > oldLevel, newLevel: user.level };
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

module.exports = { addXP, getOrCreate, getLevelFromXP, xpProgress, getTopUsers, getUserRank };
